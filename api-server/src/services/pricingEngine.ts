/**
 * AIST Pricing Engine
 *
 * Centralized pricing logic for all service types:
 *   - Flash Express
 *   - Cargo Window
 *   - Buy For Me
 *
 * Reads live config from DB (pricing_configs table).
 * Admin can change any coefficient via /api/admin/pricing endpoints.
 * Backend is always the single source of truth for prices.
 */

import { db, pricingConfigsTable } from "@workspace/db";
import type {
  FlashConfig,
  CargoConfig,
  BfmConfig,
  ZoneConfig,
  PricingBreakdown,
} from "@workspace/db";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Default configs (used if DB row is missing — seeds on first call)
// ---------------------------------------------------------------------------
export const DEFAULT_FLASH: FlashConfig = {
  baseFee: 89,
  includedKm: 1,
  perKmRate: 20,
  timeCoefficients: { day: 1.00, evening: 1.20, night: 1.35, weekend: 1.15 },
  urgentCoefficient: 1.30,
  urgentThresholdMin: 15,
};

export const DEFAULT_CARGO: CargoConfig = {
  windows: [
    { id: "07-10", label: "07:00–10:00", basePrice: 249, startHour: 7,  endHour: 10 },
    { id: "11-14", label: "11:00–14:00", basePrice: 199, startHour: 11, endHour: 14 },
    { id: "14-17", label: "14:00–17:00", basePrice: 199, startHour: 14, endHour: 17 },
    { id: "17-21", label: "17:00–21:00", basePrice: 229, startHour: 17, endHour: 21 },
    { id: "next-morning", label: "Next morning", basePrice: 179, startHour: 7, endHour: 10 },
  ],
  includedKm: 5,
  perKmRate: 15,
  sizeSurcharges: { small: 0, medium: 30, large: 70, xl: 120 },
};

export const DEFAULT_BFM: BfmConfig = {
  serviceFee: 199,
  perKmRate: 24,
  freeWaitMinutes: 5,
  waitRatePerMin: 7,
  depositPercent: 10,
  depositMinimum: 150,
  cashFee: 49,
};

export const DEFAULT_ZONE: ZoneConfig = {
  outsidePragueRatePerKm: 19,
  lowDemandSurchargePercent: 15,
  lowDemandEnabled: false,
};

// ---------------------------------------------------------------------------
// Config loader with in-memory cache (1 min TTL)
// ---------------------------------------------------------------------------
type AllConfigs = {
  flash: FlashConfig;
  cargo: CargoConfig;
  bfm: BfmConfig;
  zone: ZoneConfig;
};

let configCache: AllConfigs | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 60_000;

export async function loadPricingConfigs(): Promise<AllConfigs> {
  const now = Date.now();
  if (configCache && now - cacheAt < CACHE_TTL_MS) return configCache;

  const rows = await db.select().from(pricingConfigsTable);
  const map = Object.fromEntries(rows.map((r) => [r.serviceType, r.config]));

  const configs: AllConfigs = {
    flash: (map["flash"] as FlashConfig) ?? DEFAULT_FLASH,
    cargo: (map["cargo"] as CargoConfig) ?? DEFAULT_CARGO,
    bfm:   (map["bfm"]   as BfmConfig)   ?? DEFAULT_BFM,
    zone:  (map["zone"]  as ZoneConfig)  ?? DEFAULT_ZONE,
  };

  configCache = configs;
  cacheAt = now;
  return configs;
}

export function invalidatePricingCache() {
  configCache = null;
  cacheAt = 0;
}

// ---------------------------------------------------------------------------
// Seed defaults if missing (called on server start via pricing route)
// ---------------------------------------------------------------------------
export async function seedPricingDefaults() {
  const existing = await db.select().from(pricingConfigsTable);
  const existingTypes = new Set(existing.map((r) => r.serviceType));

  const defaults: Array<{ serviceType: "flash" | "cargo" | "bfm" | "zone"; config: any }> = [
    { serviceType: "flash", config: DEFAULT_FLASH },
    { serviceType: "cargo", config: DEFAULT_CARGO },
    { serviceType: "bfm",   config: DEFAULT_BFM   },
    { serviceType: "zone",  config: DEFAULT_ZONE  },
  ];

  for (const d of defaults) {
    if (!existingTypes.has(d.serviceType)) {
      await db.insert(pricingConfigsTable).values(d);
    }
  }
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------
function getTimePeriod(date: Date): "day" | "evening" | "night" {
  const h = date.getHours();
  if (h >= 8 && h < 18) return "day";
  if (h >= 18 && h < 23) return "evening";
  return "night";
}

function isWeekend(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

// ---------------------------------------------------------------------------
// Flash Express calculator
// ---------------------------------------------------------------------------
export interface FlashCalcInput {
  distanceKm: number;
  pickupAt?: Date;
  isUrgent?: boolean;
  outsidePrague?: boolean;
  lowDemand?: boolean;
  promoDiscount?: number;
  promoCode?: string;
}

export async function calcFlash(input: FlashCalcInput): Promise<PricingBreakdown> {
  const { flash, zone } = await loadPricingConfigs();
  const now = input.pickupAt ?? new Date();
  const dist = Math.max(0, input.distanceKm);

  const baseFee = flash.baseFee;
  const extraKm = Math.max(0, dist - flash.includedKm);
  const distanceCharge = Math.round(extraKm * flash.perKmRate);

  // Time coefficient — only the largest of [time, weekend] applies
  const period = getTimePeriod(now);
  const timeCfMap = { day: flash.timeCoefficients.day, evening: flash.timeCoefficients.evening, night: flash.timeCoefficients.night };
  let timeCoeff = timeCfMap[period];
  let timeCoefficientLabel = period;

  if (isWeekend(now) && flash.timeCoefficients.weekend > timeCoeff) {
    timeCoeff = flash.timeCoefficients.weekend;
    timeCoefficientLabel = "weekend";
  }

  // Urgency coefficient stacks ON TOP of time coefficient
  let urgencyCoeff = 1.0;
  if (input.isUrgent) {
    urgencyCoeff = flash.urgentCoefficient;
    timeCoefficientLabel += "+urgent";
  }

  const baseAfterTime = Math.round(baseFee * timeCoeff * urgencyCoeff);
  const subtotalBefore = baseAfterTime + distanceCharge;

  // Outside Prague surcharge
  let outsidePragueSurcharge = 0;
  if (input.outsidePrague) {
    outsidePragueSurcharge = Math.round(dist * zone.outsidePragueRatePerKm);
  }

  // Low-demand surcharge
  let lowDemandSurcharge = 0;
  if (input.lowDemand ?? zone.lowDemandEnabled) {
    lowDemandSurcharge = Math.round(subtotalBefore * zone.lowDemandSurchargePercent / 100);
  }

  const subtotal = subtotalBefore + outsidePragueSurcharge + lowDemandSurcharge;
  const discountAmount = Math.min(input.promoDiscount ?? 0, subtotal);
  const finalTotal = Math.max(1, subtotal - discountAmount);

  const surchargeReason = [
    outsidePragueSurcharge > 0 ? `Outside Prague +${zone.outsidePragueRatePerKm} CZK/km` : "",
    lowDemandSurcharge > 0 ? `Low demand +${zone.lowDemandSurchargePercent}%` : "",
  ].filter(Boolean).join("; ");

  return {
    serviceType: "flash",
    baseFee,
    distanceKm: dist,
    distanceCharge,
    timeCoefficient: timeCoeff,
    timeCoefficientLabel,
    urgencyCoefficient: urgencyCoeff,
    sizeSurcharge: 0,
    outsidePragueSurcharge,
    lowDemandSurcharge,
    serviceFee: 0,
    waitingFee: 0,
    subtotal,
    discountAmount,
    discountReason: input.promoCode ? `Promo: ${input.promoCode}` : "",
    finalTotal,
    promoCodeUsed: input.promoCode ?? null,
    surchargeReason,
  };
}

// ---------------------------------------------------------------------------
// Cargo Window calculator
// ---------------------------------------------------------------------------
export type CargoSize = "small" | "medium" | "large" | "xl";

export interface CargoCalcInput {
  distanceKm: number;
  windowId: string;
  size?: CargoSize;
  outsidePrague?: boolean;
  lowDemand?: boolean;
  promoDiscount?: number;
  promoCode?: string;
}

export async function calcCargo(input: CargoCalcInput): Promise<PricingBreakdown> {
  const { cargo, zone } = await loadPricingConfigs();

  const window = cargo.windows.find((w) => w.id === input.windowId);
  if (!window) throw new Error(`Unknown cargo window: ${input.windowId}`);

  const dist = Math.max(0, input.distanceKm);
  const baseFee = window.basePrice;
  const extraKm = Math.max(0, dist - cargo.includedKm);
  const distanceCharge = Math.round(extraKm * cargo.perKmRate);

  const size = input.size ?? "small";
  const sizeSurcharge = cargo.sizeSurcharges[size] ?? 0;

  const subtotalBefore = baseFee + distanceCharge + sizeSurcharge;

  let outsidePragueSurcharge = 0;
  if (input.outsidePrague) {
    outsidePragueSurcharge = Math.round(dist * zone.outsidePragueRatePerKm);
  }

  let lowDemandSurcharge = 0;
  if (input.lowDemand ?? zone.lowDemandEnabled) {
    lowDemandSurcharge = Math.round(subtotalBefore * zone.lowDemandSurchargePercent / 100);
  }

  const subtotal = subtotalBefore + outsidePragueSurcharge + lowDemandSurcharge;
  const discountAmount = Math.min(input.promoDiscount ?? 0, subtotal);
  const finalTotal = Math.max(1, subtotal - discountAmount);

  const surchargeReason = [
    sizeSurcharge > 0 ? `Size (${size}) +${sizeSurcharge} CZK` : "",
    outsidePragueSurcharge > 0 ? `Outside Prague +${zone.outsidePragueRatePerKm} CZK/km` : "",
    lowDemandSurcharge > 0 ? `Low demand +${zone.lowDemandSurchargePercent}%` : "",
  ].filter(Boolean).join("; ");

  return {
    serviceType: "cargo",
    baseFee,
    distanceKm: dist,
    distanceCharge,
    timeCoefficient: 1.0,
    timeCoefficientLabel: window.label,
    urgencyCoefficient: 1.0,
    sizeSurcharge,
    outsidePragueSurcharge,
    lowDemandSurcharge,
    serviceFee: 0,
    waitingFee: 0,
    subtotal,
    discountAmount,
    discountReason: input.promoCode ? `Promo: ${input.promoCode}` : "",
    finalTotal,
    promoCodeUsed: input.promoCode ?? null,
    surchargeReason,
  };
}

// ---------------------------------------------------------------------------
// Buy For Me calculator
// ---------------------------------------------------------------------------
export interface BfmCalcInput {
  distanceKm: number;
  waitMinutes?: number;
  outsidePrague?: boolean;
  lowDemand?: boolean;
  cashPayment?: boolean;
  estimatedItemValue?: number;
  promoDiscount?: number;
  promoCode?: string;
}

export interface BfmBreakdown extends PricingBreakdown {
  depositHold: number;
}

export async function calcBfm(input: BfmCalcInput): Promise<BfmBreakdown> {
  const { bfm, zone } = await loadPricingConfigs();

  const dist = Math.max(0, input.distanceKm);
  const serviceFee = bfm.serviceFee;
  const distanceCharge = Math.round(dist * bfm.perKmRate);

  const waitMin = Math.max(0, (input.waitMinutes ?? 0) - bfm.freeWaitMinutes);
  const waitingFee = Math.round(waitMin * bfm.waitRatePerMin);

  const cashFee = input.cashPayment ? bfm.cashFee : 0;

  const subtotalBefore = serviceFee + distanceCharge + waitingFee + cashFee;

  let outsidePragueSurcharge = 0;
  if (input.outsidePrague) {
    outsidePragueSurcharge = Math.round(dist * zone.outsidePragueRatePerKm);
  }

  let lowDemandSurcharge = 0;
  if (input.lowDemand ?? zone.lowDemandEnabled) {
    lowDemandSurcharge = Math.round(subtotalBefore * zone.lowDemandSurchargePercent / 100);
  }

  const subtotal = subtotalBefore + outsidePragueSurcharge + lowDemandSurcharge;
  const discountAmount = Math.min(input.promoDiscount ?? 0, subtotal);
  const finalTotal = Math.max(1, subtotal - discountAmount);

  const itemValue = input.estimatedItemValue ?? 0;
  const depositHold = itemValue > 0
    ? Math.max(bfm.depositMinimum, Math.round(itemValue * bfm.depositPercent / 100))
    : 0;

  const surchargeReason = [
    cashFee > 0 ? `Cash fee +${cashFee} CZK` : "",
    outsidePragueSurcharge > 0 ? `Outside Prague +${zone.outsidePragueRatePerKm} CZK/km` : "",
    lowDemandSurcharge > 0 ? `Low demand +${zone.lowDemandSurchargePercent}%` : "",
  ].filter(Boolean).join("; ");

  return {
    serviceType: "bfm",
    baseFee: serviceFee,
    distanceKm: dist,
    distanceCharge,
    timeCoefficient: 1.0,
    timeCoefficientLabel: "flat",
    urgencyCoefficient: 1.0,
    sizeSurcharge: 0,
    outsidePragueSurcharge,
    lowDemandSurcharge,
    serviceFee,
    waitingFee,
    subtotal,
    discountAmount,
    discountReason: input.promoCode ? `Promo: ${input.promoCode}` : "",
    finalTotal,
    promoCodeUsed: input.promoCode ?? null,
    surchargeReason,
    depositHold,
  };
}
