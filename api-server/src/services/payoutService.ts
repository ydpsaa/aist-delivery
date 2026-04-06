/**
 * AIST Payout Service
 *
 * Foundation for two courier types:
 *   Fleet — DPP/DPČ, platform pays courier directly
 *   OSVČ  — courier issues weekly faktura to AIST, platform transfers
 *
 * Not yet wired to Stripe Connect — foundation for next phase.
 * All amounts in CZK (integer).
 */

import { db, payoutBatchesTable, payoutItemsTable, ordersTable, courierProfilesTable } from "@workspace/db";
import type { CourierType, PayoutMethod, PayoutSummaryMeta } from "@workspace/db";
import { eq, and, gte, lte, inArray } from "drizzle-orm";

// Beta phase: AIST keeps 0% in beta (couriers get 100% of fare minus Stripe fees)
// Production: adjust to ~15-20% platform fee
const BETA_PLATFORM_FEE_RATE = 0.0;
const STRIPE_FEE_RATE = 0.0; // Not wired yet — placeholder
const FLEET_DPP_TAX_RATE = 0.15; // 15% srážková daň for Fleet DPP

// ---------------------------------------------------------------------------
// Calculate weekly summary for a courier
// ---------------------------------------------------------------------------
export interface CourierWeekSummaryInput {
  courierId: string;
  courierType: CourierType;
  periodStart: Date;
  periodEnd: Date;
}

export interface CourierWeekSummary {
  courierId: string;
  courierType: CourierType;
  periodStart: Date;
  periodEnd: Date;
  orderCount: number;
  grossAmountCzk: number;
  platformFeeCzk: number;
  stripeFeeCzk: number;
  taxWithheldCzk: number;
  finalPayoutCzk: number;
  orders: Array<{ orderId: string; priceCzk: number; deliveredAt: Date | null }>;
}

export async function calculateCourierWeekSummary(
  input: CourierWeekSummaryInput,
): Promise<CourierWeekSummary> {
  const { courierId, courierType, periodStart, periodEnd } = input;

  const deliveredOrders = await db
    .select()
    .from(ordersTable)
    .where(and(
      eq(ordersTable.courierId, courierId),
      eq(ordersTable.status, "delivered"),
      gte(ordersTable.updatedAt, periodStart),
      lte(ordersTable.updatedAt, periodEnd),
    ));

  const grossAmountCzk = deliveredOrders.reduce((sum, o) => sum + o.priceCzk, 0);
  const platformFeeCzk = Math.round(grossAmountCzk * BETA_PLATFORM_FEE_RATE);
  const stripeFeeCzk = Math.round(grossAmountCzk * STRIPE_FEE_RATE);
  const netAfterFees = grossAmountCzk - platformFeeCzk - stripeFeeCzk;

  // Fleet DPP: AIST withholds 15% tax (srážková daň) if monthly < 10k CZK
  // OSVČ: no tax withholding — courier handles own taxes
  const taxWithheldCzk = courierType === "fleet"
    ? Math.round(netAfterFees * FLEET_DPP_TAX_RATE)
    : 0;

  const finalPayoutCzk = netAfterFees - taxWithheldCzk;

  return {
    courierId,
    courierType,
    periodStart,
    periodEnd,
    orderCount: deliveredOrders.length,
    grossAmountCzk,
    platformFeeCzk,
    stripeFeeCzk,
    taxWithheldCzk,
    finalPayoutCzk,
    orders: deliveredOrders.map((o) => ({
      orderId: o.id,
      priceCzk: o.priceCzk,
      deliveredAt: o.updatedAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Create payout batch (weekly run)
// ---------------------------------------------------------------------------
export async function createPayoutBatch(input: {
  courierId: string;
  courierType: CourierType;
  periodStart: Date;
  periodEnd: Date;
  payoutMethod?: PayoutMethod;
}): Promise<typeof payoutBatchesTable.$inferSelect> {
  const { courierId, courierType, periodStart, periodEnd, payoutMethod = "bank_transfer" } = input;

  const summary = await calculateCourierWeekSummary({
    courierId, courierType, periodStart, periodEnd,
  });

  const meta: PayoutSummaryMeta = {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    orderCount: summary.orderCount,
    grossRevenue: summary.grossAmountCzk,
    platformFeeRate: BETA_PLATFORM_FEE_RATE,
    stripeFeePaid: summary.stripeFeeCzk,
    taxWithheld: summary.taxWithheldCzk,
  };

  const [batch] = await db
    .insert(payoutBatchesTable)
    .values({
      courierId,
      courierType,
      status: "draft",
      payoutMethod,
      grossAmountCzk: summary.grossAmountCzk,
      platformFeeCzk: summary.platformFeeCzk,
      stripeFeeCzk: summary.stripeFeeCzk,
      taxWithheldCzk: summary.taxWithheldCzk,
      finalPayoutCzk: summary.finalPayoutCzk,
      periodStart,
      periodEnd,
      meta,
    })
    .returning();

  // Create payout items (one per order)
  if (summary.orders.length > 0) {
    await db.insert(payoutItemsTable).values(
      summary.orders.map((o) => ({
        batchId: batch!.id,
        orderId: o.orderId,
        courierId,
        orderPriceCzk: o.priceCzk,
        platformFeeCzk: Math.round(o.priceCzk * BETA_PLATFORM_FEE_RATE),
        courierShareCzk: Math.round(o.priceCzk * (1 - BETA_PLATFORM_FEE_RATE)),
        deliveredAt: o.deliveredAt ?? null,
      })),
    );
  }

  return batch!;
}

// ---------------------------------------------------------------------------
// Get courier payout batches
// ---------------------------------------------------------------------------
export async function getCourierPayouts(courierId: string) {
  return db
    .select()
    .from(payoutBatchesTable)
    .where(eq(payoutBatchesTable.courierId, courierId))
    .orderBy(payoutBatchesTable.createdAt);
}

// ---------------------------------------------------------------------------
// Get all payout batches (admin view)
// ---------------------------------------------------------------------------
export async function getAllPayoutBatches(status?: string) {
  if (status) {
    return db
      .select()
      .from(payoutBatchesTable)
      .where(eq(payoutBatchesTable.status, status as any))
      .orderBy(payoutBatchesTable.createdAt);
  }
  return db.select().from(payoutBatchesTable).orderBy(payoutBatchesTable.createdAt);
}

// ---------------------------------------------------------------------------
// Approve payout batch (admin)
// ---------------------------------------------------------------------------
export async function approvePayoutBatch(batchId: string, adminId: string) {
  const [batch] = await db
    .update(payoutBatchesTable)
    .set({ status: "approved", approvedBy: adminId, updatedAt: new Date() })
    .where(eq(payoutBatchesTable.id, batchId))
    .returning();
  return batch!;
}

// ---------------------------------------------------------------------------
// Get payout items for a batch
// ---------------------------------------------------------------------------
export async function getPayoutItems(batchId: string) {
  return db
    .select()
    .from(payoutItemsTable)
    .where(eq(payoutItemsTable.batchId, batchId));
}
