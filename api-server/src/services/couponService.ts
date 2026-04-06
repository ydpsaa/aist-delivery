/**
 * AIST Coupon Service
 *
 * Internal coupon system — separate from promo codes.
 * Coupons are issued per-customer as compensation (SLA breach, goodwill, etc.)
 * Cannot be reused. Idempotent issuance via source_order_id check.
 */

import { db, couponsTable } from "@workspace/db";
import type { CouponReason, CouponServiceScope } from "@workspace/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";

export interface IssueCouponInput {
  customerId: string;
  sourceOrderId?: string;
  amountCzk: number;
  reason: CouponReason;
  serviceScope?: CouponServiceScope;
  validDays?: number;
  notes?: string;
  issuedBy?: string;
}

export async function issueCoupon(input: IssueCouponInput): Promise<typeof couponsTable.$inferSelect> {
  const {
    customerId, sourceOrderId, amountCzk, reason,
    serviceScope = "any", validDays = 365, notes, issuedBy,
  } = input;

  // Idempotency: don't issue same coupon type for same source order twice
  if (sourceOrderId) {
    const [existing] = await db
      .select()
      .from(couponsTable)
      .where(and(
        eq(couponsTable.customerId, customerId),
        eq(couponsTable.sourceOrderId, sourceOrderId),
        eq(couponsTable.reason, reason),
      ));
    if (existing) return existing;
  }

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + validDays);

  const [coupon] = await db
    .insert(couponsTable)
    .values({
      customerId,
      sourceOrderId: sourceOrderId ?? null,
      amountCzk,
      reason,
      serviceScope,
      notes: notes ?? null,
      validUntil,
      issuedBy: issuedBy ?? null,
      isUsed: false,
      isActive: true,
    })
    .returning();

  return coupon!;
}

export async function getAvailableCoupons(customerId: string) {
  const now = new Date();
  return db
    .select()
    .from(couponsTable)
    .where(and(
      eq(couponsTable.customerId, customerId),
      eq(couponsTable.isUsed, false),
      eq(couponsTable.isActive, true),
      gt(couponsTable.validUntil, now),
    ))
    .orderBy(couponsTable.validUntil);
}

export interface ApplyCouponResult {
  valid: boolean;
  couponId?: string;
  discountAmountCzk: number;
  error?: string;
}

export async function applyCouponToOrder(
  couponId: string,
  customerId: string,
  serviceType: "flash" | "cargo" | "bfm",
  orderId: string,
  orderSubtotal: number,
): Promise<ApplyCouponResult> {
  const [coupon] = await db
    .select()
    .from(couponsTable)
    .where(eq(couponsTable.id, couponId));

  if (!coupon) return { valid: false, discountAmountCzk: 0, error: "Coupon not found" };
  if (coupon.customerId !== customerId) return { valid: false, discountAmountCzk: 0, error: "Coupon does not belong to this customer" };
  if (coupon.isUsed) return { valid: false, discountAmountCzk: 0, error: "Coupon has already been used" };
  if (!coupon.isActive) return { valid: false, discountAmountCzk: 0, error: "Coupon is not active" };
  if (new Date(coupon.validUntil) < new Date()) return { valid: false, discountAmountCzk: 0, error: "Coupon has expired" };

  if (coupon.serviceScope !== "any" && coupon.serviceScope !== serviceType) {
    const scopeLabel = coupon.serviceScope === "cargo" ? "Cargo Window" : coupon.serviceScope === "flash" ? "Flash Express" : "Buy For Me";
    return { valid: false, discountAmountCzk: 0, error: `Coupon is only valid for ${scopeLabel}` };
  }

  const discountAmountCzk = Math.min(coupon.amountCzk, orderSubtotal);

  // Mark coupon as used
  await db
    .update(couponsTable)
    .set({ isUsed: true, usedAt: new Date(), usedOnOrderId: orderId })
    .where(eq(couponsTable.id, couponId));

  return { valid: true, couponId, discountAmountCzk };
}

export async function expireOldCoupons(): Promise<number> {
  const now = new Date();
  const result = await db
    .update(couponsTable)
    .set({ isActive: false })
    .where(and(
      eq(couponsTable.isUsed, false),
      eq(couponsTable.isActive, true),
      sql`${couponsTable.validUntil} < ${now}`,
    ))
    .returning();
  return result.length;
}

export async function deactivateCoupon(couponId: string): Promise<void> {
  await db
    .update(couponsTable)
    .set({ isActive: false })
    .where(eq(couponsTable.id, couponId));
}
