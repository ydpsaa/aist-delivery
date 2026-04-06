/**
 * AIST Promo Engine
 *
 * Validates promo codes and computes discount amounts.
 * Tracks usage in promo_usage table.
 */

import { db, promoCodesTable, promoUsageTable, ordersTable } from "@workspace/db";
import type { PromoRules } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

export interface PromoValidationResult {
  valid: boolean;
  code: string;
  discountAmount: number;
  discountType: string;
  discountValue: number;
  description: string;
  error?: string;
}

export async function validatePromoCode(
  code: string,
  userId: string,
  serviceType: "flash" | "cargo" | "bfm",
  orderSubtotal: number,
  isFirstOrder: boolean
): Promise<PromoValidationResult> {
  const upperCode = code.trim().toUpperCase();

  const [row] = await db
    .select()
    .from(promoCodesTable)
    .where(eq(promoCodesTable.code, upperCode));

  if (!row) {
    return { valid: false, code, discountAmount: 0, discountType: "", discountValue: 0, description: "", error: "Promo code not found" };
  }

  if (!row.isActive) {
    return { valid: false, code, discountAmount: 0, discountType: "", discountValue: 0, description: "", error: "Promo code is not active" };
  }

  const rules = row.rules as PromoRules;
  const now = new Date();

  if (rules.validFrom && new Date(rules.validFrom) > now) {
    return { valid: false, code, discountAmount: 0, discountType: "", discountValue: 0, description: "", error: "Promo code is not yet valid" };
  }

  if (rules.validUntil && new Date(rules.validUntil) < now) {
    return { valid: false, code, discountAmount: 0, discountType: "", discountValue: 0, description: "", error: "Promo code has expired" };
  }

  if (rules.maxUses !== null && row.usedCount >= rules.maxUses) {
    return { valid: false, code, discountAmount: 0, discountType: "", discountValue: 0, description: "", error: "Promo code usage limit reached" };
  }

  if (rules.firstOrderOnly && !isFirstOrder) {
    return { valid: false, code, discountAmount: 0, discountType: "", discountValue: 0, description: "", error: "Promo code is for first order only" };
  }

  if (!rules.appliesTo.includes("all") && !rules.appliesTo.includes(serviceType)) {
    return { valid: false, code, discountAmount: 0, discountType: "", discountValue: 0, description: "", error: `Promo code not valid for ${serviceType} service` };
  }

  if (rules.minOrderValue && orderSubtotal < rules.minOrderValue) {
    return { valid: false, code, discountAmount: 0, discountType: "", discountValue: 0, description: "", error: `Minimum order value is ${rules.minOrderValue} CZK` };
  }

  // Check if user already used this code (for first_order type or unique codes)
  if (rules.firstOrderOnly || rules.discountType === "first_order") {
    const [usage] = await db
      .select()
      .from(promoUsageTable)
      .where(and(
        eq(promoUsageTable.promoCodeId, row.id),
        eq(promoUsageTable.userId, userId)
      ));
    if (usage) {
      return { valid: false, code, discountAmount: 0, discountType: "", discountValue: 0, description: "", error: "You have already used this promo code" };
    }
  }

  let discountAmount = 0;
  if (rules.discountType === "fixed" || rules.discountType === "first_order") {
    discountAmount = Math.min(rules.discountValue, orderSubtotal);
  } else if (rules.discountType === "percent") {
    discountAmount = Math.min(
      Math.round(orderSubtotal * rules.discountValue / 100),
      orderSubtotal
    );
  }

  return {
    valid: true,
    code: upperCode,
    discountAmount,
    discountType: rules.discountType,
    discountValue: rules.discountValue,
    description: row.description ?? "",
  };
}

export async function recordPromoUsage(
  promoCode: string,
  userId: string,
  orderId: string
): Promise<void> {
  const [row] = await db
    .select()
    .from(promoCodesTable)
    .where(eq(promoCodesTable.code, promoCode.toUpperCase()));

  if (!row) return;

  await db.insert(promoUsageTable).values({
    promoCodeId: row.id,
    userId,
    orderId,
  });

  await db
    .update(promoCodesTable)
    .set({ usedCount: sql`${promoCodesTable.usedCount} + 1`, updatedAt: new Date() })
    .where(eq(promoCodesTable.id, row.id));
}

export async function isFirstOrderForUser(userId: string): Promise<boolean> {
  const orders = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(eq(ordersTable.customerId, userId));
  return orders.length === 0;
}
