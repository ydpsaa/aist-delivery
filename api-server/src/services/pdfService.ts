/**
 * AIST PDF Service
 *
 * Generates PDF invoices (faktury) using pdfkit — pure Node.js, no Chromium needed.
 * AIST is OSVČ, neplátce DPH — no VAT rows, IČ shown, correct Czech faktura format.
 *
 * Storage abstraction:
 *   - Beta: stores PDF as Buffer, returned directly to client
 *   - Production: wire to S3/R2 via STORAGE_BUCKET_URL env var
 *
 * ENV VARS (optional for production storage):
 *   STORAGE_BUCKET_URL    — S3/R2 bucket base URL
 *   STORAGE_ACCESS_KEY    — S3/R2 access key
 *   STORAGE_SECRET_KEY    — S3/R2 secret key
 */

import crypto from "crypto";
import PDFDocument from "pdfkit";
import { PassThrough } from "stream";
import type { InvoiceMetadata } from "@workspace/db";

// AIST brand colors
const AIST_BLUE = "#1762FF";

// ---------------------------------------------------------------------------
// Core PDF generation
// ---------------------------------------------------------------------------
export interface InvoicePDFInput {
  invoiceNumber: string;
  issueDate: Date;
  dueDate?: Date;
  metadata: InvoiceMetadata;
  amountCzk: number;
}

export async function generateInvoicePDF(input: InvoicePDFInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const buffers: Buffer[] = [];
    const passThrough = new PassThrough();

    doc.pipe(passThrough);
    passThrough.on("data", (chunk) => buffers.push(chunk));
    passThrough.on("end", () => resolve(Buffer.concat(buffers)));
    passThrough.on("error", reject);

    const formatDate = (d: Date) => {
      const day = d.getDate().toString().padStart(2, "0");
      const month = (d.getMonth() + 1).toString().padStart(2, "0");
      const year = d.getFullYear();
      return `${day}.${month}.${year}`;
    };

    const PAGE_WIDTH = 595.28;
    const PAGE_HEIGHT = 841.89;
    const MARGIN = 50;
    const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

    // -----------------------------------------------------------------------
    // HEADER — Blue bar
    // -----------------------------------------------------------------------
    doc.rect(0, 0, PAGE_WIDTH, 80).fill(AIST_BLUE);

    doc.fillColor("white").fontSize(22).font("Helvetica-Bold")
      .text("AIST Delivery", MARGIN, 20, { width: CONTENT_WIDTH });

    doc.fillColor("white").fontSize(10).font("Helvetica")
      .text("AIST Delivery · IČ: 21992819 · Praha", MARGIN, 46, { width: CONTENT_WIDTH });

    // FAKTURA badge
    doc.rect(PAGE_WIDTH - MARGIN - 100, 15, 100, 28).fill("rgba(255,255,255,0.2)").stroke();
    doc.fillColor("white").fontSize(12).font("Helvetica-Bold")
      .text("FAKTURA", PAGE_WIDTH - MARGIN - 92, 22);

    // -----------------------------------------------------------------------
    // INVOICE INFO BLOCK
    // -----------------------------------------------------------------------
    doc.fillColor("#222").fontSize(18).font("Helvetica-Bold")
      .text(input.invoiceNumber, MARGIN, 100);

    // Issue date / due date
    doc.fillColor("#666").fontSize(10).font("Helvetica")
      .text(`Datum vystavení: ${formatDate(input.issueDate)}`, MARGIN, 124)
      .text(`Datum splatnosti: ${input.dueDate ? formatDate(input.dueDate) : "—"}`, MARGIN, 138);

    // Taxable date
    doc.fillColor("#666").fontSize(9)
      .text(`Datum DUZP: ${formatDate(input.issueDate)}`, MARGIN, 152);

    // -----------------------------------------------------------------------
    // SUPPLIER + CUSTOMER
    // -----------------------------------------------------------------------
    const BOX_Y = 175;
    const BOX_W = (CONTENT_WIDTH - 20) / 2;

    // Supplier box
    doc.rect(MARGIN, BOX_Y, BOX_W, 80).fill("#F0F4FF").stroke("#D0DCFF");
    doc.fillColor("#444").fontSize(8).font("Helvetica-Bold")
      .text("DODAVATEL", MARGIN + 12, BOX_Y + 10);
    doc.fillColor("#222").fontSize(10).font("Helvetica-Bold")
      .text(input.metadata.supplierName, MARGIN + 12, BOX_Y + 22);
    doc.fillColor("#555").fontSize(9).font("Helvetica")
      .text(`IČ: ${input.metadata.supplierIco}`, MARGIN + 12, BOX_Y + 37)
      .text(input.metadata.supplierAddress, MARGIN + 12, BOX_Y + 50);

    // Customer box
    const CUST_X = MARGIN + BOX_W + 20;
    doc.rect(CUST_X, BOX_Y, BOX_W, 80).fill("#F9FAFB").stroke("#E5E7EB");
    doc.fillColor("#444").fontSize(8).font("Helvetica-Bold")
      .text("ODBĚRATEL", CUST_X + 12, BOX_Y + 10);
    doc.fillColor("#222").fontSize(10).font("Helvetica-Bold")
      .text(input.metadata.customerName, CUST_X + 12, BOX_Y + 22);
    doc.fillColor("#555").fontSize(9).font("Helvetica")
      .text(input.metadata.customerEmail, CUST_X + 12, BOX_Y + 37);

    // -----------------------------------------------------------------------
    // LINE ITEMS TABLE
    // -----------------------------------------------------------------------
    const TABLE_Y = BOX_Y + 100;

    // Table header
    doc.rect(MARGIN, TABLE_Y, CONTENT_WIDTH, 22).fill(AIST_BLUE);
    doc.fillColor("white").fontSize(9).font("Helvetica-Bold")
      .text("Popis", MARGIN + 8, TABLE_Y + 6, { width: 250 })
      .text("Ks", MARGIN + 300, TABLE_Y + 6, { width: 40, align: "center" })
      .text("Cena/ks", MARGIN + 360, TABLE_Y + 6, { width: 80, align: "right" })
      .text("Celkem", MARGIN + 440, TABLE_Y + 6, { width: 95, align: "right" });

    // Line items
    let rowY = TABLE_Y + 22;
    let oddRow = false;

    for (const item of input.metadata.lineItems) {
      const rowH = 24;
      if (oddRow) doc.rect(MARGIN, rowY, CONTENT_WIDTH, rowH).fill("#F8F9FF").stroke();
      oddRow = !oddRow;

      const isNegative = item.totalPrice < 0;
      doc.fillColor(isNegative ? "#DC2626" : "#222").fontSize(9).font("Helvetica")
        .text(item.description, MARGIN + 8, rowY + 7, { width: 250 })
        .text(String(item.quantity), MARGIN + 300, rowY + 7, { width: 40, align: "center" })
        .text(`${item.unitPrice} CZK`, MARGIN + 360, rowY + 7, { width: 80, align: "right" })
        .text(`${item.totalPrice} CZK`, MARGIN + 440, rowY + 7, { width: 95, align: "right" });

      rowY += rowH;
    }

    // Totals row
    doc.moveTo(MARGIN, rowY).lineTo(MARGIN + CONTENT_WIDTH, rowY).strokeColor("#D0DCFF").lineWidth(1).stroke();
    rowY += 8;

    doc.fillColor(AIST_BLUE).fontSize(14).font("Helvetica-Bold")
      .text(`Celkem k úhradě: ${input.amountCzk} CZK`, MARGIN, rowY, { align: "right", width: CONTENT_WIDTH });

    rowY += 30;

    // -----------------------------------------------------------------------
    // VAT NOTE (neplátce DPH)
    // -----------------------------------------------------------------------
    doc.rect(MARGIN, rowY, CONTENT_WIDTH, 32).fill("#FFFBEB").stroke("#FEF08A");
    doc.fillColor("#92400E").fontSize(9).font("Helvetica")
      .text(input.metadata.vatNote, MARGIN + 8, rowY + 8, { width: CONTENT_WIDTH - 16 });

    rowY += 45;

    // Payment method
    doc.fillColor("#555").fontSize(9).font("Helvetica")
      .text(`Způsob platby: ${input.metadata.paymentMethod}`, MARGIN, rowY);

    // -----------------------------------------------------------------------
    // FOOTER
    // -----------------------------------------------------------------------
    doc.rect(0, PAGE_HEIGHT - 40, PAGE_WIDTH, 40).fill(AIST_BLUE);
    doc.fillColor("white").fontSize(8).font("Helvetica")
      .text("AIST Delivery · IČ: 21992819 · Praha, Česká republika · neplátce DPH",
        MARGIN, PAGE_HEIGHT - 26, { align: "center", width: CONTENT_WIDTH });

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Storage abstraction — S3/R2 via AWS Signature V4 (no SDK required)
//
// ENV VARS:
//   STORAGE_BUCKET_URL    — full bucket endpoint, e.g. https://<id>.r2.cloudflarestorage.com/invoices
//                           or  https://s3.eu-central-1.amazonaws.com/my-bucket
//   STORAGE_ACCESS_KEY    — AWS/R2 access key ID
//   STORAGE_SECRET_KEY    — AWS/R2 secret access key
//   STORAGE_REGION        — region string (default: "auto" for R2, "eu-central-1" for S3)
// ---------------------------------------------------------------------------

const STORAGE_URL = process.env["STORAGE_BUCKET_URL"];
const STORAGE_ACCESS_KEY = process.env["STORAGE_ACCESS_KEY"];
const STORAGE_SECRET_KEY = process.env["STORAGE_SECRET_KEY"];
const STORAGE_REGION = process.env["STORAGE_REGION"] ?? "auto";

function hmac(key: Buffer | string, data: string, encoding?: "hex"): Buffer | string {
  const result = crypto.createHmac("sha256", key).update(data, "utf8");
  return encoding ? result.digest(encoding) : result.digest();
}

function sha256hex(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function makeSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac("AWS4" + secretKey, dateStamp) as Buffer;
  const kRegion = hmac(kDate, region) as Buffer;
  const kService = hmac(kRegion, service) as Buffer;
  const kSigning = hmac(kService, "aws4_request") as Buffer;
  return kSigning;
}

async function s3Put(objectUrl: string, body: Buffer, contentType: string): Promise<void> {
  if (!STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY) {
    throw new Error("STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY are required for storage upload");
  }

  const url = new URL(objectUrl);
  const host = url.hostname;
  const path = url.pathname;
  const service = "s3";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256hex(body);
  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "PUT",
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${STORAGE_REGION}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join("\n");

  const signingKey = makeSigningKey(STORAGE_SECRET_KEY, dateStamp, STORAGE_REGION, service);
  const signature = hmac(signingKey, stringToSign, "hex") as string;

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${STORAGE_ACCESS_KEY}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(objectUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Host": host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      "Authorization": authorization,
      "Content-Length": String(body.byteLength),
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.status.toString());
    throw new Error(`S3 PUT failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

export async function storePDF(invoiceNumber: string, pdfBuffer: Buffer): Promise<string | null> {
  if (!STORAGE_URL) {
    console.info(`[PDF] Storage not configured — ${invoiceNumber}.pdf generated in-memory only`);
    return null;
  }

  const objectUrl = `${STORAGE_URL.replace(/\/$/, "")}/invoices/${invoiceNumber}.pdf`;

  try {
    await s3Put(objectUrl, pdfBuffer, "application/pdf");
    console.info(`[PDF] Uploaded ${invoiceNumber}.pdf → ${objectUrl}`);
    return objectUrl;
  } catch (err) {
    console.error(`[PDF] Upload failed for ${invoiceNumber}:`, err);
    return null;
  }
}

export function storageStatus() {
  return { configured: !!STORAGE_URL, bucket: STORAGE_URL ?? null };
}
