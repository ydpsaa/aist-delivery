/**
 * Pricing routes — three sub-routers for different mount points:
 *   pricingPublicRouter   → mounted at /api/pricing
 *   pricingAdminRouter    → mounted at /api/admin (pricing + promos sub-paths)
 *   pricingCustomerRouter → mounted at /api/customer
 */

import { Router } from "express";
import { db, pricingConfigsTable, promoCodesTable } from "@workspace/db";
import type { PricingServiceType, PromoRules } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  calcFlash, calcCargo, calcBfm,
  loadPricingConfigs, invalidatePricingCache, seedPricingDefaults,
} from "../services/pricingEngine.js";
import { validatePromoCode, isFirstOrderForUser } from "../services/promoEngine.js";

// Seed pricing defaults on startup
seedPricingDefaults().catch(console.error);

// ---------------------------------------------------------------------------
// PUBLIC pricing router  →  /api/pricing/*
// ---------------------------------------------------------------------------
export const pricingPublicRouter = Router();

pricingPublicRouter.get("/config", async (_req, res) => {
  const configs = await loadPricingConfigs();
  res.json({ configs });
});

pricingPublicRouter.post("/calculate", requireAuth, async (req, res) => {
  const {
    serviceType, distanceKm, pickupAt, isUrgent,
    outsidePrague, lowDemand, windowId, size,
    waitMinutes, cashPayment, estimatedItemValue, promoCode,
  } = req.body as {
    serviceType: "flash" | "cargo" | "bfm";
    distanceKm?: number;
    pickupAt?: string;
    isUrgent?: boolean;
    outsidePrague?: boolean;
    lowDemand?: boolean;
    windowId?: string;
    size?: "small" | "medium" | "large" | "xl";
    waitMinutes?: number;
    cashPayment?: boolean;
    estimatedItemValue?: number;
    promoCode?: string;
  };

  if (!serviceType || !["flash", "cargo", "bfm"].includes(serviceType)) {
    res.status(400).json({ error: "serviceType must be flash, cargo, or bfm" });
    return;
  }

  const dist = Number(distanceKm ?? 3);
  const userId = req.jwtUser!.sub;

  try {
    let promoDiscount = 0;
    let validatedPromoCode: string | undefined;

    let breakdown;
    if (serviceType === "flash") {
      breakdown = await calcFlash({
        distanceKm: dist,
        pickupAt: pickupAt ? new Date(pickupAt) : undefined,
        isUrgent: isUrgent ?? false,
        outsidePrague: outsidePrague ?? false,
        lowDemand: lowDemand ?? false,
        promoDiscount,
      });
    } else if (serviceType === "cargo") {
      if (!windowId) { res.status(400).json({ error: "windowId required for cargo" }); return; }
      breakdown = await calcCargo({
        distanceKm: dist, windowId, size: size ?? "small",
        outsidePrague: outsidePrague ?? false, lowDemand: lowDemand ?? false,
        promoDiscount,
      });
    } else {
      breakdown = await calcBfm({
        distanceKm: dist, waitMinutes: waitMinutes ?? 0,
        outsidePrague: outsidePrague ?? false, lowDemand: lowDemand ?? false,
        cashPayment: cashPayment ?? false, estimatedItemValue: estimatedItemValue ?? 0,
        promoDiscount,
      });
    }

    // Apply promo discount with real subtotal
    if (promoCode) {
      const isFirst = await isFirstOrderForUser(userId);
      const promoResult = await validatePromoCode(promoCode, userId, serviceType, breakdown.subtotal, isFirst);
      if (promoResult.valid) {
        promoDiscount = promoResult.discountAmount;
        validatedPromoCode = promoResult.code;
        breakdown.discountAmount = promoDiscount;
        breakdown.discountReason = `Promo: ${validatedPromoCode} (−${promoDiscount} CZK)`;
        breakdown.finalTotal = Math.max(1, breakdown.subtotal - promoDiscount);
        breakdown.promoCodeUsed = validatedPromoCode;
      } else {
        breakdown.discountReason = promoResult.error ?? "Invalid promo";
      }
    }

    res.json({ breakdown });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Pricing error";
    res.status(422).json({ error: msg });
  }
});

// ---------------------------------------------------------------------------
// ADMIN pricing + promos router  →  /api/admin/*
// ---------------------------------------------------------------------------
export const pricingAdminRouter = Router();

pricingAdminRouter.get("/pricing", requireAuth, requireRole("admin"), async (_req, res) => {
  const rows = await db.select().from(pricingConfigsTable);
  res.json({ configs: rows });
});

pricingAdminRouter.patch("/pricing/:type", requireAuth, requireRole("admin"), async (req, res) => {
  const { type } = req.params;
  const adminId = req.jwtUser!.sub;

  if (!["flash", "cargo", "bfm", "zone"].includes(type)) {
    res.status(400).json({ error: "type must be flash, cargo, bfm, or zone" });
    return;
  }

  const serviceType = type as PricingServiceType;
  const config = req.body.config;
  if (!config || typeof config !== "object") { res.status(400).json({ error: "config must be an object" }); return; }

  const [updated] = await db
    .insert(pricingConfigsTable)
    .values({ serviceType, config, updatedBy: adminId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: pricingConfigsTable.serviceType, set: { config, updatedBy: adminId, updatedAt: new Date() } })
    .returning();

  invalidatePricingCache();
  res.json({ config: updated });
});

pricingAdminRouter.get("/promos", requireAuth, requireRole("admin"), async (_req, res) => {
  const promos = await db.select().from(promoCodesTable).orderBy(promoCodesTable.createdAt);
  res.json({ promos });
});

pricingAdminRouter.post("/promos", requireAuth, requireRole("admin"), async (req, res) => {
  const adminId = req.jwtUser!.sub;
  const { code, description, rules } = req.body as { code: string; description?: string; rules: PromoRules };
  if (!code || !rules) { res.status(400).json({ error: "code and rules are required" }); return; }

  try {
    const [promo] = await db
      .insert(promoCodesTable)
      .values({ code: code.trim().toUpperCase(), description: description ?? null, rules, isActive: true, createdBy: adminId })
      .returning();
    res.status(201).json({ promo });
  } catch {
    res.status(409).json({ error: "Promo code already exists" });
  }
});

pricingAdminRouter.patch("/promos/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { id } = req.params;
  const updates = req.body as { description?: string; rules?: PromoRules; isActive?: boolean };

  const [promo] = await db
    .update(promoCodesTable)
    .set({
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.rules !== undefined && { rules: updates.rules }),
      ...(updates.isActive !== undefined && { isActive: updates.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(promoCodesTable.id, id))
    .returning();

  if (!promo) { res.status(404).json({ error: "Promo code not found" }); return; }
  res.json({ promo });
});

pricingAdminRouter.delete("/promos/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await db.delete(promoCodesTable).where(eq(promoCodesTable.id, req.params["id"]!));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// CUSTOMER promos router  →  /api/customer/*
// ---------------------------------------------------------------------------
export const pricingCustomerRouter = Router();

pricingCustomerRouter.post("/promos/validate", requireAuth, async (req, res) => {
  const userId = req.jwtUser!.sub;
  const { code, serviceType, subtotal } = req.body as {
    code: string; serviceType: "flash" | "cargo" | "bfm"; subtotal: number;
  };
  if (!code || !serviceType) { res.status(400).json({ error: "code and serviceType required" }); return; }

  const isFirst = await isFirstOrderForUser(userId);
  const result = await validatePromoCode(code, userId, serviceType, subtotal ?? 0, isFirst);
  res.json(result);
});

export default pricingPublicRouter;
