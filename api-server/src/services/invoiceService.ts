/**
 * AIST Invoice Service
 *
 * Faktura generation for AIST (OSVČ, neplátce DPH).
 * Sequential invoice numbering: AIST-2026-000001
 * No VAT rows — AIST is neplátce DPH in beta phase.
 *
 * Foundation ready for:
 *   - S3/R2 PDF storage
 *   - email delivery
 *   - courier faktura flow (OSVČ → AIST)
 */

import { db, invoicesTable, invoiceSequenceTable, ordersTable, usersTable } from "@workspace/db";
import type { Order, InvoiceMetadata, InvoiceLineItem } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { generateInvoicePDF, storePDF } from "./pdfService.js";

// AIST OSVČ details (beta phase)
const AIST_SUPPLIER = {
  name: "AIST Delivery",
  ico: "21992819",
  address: "Praha, Česká republika",
  vatNote: "Nejsme plátci DPH — neplátce DPH dle § 6 zákona č. 235/2004 Sb.",
};

// ---------------------------------------------------------------------------
// Invoice number generation (sequential, no gaps)
// ---------------------------------------------------------------------------
export async function getNextInvoiceNumber(year: number): Promise<string> {
  // Upsert current year row and atomically increment
  await db
    .insert(invoiceSequenceTable)
    .values({ id: 1, nextNumber: 1, year })
    .onConflictDoNothing();

  // If year changed, reset counter
  const [row] = await db.select().from(invoiceSequenceTable).where(eq(invoiceSequenceTable.id, 1));
  if (!row) throw new Error("Invoice sequence table missing");

  if (row.year !== year) {
    await db.update(invoiceSequenceTable).set({ year, nextNumber: 2 }).where(eq(invoiceSequenceTable.id, 1));
    return `AIST-${year}-000001`;
  }

  const seq = row.nextNumber;
  await db.update(invoiceSequenceTable).set({ nextNumber: seq + 1 }).where(eq(invoiceSequenceTable.id, 1));
  return `AIST-${year}-${String(seq).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Build invoice data from order
// ---------------------------------------------------------------------------
export async function buildInvoiceDataFromOrder(orderId: string): Promise<{
  invoiceNumber: string;
  metadata: InvoiceMetadata;
  amountCzk: number;
  lineItems: InvoiceLineItem[];
} | null> {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return null;

  const [customer] = await db.select().from(usersTable).where(eq(usersTable.id, order.customerId));
  if (!customer) return null;

  const year = new Date().getFullYear();
  const invoiceNumber = await getNextInvoiceNumber(year);

  const serviceLabel: Record<string, string> = {
    flash: "Flash Express — doručení",
    window: "Cargo Window — plánované doručení",
    cargo: "Cargo Window — doručení zásilky",
    buy: "Buy For Me — nákup a doručení",
  };

  const lineItems: InvoiceLineItem[] = [
    {
      description: serviceLabel[order.category] ?? "Doručovací služba AIST",
      quantity: 1,
      unitPrice: order.priceCzk,
      totalPrice: order.priceCzk,
    },
  ];

  if (order.discountAmountCzk && order.discountAmountCzk > 0) {
    lineItems.push({
      description: `Sleva (${order.promoCodeUsed ?? "promo"})`,
      quantity: 1,
      unitPrice: -order.discountAmountCzk,
      totalPrice: -order.discountAmountCzk,
    });
  }

  const totalAmount = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);

  const metadata: InvoiceMetadata = {
    supplierName: AIST_SUPPLIER.name,
    supplierIco: AIST_SUPPLIER.ico,
    supplierAddress: AIST_SUPPLIER.address,
    customerName: customer.name,
    customerEmail: customer.email,
    lineItems,
    vatNote: AIST_SUPPLIER.vatNote,
    paymentMethod: "Platba předem / karta",
  };

  return { invoiceNumber, metadata, amountCzk: Math.max(0, totalAmount), lineItems };
}

// ---------------------------------------------------------------------------
// Render invoice HTML (foundation — upgrade to PDF later)
// ---------------------------------------------------------------------------
export function renderInvoiceHtml(
  invoiceNumber: string,
  issueDate: Date,
  metadata: InvoiceMetadata,
  amountCzk: number,
): string {
  const formatDate = (d: Date) => d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit", year: "numeric" });
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + 14);

  const lineItemsHtml = metadata.lineItems
    .map(
      (item) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee;">${item.description}</td>
      <td style="text-align:center;border-bottom:1px solid #eee;">${item.quantity}</td>
      <td style="text-align:right;border-bottom:1px solid #eee;">${item.unitPrice} CZK</td>
      <td style="text-align:right;border-bottom:1px solid #eee;">${item.totalPrice} CZK</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><title>Faktura ${invoiceNumber}</title>
<style>
  body{font-family:Arial,sans-serif;color:#222;max-width:800px;margin:40px auto;padding:0 24px}
  h1{color:#1762FF;font-size:24px;margin-bottom:4px}
  .meta{display:flex;justify-content:space-between;margin:24px 0}
  .box{background:#f8f9fa;padding:16px;border-radius:8px;min-width:220px}
  table{width:100%;border-collapse:collapse;margin:24px 0}
  th{text-align:left;padding:8px 0;border-bottom:2px solid #1762FF;color:#1762FF;font-size:13px}
  .total{font-size:20px;font-weight:bold;text-align:right;padding:16px 0;color:#1762FF}
  .note{font-size:12px;color:#666;margin-top:24px;border-top:1px solid #eee;padding-top:16px}
  .badge{display:inline-block;background:#1762FF;color:white;padding:4px 12px;border-radius:16px;font-size:12px;font-weight:bold}
</style></head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div><h1>🦢 AIST Delivery</h1><span class="badge">FAKTURA</span></div>
    <div style="text-align:right">
      <div style="font-size:22px;font-weight:bold">${invoiceNumber}</div>
      <div style="color:#666;font-size:13px">Datum vystavení: ${formatDate(issueDate)}</div>
      <div style="color:#666;font-size:13px">Datum splatnosti: ${formatDate(dueDate)}</div>
    </div>
  </div>
  <div class="meta">
    <div class="box">
      <div style="font-size:11px;color:#888;margin-bottom:4px">DODAVATEL</div>
      <strong>${metadata.supplierName}</strong><br>
      IČ: ${metadata.supplierIco}<br>
      ${metadata.supplierAddress}
    </div>
    <div class="box">
      <div style="font-size:11px;color:#888;margin-bottom:4px">ODBĚRATEL</div>
      <strong>${metadata.customerName}</strong><br>
      ${metadata.customerEmail}
    </div>
  </div>
  <table>
    <thead><tr>
      <th>Popis</th><th style="text-align:center">Množství</th>
      <th style="text-align:right">Cena/ks</th><th style="text-align:right">Celkem</th>
    </tr></thead>
    <tbody>${lineItemsHtml}</tbody>
  </table>
  <div class="total">Celkem k úhradě: ${amountCzk} CZK</div>
  <div class="note">
    ${metadata.vatNote}<br>
    Způsob platby: ${metadata.paymentMethod}
  </div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Create invoice record in DB (with PDF generation)
// ---------------------------------------------------------------------------
export async function createInvoiceForOrder(orderId: string): Promise<typeof invoicesTable.$inferSelect | null> {
  // Don't create duplicate invoices for same order
  const [existing] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.orderId, orderId));
  if (existing) return existing;

  const data = await buildInvoiceDataFromOrder(orderId);
  if (!data) return null;

  const issueDate = new Date();
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + 14);

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));

  const htmlContent = renderInvoiceHtml(
    data.invoiceNumber,
    issueDate,
    data.metadata,
    data.amountCzk,
  );

  // Generate real PDF using pdfkit
  let pdfUrl: string | null = null;
  try {
    const pdfBuffer = await generateInvoicePDF({
      invoiceNumber: data.invoiceNumber,
      issueDate,
      dueDate,
      metadata: data.metadata,
      amountCzk: data.amountCzk,
    });
    // Try to store; if no storage configured, returns null
    pdfUrl = await storePDF(data.invoiceNumber, pdfBuffer);
    if (!pdfUrl) {
      // Store as base64 data URI so it can be served directly (beta fallback)
      pdfUrl = `data:application/pdf;base64,${pdfBuffer.toString("base64")}`;
    }
  } catch (err) {
    console.warn(`[Invoice] PDF generation failed for ${orderId}:`, err instanceof Error ? err.message : String(err));
  }

  const [invoice] = await db
    .insert(invoicesTable)
    .values({
      invoiceNumber: data.invoiceNumber,
      invoiceType: "customer_delivery",
      status: "issued",
      orderId,
      customerId: order?.customerId ?? null,
      amountCzk: data.amountCzk,
      currency: "CZK",
      issueDate,
      taxableDate: issueDate,
      dueDate,
      htmlContent,
      pdfUrl,
      metadata: data.metadata,
    })
    .returning();

  return invoice!;
}

// ---------------------------------------------------------------------------
// Regenerate PDF for existing invoice
// ---------------------------------------------------------------------------
export async function regeneratePDFForInvoice(invoiceId: string): Promise<string | null> {
  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!invoice || !invoice.metadata) return null;

  const issueDate = new Date(invoice.issueDate);
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : undefined;

  const pdfBuffer = await generateInvoicePDF({
    invoiceNumber: invoice.invoiceNumber,
    issueDate,
    dueDate,
    metadata: invoice.metadata,
    amountCzk: invoice.amountCzk,
  });

  let pdfUrl = await storePDF(invoice.invoiceNumber, pdfBuffer);
  if (!pdfUrl) {
    pdfUrl = `data:application/pdf;base64,${pdfBuffer.toString("base64")}`;
  }

  await db.update(invoicesTable).set({ pdfUrl, updatedAt: new Date() }).where(eq(invoicesTable.id, invoiceId));
  return pdfUrl;
}

// ---------------------------------------------------------------------------
// Get PDF buffer for direct download
// ---------------------------------------------------------------------------
export async function getPDFBuffer(invoiceId: string, userId: string, isAdmin = false): Promise<Buffer | null> {
  const rows = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  const invoice = rows[0];

  if (!invoice || !invoice.metadata) return null;
  // If not admin, verify ownership
  if (!isAdmin && invoice.customerId !== userId) return null;

  const issueDate = new Date(invoice.issueDate);
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : undefined;

  return generateInvoicePDF({
    invoiceNumber: invoice.invoiceNumber,
    issueDate,
    dueDate,
    metadata: invoice.metadata,
    amountCzk: invoice.amountCzk,
  });
}
