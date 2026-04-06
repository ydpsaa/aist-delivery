/**
 * AIST Background Job Foundation
 *
 * Job registry with entry points for all scheduled tasks.
 * In beta phase: jobs called manually or on order events.
 * Next phase: wire to a real scheduler (cron / pg_cron / BullMQ / etc.)
 *
 * All jobs are idempotent.
 */

import { db, ordersTable, refundsTable, couponsTable } from "@workspace/db";
import { eq, and, inArray, lt, isNull, sql } from "drizzle-orm";
import { applyRefundDecision } from "./refundEngine.js";
import { expireOldCoupons } from "./couponService.js";
import { createInvoiceForOrder } from "./invoiceService.js";
import { createPayoutBatch } from "./payoutService.js";
import { sendDeliveryConfirmation, sendRefundNotification, sendCourierWeeklyStatement } from "./emailService.js";
import { usersTable } from "@workspace/db";

// ---------------------------------------------------------------------------
// SLA Refund Checker
// ---------------------------------------------------------------------------
/**
 * Checks for SLA breaches on delivered/cancelled orders and
 * creates refund records for any unhandled cases.
 * Called on order status change or on a schedule (every 5 min in prod).
 */
export async function slaRefundChecker(orderId?: string): Promise<{
  processed: number;
  skipped: number;
  errors: string[];
}> {
  const result = { processed: 0, skipped: 0, errors: [] as string[] };

  // If specific order ID given, process only that
  const filter = orderId
    ? and(eq(ordersTable.id, orderId), eq(ordersTable.slaBreached, "missed"))
    : and(inArray(ordersTable.status, ["delivered", "cancelled"]), eq(ordersTable.slaBreached, "missed"));

  const orders = await db.select().from(ordersTable).where(filter);

  for (const order of orders) {
    try {
      // Check if refund already exists for this order
      const [existing] = await db
        .select()
        .from(refundsTable)
        .where(and(
          eq(refundsTable.orderId, order.id),
          inArray(refundsTable.reason, ["flash_delay_minor", "flash_delay_major", "cargo_window_missed"]),
        ));

      if (existing) { result.skipped++; continue; }

      // Determine delay reason based on category and SLA
      const reason = order.category === "cargo" || order.category === "window"
        ? "cargo_window_missed"
        : "flash_delay_major";

      await applyRefundDecision({
        order,
        reason,
        trigger: "sla_check",
        delayMinutes: 65, // SLA major breach assumed for missed
      });
      result.processed++;
    } catch (err) {
      result.errors.push(`Order ${order.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Invoice Generator
// ---------------------------------------------------------------------------
/**
 * Creates invoices for all delivered orders that don't yet have one.
 * Idempotent: checks for existing invoice before creating.
 */
export async function invoiceGenerator(orderId?: string): Promise<{
  created: number;
  skipped: number;
  errors: string[];
}> {
  const result = { created: 0, skipped: 0, errors: [] as string[] };

  const orders = orderId
    ? await db.select().from(ordersTable).where(and(
        eq(ordersTable.id, orderId),
        eq(ordersTable.status, "delivered"),
      ))
    : await db.select().from(ordersTable).where(eq(ordersTable.status, "delivered"));

  for (const order of orders) {
    try {
      const invoice = await createInvoiceForOrder(order.id);
      if (invoice) result.created++;
      else result.skipped++;
    } catch (err) {
      result.errors.push(`Order ${order.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Payout Processor (weekly)
// ---------------------------------------------------------------------------
/**
 * Creates payout batch for a courier for the given week period.
 * Called by admin or on schedule every Monday.
 */
export async function payoutProcessor(input: {
  courierId: string;
  courierType: "fleet" | "osvč";
  periodStart: Date;
  periodEnd: Date;
}): Promise<{ batchId: string; finalPayoutCzk: number }> {
  const batch = await createPayoutBatch(input);
  return { batchId: batch.id, finalPayoutCzk: batch.finalPayoutCzk };
}

// ---------------------------------------------------------------------------
// Coupon Expirer
// ---------------------------------------------------------------------------
/**
 * Marks expired coupons as inactive.
 * Idempotent. Called daily or on each order creation.
 */
export async function couponExpirer(): Promise<number> {
  return expireOldCoupons();
}

// ---------------------------------------------------------------------------
// ETA Recalculator (foundation)
// ---------------------------------------------------------------------------
/**
 * Foundation for ETA updates based on courier GPS position.
 * Currently a stub — full implementation when routing engine is ready.
 */
export async function etaRecalculator(orderId: string): Promise<{
  updated: boolean;
  newEtaMinutes?: number;
}> {
  // TODO: Use courier GPS + routing API to recalculate ETA
  // For now: just mark as foundation
  console.info(`[ETA] Would recalculate ETA for order ${orderId}`);
  return { updated: false };
}

// ---------------------------------------------------------------------------
// Order delivered hook — trigger multiple jobs
// ---------------------------------------------------------------------------
/**
 * Called when order status changes to "delivered".
 * Chains: invoice generation → SLA check → payout item registration
 */
export async function onOrderDelivered(orderId: string): Promise<void> {
  // Fire-and-forget with error swallowing to not block order flow

  // 1. Generate invoice
  invoiceGenerator(orderId).then(async (result) => {
    if (result.created > 0) {
      // 2. Send delivery confirmation email with invoice number
      try {
        const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
        if (!order) return;
        const [customer] = await db.select().from(usersTable).where(eq(usersTable.id, order.customerId));
        if (!customer) return;

        const { invoicesTable } = await import("@workspace/db");
        const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.orderId, orderId));

        await sendDeliveryConfirmation({
          customerEmail: customer.email,
          customerName: customer.name,
          orderId,
          priceCzk: order.priceCzk,
          invoiceNumber: invoice?.invoiceNumber,
        });
      } catch (err) {
        console.error(`[onOrderDelivered] Email failed for ${orderId}:`, err);
      }
    }
  }).catch((err) => console.error(`[invoiceGenerator] Order ${orderId}:`, err));

  slaRefundChecker(orderId).catch((err) =>
    console.error(`[slaRefundChecker] Order ${orderId}:`, err)
  );
}

// ---------------------------------------------------------------------------
// Order cancelled hook — trigger refund evaluation
// ---------------------------------------------------------------------------
/**
 * Called when order status changes to "cancelled".
 * Determines refund type based on current order state.
 */
export async function onOrderCancelled(orderId: string, cancelledByAdmin = false): Promise<void> {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return;

  // Determine if courier had already departed (assigned = courier accepted, courier_arrived = at pickup)
  const courierDeparted = ["courier_arrived", "picked_up"].includes(order.status);
  const cancelBeforeDeparture = ["searching", "assigned"].includes(order.status);

  const reason = cancelBeforeDeparture ? "customer_cancel_before" : "customer_cancel_after";

  applyRefundDecision({
    order,
    reason: cancelledByAdmin ? "admin_goodwill" : reason,
    trigger: cancelledByAdmin ? "admin_manual" : "customer_cancel",
  }).catch((err) =>
    console.error(`[onOrderCancelled] Order ${orderId}:`, err)
  );
}
