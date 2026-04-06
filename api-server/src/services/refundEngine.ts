/**
 * AIST Refund Engine
 *
 * Backend-driven refund rule evaluation.
 * Never calls Stripe directly — just produces RefundDecision records.
 * Stripe execution happens in a separate step when Stripe Connect is wired.
 *
 * Rules per FinOps v2:
 *   flash_delay_minor      → partial 49 CZK
 *   flash_delay_major      → full delivery fee refund
 *   cargo_window_missed    → coupon (no cash refund)
 *   customer_cancel_before → hold release, no charge
 *   customer_cancel_after  → partial charge (50% refund)
 *   bfm_cancel_video       → service fee kept, deposit released
 *   damage_claim           → up to 5000 CZK claim
 *   admin_goodwill         → manual amount
 */

import { db, refundsTable, couponsTable, ordersTable } from "@workspace/db";
import type {
  Order, RefundReason, RefundType, RefundTrigger, RefundDecision,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { issueCoupon } from "./couponService.js";

export const FLASH_MINOR_DELAY_REFUND_CZK = 49;
export const FLASH_CANCEL_AFTER_REFUND_RATE = 0.5;
export const BFM_SERVICE_FEE_CZK = 199;
export const DAMAGE_CLAIM_MAX_CZK = 5000;

export interface RefundEvalInput {
  order: Order;
  reason: RefundReason;
  trigger: RefundTrigger;
  delayMinutes?: number;
  adminNotes?: string;
  customAmountCzk?: number;
  processedBy?: string;
}

export interface RefundEvalResult {
  shouldRefund: boolean;
  refundType: RefundType;
  amountCzk: number;
  couponAmountCzk?: number;
  autoApproved: boolean;
  decision: RefundDecision;
}

export function evaluateRefundForOrder(input: RefundEvalInput): RefundEvalResult {
  const { order, reason, delayMinutes = 0, customAmountCzk = 0 } = input;
  const deliveryPrice = order.priceCzk;

  switch (reason) {
    case "flash_delay_minor": {
      // 15–60 min late → partial 49 CZK
      return {
        shouldRefund: true,
        refundType: "partial",
        amountCzk: FLASH_MINOR_DELAY_REFUND_CZK,
        autoApproved: true,
        decision: {
          refundType: "partial",
          amountCzk: FLASH_MINOR_DELAY_REFUND_CZK,
          reason,
          autoApproved: true,
          notes: `Flash delay ${delayMinutes} min — SLA minor breach`,
        },
      };
    }

    case "flash_delay_major": {
      // >60 min late → full delivery fee
      return {
        shouldRefund: true,
        refundType: "full",
        amountCzk: deliveryPrice,
        autoApproved: true,
        decision: {
          refundType: "full",
          amountCzk: deliveryPrice,
          reason,
          autoApproved: true,
          notes: `Flash delay ${delayMinutes} min — SLA major breach, full refund`,
        },
      };
    }

    case "cargo_window_missed": {
      // Cargo window missed → coupon, no cash refund
      return {
        shouldRefund: false,
        refundType: "coupon",
        amountCzk: 0,
        couponAmountCzk: deliveryPrice,
        autoApproved: true,
        decision: {
          refundType: "coupon",
          amountCzk: 0,
          couponAmountCzk: deliveryPrice,
          reason,
          autoApproved: true,
          notes: "Cargo delivery window missed — coupon issued for next order",
        },
      };
    }

    case "customer_cancel_before": {
      // Cancel before courier departs → full hold release
      return {
        shouldRefund: true,
        refundType: "hold_release",
        amountCzk: deliveryPrice,
        autoApproved: true,
        decision: {
          refundType: "hold_release",
          amountCzk: deliveryPrice,
          reason,
          autoApproved: true,
          notes: "Customer cancelled before courier departed — full release",
        },
      };
    }

    case "customer_cancel_after": {
      // Cancel after courier departs → 50% partial refund
      const partialRefund = Math.round(deliveryPrice * FLASH_CANCEL_AFTER_REFUND_RATE);
      return {
        shouldRefund: true,
        refundType: "partial",
        amountCzk: partialRefund,
        autoApproved: false, // requires admin review
        decision: {
          refundType: "partial",
          amountCzk: partialRefund,
          reason,
          autoApproved: false,
          notes: "Customer cancelled after departure — 50% partial refund pending review",
        },
      };
    }

    case "bfm_cancel_video": {
      // BFM cancel during video step → service fee kept, deposit released
      const kept = BFM_SERVICE_FEE_CZK;
      const released = Math.max(0, deliveryPrice - kept);
      return {
        shouldRefund: true,
        refundType: "partial",
        amountCzk: released,
        autoApproved: true,
        decision: {
          refundType: "partial",
          amountCzk: released,
          reason,
          autoApproved: true,
          notes: `BFM cancel during video — service fee ${kept} CZK kept, ${released} CZK released`,
        },
      };
    }

    case "damage_claim": {
      // Damage claim — up to 5000 CZK, always manual review
      const claimAmt = Math.min(customAmountCzk || DAMAGE_CLAIM_MAX_CZK, DAMAGE_CLAIM_MAX_CZK);
      return {
        shouldRefund: false, // pending manual review
        refundType: "damage_claim",
        amountCzk: claimAmt,
        autoApproved: false,
        decision: {
          refundType: "damage_claim",
          amountCzk: claimAmt,
          reason,
          autoApproved: false,
          notes: `Damage claim for ${claimAmt} CZK — requires manual review and documentation`,
        },
      };
    }

    case "admin_goodwill": {
      const goodwillAmt = customAmountCzk;
      return {
        shouldRefund: goodwillAmt > 0,
        refundType: "partial",
        amountCzk: goodwillAmt,
        autoApproved: false,
        decision: {
          refundType: "partial",
          amountCzk: goodwillAmt,
          reason,
          autoApproved: false,
          notes: input.adminNotes ?? "Admin goodwill refund",
        },
      };
    }

    default: {
      return {
        shouldRefund: false,
        refundType: "partial",
        amountCzk: 0,
        autoApproved: false,
        decision: {
          refundType: "partial",
          amountCzk: 0,
          reason: "other",
          autoApproved: false,
          notes: "Unrecognized reason",
        },
      };
    }
  }
}

export async function applyRefundDecision(input: RefundEvalInput): Promise<typeof refundsTable.$inferSelect> {
  const { order, reason, trigger, processedBy } = input;
  const evalResult = evaluateRefundForOrder(input);

  // If coupon type — issue a coupon in parallel
  if (evalResult.refundType === "coupon" && evalResult.couponAmountCzk) {
    await issueCoupon({
      customerId: order.customerId,
      sourceOrderId: order.id,
      amountCzk: evalResult.couponAmountCzk,
      reason: reason === "cargo_window_missed" ? "cargo_window_missed" : "refund_fallback",
      serviceScope: reason === "cargo_window_missed" ? "cargo" : "any",
      validDays: 365,
    });
  }

  const status = evalResult.autoApproved ? "approved" : "pending";

  const [refund] = await db
    .insert(refundsTable)
    .values({
      orderId: order.id,
      customerId: order.customerId,
      refundType: evalResult.refundType,
      status,
      reason,
      trigger,
      amountCzk: evalResult.amountCzk,
      couponAmountCzk: evalResult.couponAmountCzk ?? null,
      autoApproved: evalResult.autoApproved,
      decision: evalResult.decision,
      processedBy: processedBy ?? null,
      processedAt: evalResult.autoApproved ? new Date() : null,
    })
    .returning();

  return refund!;
}

export async function getRefundsForOrder(orderId: string) {
  return db.select().from(refundsTable).where(eq(refundsTable.orderId, orderId));
}

export async function approveRefund(refundId: string, adminId: string): Promise<typeof refundsTable.$inferSelect> {
  const [refund] = await db
    .update(refundsTable)
    .set({ status: "approved", processedBy: adminId, processedAt: new Date(), updatedAt: new Date() })
    .where(eq(refundsTable.id, refundId))
    .returning();
  return refund!;
}

export async function rejectRefund(refundId: string, adminId: string, notes?: string) {
  const [refund] = await db
    .update(refundsTable)
    .set({ status: "rejected", processedBy: adminId, processedAt: new Date(), notes: notes ?? null, updatedAt: new Date() })
    .where(eq(refundsTable.id, refundId))
    .returning();
  return refund!;
}
