/**
 * AIST FinOps API Routes
 *
 * Admin endpoints:
 *   GET  /api/admin/refunds                     — list all refunds
 *   GET  /api/admin/refunds/:orderId            — refunds for order
 *   POST /api/admin/refunds                     — create manual refund
 *   PATCH /api/admin/refunds/:id/approve        — approve pending refund
 *   PATCH /api/admin/refunds/:id/reject         — reject refund
 *
 *   GET  /api/admin/coupons                     — list all coupons
 *   POST /api/admin/coupons                     — issue manual coupon
 *   PATCH /api/admin/coupons/:id/deactivate     — deactivate coupon
 *
 *   GET  /api/admin/invoices                    — list all invoices
 *   GET  /api/admin/invoices/:id                — get invoice
 *   POST /api/admin/invoices/generate/:orderId  — generate invoice for order
 *
 *   GET  /api/admin/payouts                     — list all payout batches
 *   POST /api/admin/payouts/generate            — create weekly payout batch
 *   PATCH /api/admin/payouts/:id/approve        — approve payout batch
 *   GET  /api/admin/payouts/:id/items           — get payout items
 *
 * Customer endpoints:
 *   GET  /api/customer/coupons                  — my available coupons
 *   POST /api/customer/coupons/apply            — apply coupon to order (before creation)
 *   GET  /api/customer/invoices                 — my invoices
 *   GET  /api/customer/invoices/:id/html        — download invoice HTML
 */

import { Router } from "express";
import { db, refundsTable, couponsTable, invoicesTable, payoutBatchesTable, usersTable, ordersTable } from "@workspace/db";
import type { RefundReason, CouponReason, CouponServiceScope, CourierType } from "@workspace/db";
import { eq, and, desc, gt } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { applyRefundDecision, approveRefund, rejectRefund } from "../services/refundEngine.js";
import { issueCoupon, getAvailableCoupons, applyCouponToOrder, deactivateCoupon } from "../services/couponService.js";
import { createInvoiceForOrder, getPDFBuffer, regeneratePDFForInvoice } from "../services/invoiceService.js";
import { getAllPayoutBatches, createPayoutBatch, approvePayoutBatch, getPayoutItems } from "../services/payoutService.js";

// ---------------------------------------------------------------------------
// ADMIN — REFUNDS ROUTER
// ---------------------------------------------------------------------------
export const refundsAdminRouter = Router();

refundsAdminRouter.get("/", requireAuth, requireRole("admin"), async (_req, res) => {
  const refunds = await db.select().from(refundsTable).orderBy(desc(refundsTable.createdAt));
  res.json({ refunds });
});

refundsAdminRouter.get("/:orderId", requireAuth, requireRole("admin"), async (req, res) => {
  const refunds = await db
    .select()
    .from(refundsTable)
    .where(eq(refundsTable.orderId, req.params["orderId"]!));
  res.json({ refunds });
});

refundsAdminRouter.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  const adminId = req.jwtUser!.sub;
  const { orderId, reason, amountCzk, notes } = req.body as {
    orderId: string;
    reason: RefundReason;
    amountCzk?: number;
    notes?: string;
  };

  if (!orderId || !reason) { res.status(400).json({ error: "orderId and reason are required" }); return; }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const refund = await applyRefundDecision({
    order, reason, trigger: "admin_manual",
    customAmountCzk: amountCzk ?? 0,
    adminNotes: notes,
    processedBy: adminId,
  });

  res.status(201).json({ refund });
});

refundsAdminRouter.patch("/:id/approve", requireAuth, requireRole("admin"), async (req, res) => {
  const adminId = req.jwtUser!.sub;
  const refund = await approveRefund(req.params["id"]!, adminId);
  res.json({ refund });
});

refundsAdminRouter.patch("/:id/reject", requireAuth, requireRole("admin"), async (req, res) => {
  const adminId = req.jwtUser!.sub;
  const { notes } = req.body as { notes?: string };
  const refund = await rejectRefund(req.params["id"]!, adminId, notes);
  res.json({ refund });
});

// ---------------------------------------------------------------------------
// ADMIN — COUPONS ROUTER
// ---------------------------------------------------------------------------
export const couponsAdminRouter = Router();

couponsAdminRouter.get("/", requireAuth, requireRole("admin"), async (_req, res) => {
  const coupons = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
  res.json({ coupons });
});

couponsAdminRouter.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  const adminId = req.jwtUser!.sub;
  const { customerId, amountCzk, reason, serviceScope, validDays, notes } = req.body as {
    customerId: string;
    amountCzk: number;
    reason: CouponReason;
    serviceScope?: CouponServiceScope;
    validDays?: number;
    notes?: string;
  };

  if (!customerId || !amountCzk || !reason) {
    res.status(400).json({ error: "customerId, amountCzk, and reason are required" }); return;
  }

  const coupon = await issueCoupon({
    customerId, amountCzk, reason,
    serviceScope: serviceScope ?? "any",
    validDays: validDays ?? 365,
    notes,
    issuedBy: adminId,
  });

  res.status(201).json({ coupon });
});

couponsAdminRouter.patch("/:id/deactivate", requireAuth, requireRole("admin"), async (req, res) => {
  await deactivateCoupon(req.params["id"]!);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// ADMIN — INVOICES ROUTER
// ---------------------------------------------------------------------------
export const invoicesAdminRouter = Router();

invoicesAdminRouter.get("/", requireAuth, requireRole("admin"), async (_req, res) => {
  const invoices = await db.select().from(invoicesTable).orderBy(desc(invoicesTable.createdAt));
  res.json({ invoices });
});

invoicesAdminRouter.get("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.id, req.params["id"]!));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json({ invoice });
});

invoicesAdminRouter.post("/generate/:orderId", requireAuth, requireRole("admin"), async (req, res) => {
  const invoice = await createInvoiceForOrder(req.params["orderId"]!);
  if (!invoice) { res.status(404).json({ error: "Order not found or invoice generation failed" }); return; }
  res.status(201).json({ invoice });
});

// GET /admin/invoices/:id/pdf — download invoice as PDF (admin)
invoicesAdminRouter.get("/:id/pdf", requireAuth, requireRole("admin"), async (req, res) => {
  const pdfBuffer = await getPDFBuffer(req.params["id"]!, "", true);
  if (!pdfBuffer) { res.status(404).json({ error: "Invoice not found" }); return; }

  const [invoice] = await db.select({ invoiceNumber: invoicesTable.invoiceNumber })
    .from(invoicesTable).where(eq(invoicesTable.id, req.params["id"]!));

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${invoice?.invoiceNumber ?? "invoice"}.pdf"`);
  res.end(pdfBuffer);
});

// POST /admin/invoices/:id/regenerate-pdf — force re-generate PDF
invoicesAdminRouter.post("/:id/regenerate-pdf", requireAuth, requireRole("admin"), async (req, res) => {
  const pdfUrl = await regeneratePDFForInvoice(req.params["id"]!);
  if (!pdfUrl) { res.status(404).json({ error: "Invoice not found" }); return; }
  res.json({ ok: true, pdfUrl: pdfUrl.startsWith("data:") ? "[base64 stored]" : pdfUrl });
});

// ---------------------------------------------------------------------------
// ADMIN — PAYOUTS ROUTER
// ---------------------------------------------------------------------------
export const payoutsAdminRouter = Router();

payoutsAdminRouter.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  const { status } = req.query as { status?: string };
  const batches = await getAllPayoutBatches(status);
  res.json({ batches });
});

payoutsAdminRouter.post("/generate", requireAuth, requireRole("admin"), async (req, res) => {
  const { courierId, courierType, periodStart, periodEnd, payoutMethod } = req.body as {
    courierId: string;
    courierType: CourierType;
    periodStart: string;
    periodEnd: string;
    payoutMethod?: "stripe_connect" | "bank_transfer" | "cash";
  };

  if (!courierId || !courierType || !periodStart || !periodEnd) {
    res.status(400).json({ error: "courierId, courierType, periodStart, periodEnd are required" }); return;
  }

  const batch = await createPayoutBatch({
    courierId, courierType,
    periodStart: new Date(periodStart),
    periodEnd: new Date(periodEnd),
    payoutMethod: payoutMethod ?? "bank_transfer",
  });

  res.status(201).json({ batch });
});

payoutsAdminRouter.patch("/:id/approve", requireAuth, requireRole("admin"), async (req, res) => {
  const adminId = req.jwtUser!.sub;
  const batch = await approvePayoutBatch(req.params["id"]!, adminId);
  res.json({ batch });
});

payoutsAdminRouter.get("/:id/items", requireAuth, requireRole("admin"), async (req, res) => {
  const items = await getPayoutItems(req.params["id"]!);
  res.json({ items });
});

// ---------------------------------------------------------------------------
// CUSTOMER — COUPONS ROUTER
// ---------------------------------------------------------------------------
export const couponsCustomerRouter = Router();

couponsCustomerRouter.get("/", requireAuth, async (req, res) => {
  const userId = req.jwtUser!.sub;
  const coupons = await getAvailableCoupons(userId);
  res.json({ coupons });
});

// Validate coupon before applying (returns discount amount)
couponsCustomerRouter.post("/validate", requireAuth, async (req, res) => {
  const userId = req.jwtUser!.sub;
  const { couponId, serviceType, subtotal } = req.body as {
    couponId: string;
    serviceType: "flash" | "cargo" | "bfm";
    subtotal: number;
  };
  if (!couponId || !serviceType) { res.status(400).json({ error: "couponId and serviceType required" }); return; }

  // Don't actually consume — just return preview
  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.id, couponId));
  if (!coupon || coupon.customerId !== userId) { res.status(404).json({ valid: false, error: "Coupon not found" }); return; }
  if (coupon.isUsed || !coupon.isActive) { res.json({ valid: false, error: "Coupon is not available" }); return; }
  if (new Date(coupon.validUntil) < new Date()) { res.json({ valid: false, error: "Coupon expired" }); return; }
  if (coupon.serviceScope !== "any" && coupon.serviceScope !== serviceType) {
    res.json({ valid: false, error: `Coupon only valid for ${coupon.serviceScope}` }); return;
  }

  const discountAmountCzk = Math.min(coupon.amountCzk, subtotal ?? 0);
  res.json({ valid: true, couponId, discountAmountCzk, amountCzk: coupon.amountCzk, reason: coupon.reason });
});

// ---------------------------------------------------------------------------
// CUSTOMER — INVOICES ROUTER
// ---------------------------------------------------------------------------
export const invoicesCustomerRouter = Router();

invoicesCustomerRouter.get("/", requireAuth, async (req, res) => {
  const userId = req.jwtUser!.sub;
  const invoices = await db
    .select()
    .from(invoicesTable)
    .where(eq(invoicesTable.customerId, userId))
    .orderBy(desc(invoicesTable.createdAt));
  res.json({ invoices: invoices.map((inv) => ({ ...inv, htmlContent: undefined })) });
});

invoicesCustomerRouter.get("/:id/html", requireAuth, async (req, res) => {
  const userId = req.jwtUser!.sub;
  const [invoice] = await db
    .select()
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, req.params["id"]!), eq(invoicesTable.customerId, userId)));

  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (!invoice.htmlContent) { res.status(404).json({ error: "Invoice HTML not generated yet" }); return; }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(invoice.htmlContent);
});

// GET /customer/invoices/:id/pdf — download invoice as PDF
invoicesCustomerRouter.get("/:id/pdf", requireAuth, async (req, res) => {
  const userId = req.jwtUser!.sub;
  const pdfBuffer = await getPDFBuffer(req.params["id"]!, userId, false);
  if (!pdfBuffer) { res.status(404).json({ error: "Invoice not found" }); return; }

  const [invoice] = await db.select({ invoiceNumber: invoicesTable.invoiceNumber })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, req.params["id"]!), eq(invoicesTable.customerId, userId)));

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${invoice?.invoiceNumber ?? "invoice"}.pdf"`);
  res.end(pdfBuffer);
});
