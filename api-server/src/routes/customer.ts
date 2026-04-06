/**
 * Customer API routes
 *
 * POST /api/customer/orders         — create a new order (triggers WS + push to couriers)
 * GET  /api/customer/orders/current — customer's current active order
 * GET  /api/customer/orders/history — customer's completed/cancelled orders
 * POST /api/customer/push-token     — register Expo push token for customer
 *
 * Real-time: emitToCustomer() is called by courier.ts and admin.ts on each
 * order status change — this file only handles order creation.
 */

import { Router } from "express";
import { db, ordersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { notifyOnlineCouriers, setCustomerPushToken } from "../services/notificationService.js";
import { emitToAllConnectedCouriers } from "../services/courierEventBus.js";
import { emitToCustomer } from "../services/customerEventBus.js";
import { emitToAdmins } from "../services/adminEventBus.js";
import { recordPromoUsage } from "../services/promoEngine.js";
import type { OrderAddress, OrderCategory, PricingBreakdown } from "@workspace/db";

const router = Router();

// All customer routes require auth (any role can place an order for testing)
router.use(requireAuth);

const ACTIVE_STATUSES: OrderCategory[] = ["flash", "window", "buy", "cargo"];
const ACTIVE_ORDER_STATUSES = ["searching", "assigned", "courier_arrived", "picked_up"];
const COMPLETED_STATUSES = ["delivered", "cancelled"];

// ---------------------------------------------------------------------------
// POST /api/customer/orders  — create a new delivery order
// ---------------------------------------------------------------------------
router.post("/orders", async (req, res) => {
  const customerId = req.jwtUser!.sub;

  const {
    category,
    pickupAddress,
    deliveryAddress,
    description,
    priceCzk,
    distanceKm,
    estimatedMinutes,
    pricingBreakdown,
    promoCodeUsed,
  } = req.body as {
    category?: OrderCategory;
    pickupAddress: OrderAddress;
    deliveryAddress: OrderAddress;
    description?: string;
    priceCzk: number;
    distanceKm?: string;
    estimatedMinutes?: number;
    pricingBreakdown?: PricingBreakdown;
    promoCodeUsed?: string;
  };

  if (!pickupAddress || !deliveryAddress || !priceCzk) {
    res.status(400).json({ error: "pickupAddress, deliveryAddress, and priceCzk are required" });
    return;
  }

  const breakdown = pricingBreakdown ?? null;

  const [order] = await db
    .insert(ordersTable)
    .values({
      customerId,
      category: category ?? "flash",
      pickupAddress,
      deliveryAddress,
      description: description ?? null,
      priceCzk,
      distanceKm: distanceKm ?? null,
      estimatedMinutes: estimatedMinutes ?? null,
      status: "searching",
      pricingBreakdown: breakdown,
      subtotalCzk: breakdown?.subtotal ?? null,
      discountAmountCzk: breakdown?.discountAmount ?? null,
      surchargeAmountCzk: breakdown
        ? (breakdown.outsidePragueSurcharge + breakdown.lowDemandSurcharge + breakdown.sizeSurcharge)
        : null,
      promoCodeUsed: promoCodeUsed ?? breakdown?.promoCodeUsed ?? null,
    })
    .returning();

  // Record promo usage if a promo code was applied
  const appliedPromo = promoCodeUsed ?? breakdown?.promoCodeUsed ?? null;
  if (appliedPromo && order) {
    recordPromoUsage(appliedPromo, customerId, order.id).catch(console.error);
  }

  // Stripe: create payment intent (fire-and-forget — non-blocking)
  if (order) {
    import("../services/stripeService.js").then(async ({ createPaymentIntent }) => {
      try {
        const pi = await createPaymentIntent(order.id, order.priceCzk);
        if (pi.paymentIntentId) {
          await db.update(ordersTable)
            .set({ stripePaymentIntentId: pi.paymentIntentId, paymentStatus: "requires_capture", updatedAt: new Date() })
            .where(eq(ordersTable.id, order.id));
        }
      } catch (err) {
        console.error("[Stripe] PaymentIntent creation failed:", err);
      }
    }).catch(console.error);
  }

  const notificationBody = `${pickupAddress.label} → ${deliveryAddress.label} · ${priceCzk} Kč`;

  // 1. Confirm order creation back to the customer's WS (instant)
  emitToCustomer(customerId, {
    type: "order_created",
    payload: {
      orderId: order!.id,
      status: order!.status,
      priceCzk: order!.priceCzk,
    },
  });

  // 2. Notify all connected couriers via WS (instant, primary)
  emitToAllConnectedCouriers({
    type: "new_order_available",
    payload: {
      orderId: order!.id,
      category: order!.category,
      priceCzk: order!.priceCzk,
      pickupAddress: order!.pickupAddress,
      deliveryAddress: order!.deliveryAddress,
      estimatedMinutes: order!.estimatedMinutes,
    },
  });

  // 3. Notify admin dispatcher (instant — new order appears on dispatcher screen)
  emitToAdmins({
    type: "order_created",
    payload: {
      id: order!.id,
      status: order!.status,
      category: order!.category,
      priceCzk: order!.priceCzk,
      pickupAddress: order!.pickupAddress,
      deliveryAddress: order!.deliveryAddress,
      customerId: order!.customerId,
      courierId: order!.courierId,
      createdAt: order!.createdAt,
    },
  });

  // 4. Push notification for backgrounded couriers (non-blocking fallback)
  notifyOnlineCouriers({
    type: "new_order_available",
    title: "New delivery available",
    body: notificationBody,
    data: { orderId: order!.id, category: order!.category },
  });

  res.status(201).json({ order });
});

// ---------------------------------------------------------------------------
// GET /api/customer/orders/current  — active order for this customer
// ---------------------------------------------------------------------------
router.get("/orders/current", async (req, res) => {
  const customerId = req.jwtUser!.sub;

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.customerId, customerId),
        inArray(ordersTable.status, ACTIVE_ORDER_STATUSES as any)
      )
    )
    .orderBy(ordersTable.createdAt);

  res.json({ order: order ?? null });
});

// ---------------------------------------------------------------------------
// GET /api/customer/orders/history  — delivered + cancelled for this customer
// ---------------------------------------------------------------------------
router.get("/orders/history", async (req, res) => {
  const customerId = req.jwtUser!.sub;

  const orders = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.customerId, customerId),
        inArray(ordersTable.status, COMPLETED_STATUSES as any)
      )
    )
    .orderBy(ordersTable.createdAt);

  res.json({ orders });
});

// ---------------------------------------------------------------------------
// POST /api/customer/push-token — register Expo push token for customer
// ---------------------------------------------------------------------------
router.post("/push-token", (req, res) => {
  const customerId = req.jwtUser!.sub;
  const { token } = req.body as { token?: string };

  if (!token || typeof token !== "string" || token.length < 10) {
    res.status(400).json({ error: "Valid push token required." });
    return;
  }

  setCustomerPushToken(customerId, token);
  res.json({ ok: true });
});

export default router;
