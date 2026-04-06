/**
 * AIST System / Integration Readiness Routes
 *
 * Admin-only diagnostic endpoints — safe, no secrets exposed.
 *
 * GET  /api/admin/system/readiness    — integration readiness status
 * GET  /api/admin/system/email-log    — recent email delivery log
 * GET  /api/admin/system/finance-health — finance operations summary
 */

import { Router } from "express";
import { db, ordersTable, refundsTable, invoicesTable, couponsTable, payoutBatchesTable } from "@workspace/db";
import { eq, gte, count, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { getSystemReadiness } from "../config.js";
import { getEmailLog } from "../services/emailService.js";

const router = Router();

// All system routes are admin-only
router.use(requireAuth, requireRole("admin"));

// ---------------------------------------------------------------------------
// GET /api/admin/system/readiness
// ---------------------------------------------------------------------------
router.get("/readiness", (_req, res) => {
  const readiness = getSystemReadiness();
  res.json({ readiness });
});

// ---------------------------------------------------------------------------
// GET /api/admin/system/email-log
// ---------------------------------------------------------------------------
router.get("/email-log", (_req, res) => {
  const log = getEmailLog();
  // Most recent first, limit 100
  const recent = [...log].reverse().slice(0, 100);
  const stats = {
    total: log.length,
    sent: log.filter(e => e.status === "sent").length,
    skipped: log.filter(e => e.status === "skipped").length,
    failed: log.filter(e => e.status === "failed").length,
  };
  res.json({ stats, log: recent });
});

// ---------------------------------------------------------------------------
// GET /api/admin/system/finance-health
// ---------------------------------------------------------------------------
router.get("/finance-health", async (_req, res) => {
  type Rows = Record<string, string>[];
  type DbResult = { rows: Rows };

  const getRows = async (query: ReturnType<typeof sql>) => {
    const result = await db.execute(query);
    return (result as unknown as DbResult).rows?.[0] ?? {};
  };

  const [orders, refunds, invoices, coupons, payouts] = await Promise.all([
    getRows(sql`
      SELECT
        COUNT(*)                                                           AS total_orders,
        COUNT(*) FILTER (WHERE status = 'delivered')                      AS delivered,
        COUNT(*) FILTER (WHERE status = 'cancelled')                      AS cancelled,
        COUNT(*) FILTER (WHERE payment_status = 'requires_capture')       AS pending_capture,
        COUNT(*) FILTER (WHERE payment_status = 'captured')               AS captured,
        COUNT(*) FILTER (WHERE payment_status = 'refunded')               AS refunded,
        COUNT(*) FILTER (WHERE payment_status = 'cancelled')              AS voided,
        COUNT(*) FILTER (WHERE stripe_payment_intent_id IS NOT NULL)      AS stripe_orders,
        COALESCE(SUM(price_czk) FILTER (WHERE status = 'delivered'), 0)   AS total_revenue_czk
      FROM orders
    `),
    getRows(sql`
      SELECT
        COUNT(*)                                                           AS total,
        COUNT(*) FILTER (WHERE status = 'pending')                        AS pending,
        COUNT(*) FILTER (WHERE status = 'approved')                       AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected')                       AS rejected,
        COALESCE(SUM(amount_czk) FILTER (WHERE status = 'approved'), 0)   AS total_approved_czk
      FROM refunds
    `),
    getRows(sql`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE status = 'issued')             AS issued,
        COUNT(*) FILTER (WHERE pdf_url IS NOT NULL)           AS with_pdf,
        COUNT(*) FILTER (WHERE pdf_url IS NULL)               AS without_pdf,
        COALESCE(SUM(amount_czk), 0)                          AS total_amount_czk
      FROM invoices
    `),
    getRows(sql`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE is_active = true)              AS active,
        COUNT(*) FILTER (WHERE is_used = true)                AS used
      FROM coupons
    `),
    getRows(sql`
      SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE status = 'pending')            AS pending,
        COUNT(*) FILTER (WHERE status = 'approved')           AS approved,
        COUNT(*) FILTER (WHERE status = 'executed')           AS executed
      FROM payout_batches
    `),
  ]);

  res.json({ orders, refunds, invoices, coupons, payouts, checkedAt: new Date().toISOString() });
});

export default router;
