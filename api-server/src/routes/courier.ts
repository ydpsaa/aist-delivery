/**
 * Courier API routes
 *
 * All routes require a valid JWT with role = "courier".
 * Business rules live in orderStateMachine.ts — not here.
 *
 * Real-time events:
 *   Accept order     → emit order_assigned   to self
 *   Advance status   → emit order_updated    to self
 *   Status toggle    → emit courier_status_updated to self
 *   Push token       → POST /api/courier/push-token
 */

import type { Request, Response } from "express";
import { Router } from "express";
import { db, ordersTable, courierProfilesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  validateCourierTransition,
  ACTIVE_STATUSES,
  COMPLETED_STATUSES,
} from "../services/orderStateMachine.js";
import { emitToCourier } from "../services/courierEventBus.js";
import { emitToCustomer } from "../services/customerEventBus.js";
import { emitToAdmins } from "../services/adminEventBus.js";
import { onOrderDelivered } from "../services/backgroundJobs.js";

const router = Router();

// All courier routes require auth + courier role
router.use(requireAuth, requireRole("courier"));

// ---------------------------------------------------------------------------
// GET /api/courier/me  — courier profile
// ---------------------------------------------------------------------------
router.get("/me", async (req, res) => {
  const userId = req.jwtUser!.sub;

  const [profile] = await db
    .select()
    .from(courierProfilesTable)
    .where(eq(courierProfilesTable.userId, userId));

  if (!profile) {
    const [created] = await db
      .insert(courierProfilesTable)
      .values({ userId })
      .returning();
    res.json({ profile: created });
    return;
  }

  res.json({ profile });
});

// ---------------------------------------------------------------------------
// POST /api/courier/push-token  — save / refresh Expo push token
// ---------------------------------------------------------------------------
router.post("/push-token", async (req, res) => {
  const userId = req.jwtUser!.sub;
  const { token } = req.body as { token?: string };

  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token is required" });
    return;
  }

  const [profile] = await db
    .insert(courierProfilesTable)
    .values({ userId, pushToken: token })
    .onConflictDoUpdate({
      target: courierProfilesTable.userId,
      set: { pushToken: token, updatedAt: new Date() },
    })
    .returning();

  res.json({ ok: true, pushToken: profile.pushToken });
});

// ---------------------------------------------------------------------------
// POST /api/courier/location  — update courier live location
// ---------------------------------------------------------------------------
router.post("/location", async (req, res) => {
  const userId = req.jwtUser!.sub;
  const { lat, lng, heading, speed } = req.body as {
    lat?: number;
    lng?: number;
    heading?: number;
    speed?: number;
  };

  if (typeof lat !== "number" || typeof lng !== "number") {
    res.status(400).json({ error: "lat and lng are required numbers" });
    return;
  }

  await db
    .update(courierProfilesTable)
    .set({
      lastLat: lat,
      lastLng: lng,
      lastHeading: heading ?? null,
      lastSpeed: speed ?? null,
      locationUpdatedAt: new Date(),
    })
    .where(eq(courierProfilesTable.userId, userId));

  // Find active order for this courier (to target the right customer)
  const [activeOrder] = await db
    .select({ id: ordersTable.id, customerId: ordersTable.customerId })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.courierId, userId),
        inArray(ordersTable.status, ACTIVE_STATUSES)
      )
    );

  const locationPayload = {
    courierId: userId,
    lat,
    lng,
    heading: heading ?? null,
    speed: speed ?? null,
    orderId: activeOrder?.id ?? null,
    updatedAt: new Date().toISOString(),
  };

  // Notify the customer of this active order
  if (activeOrder?.customerId) {
    emitToCustomer(activeOrder.customerId, {
      type: "courier_location",
      payload: locationPayload,
    });
  }

  // Notify all admins (dispatcher dashboard)
  emitToAdmins({
    type: "courier_location",
    payload: locationPayload,
  });

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /api/courier/status  — toggle online/offline
// ---------------------------------------------------------------------------
router.post("/status", async (req, res) => {
  const userId = req.jwtUser!.sub;
  const { status } = req.body as { status?: string };

  if (status !== "online" && status !== "offline") {
    res.status(400).json({ error: "status must be 'online' or 'offline'" });
    return;
  }

  const [profile] = await db
    .insert(courierProfilesTable)
    .values({ userId, onlineStatus: status })
    .onConflictDoUpdate({
      target: courierProfilesTable.userId,
      set: { onlineStatus: status, updatedAt: new Date() },
    })
    .returning();

  // Emit live status update to this courier's WS connection(s)
  emitToCourier(userId, {
    type: "courier_status_updated",
    payload: { status: profile.onlineStatus },
  });

  // Notify admin dispatcher: courier came online or offline
  const adminEventType = profile.onlineStatus === "online" ? "courier_online" : "courier_offline";
  emitToAdmins({
    type: adminEventType,
    payload: { courierId: userId, status: profile.onlineStatus },
  });

  res.json({ profile });
});

// ---------------------------------------------------------------------------
// GET /api/courier/orders/available  — orders in "searching" status
// ---------------------------------------------------------------------------
router.get("/orders/available", async (req, res) => {
  const userId = req.jwtUser!.sub;

  const [profile] = await db
    .select()
    .from(courierProfilesTable)
    .where(eq(courierProfilesTable.userId, userId));

  if (!profile || profile.onlineStatus !== "online") {
    res.json({ orders: [] });
    return;
  }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.status, "searching"));

  res.json({ orders });
});

// ---------------------------------------------------------------------------
// GET /api/courier/orders/current  — active order assigned to this courier
// ---------------------------------------------------------------------------
router.get("/orders/current", async (req, res) => {
  const userId = req.jwtUser!.sub;

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.courierId, userId),
        inArray(ordersTable.status, ACTIVE_STATUSES)
      )
    );

  res.json({ order: order ?? null });
});

// ---------------------------------------------------------------------------
// GET /api/courier/orders/history  — delivered/cancelled by this courier
// ---------------------------------------------------------------------------
router.get("/orders/history", async (req, res) => {
  const userId = req.jwtUser!.sub;

  const orders = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.courierId, userId),
        inArray(ordersTable.status, COMPLETED_STATUSES)
      )
    );

  res.json({ orders });
});

// ---------------------------------------------------------------------------
// POST /api/courier/orders/:id/accept
// ---------------------------------------------------------------------------
router.post("/orders/:id/accept", async (req, res) => {
  const userId = req.jwtUser!.sub;
  const orderId = req.params["id"]!;

  // Block if courier already has active order
  const [activeOrder] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.courierId, userId),
        inArray(ordersTable.status, ACTIVE_STATUSES)
      )
    );

  if (activeOrder) {
    res.status(409).json({ error: "You already have an active order. Complete it first." });
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const validation = validateCourierTransition("accept", order.status);
  if (!validation.valid) {
    res.status(422).json({ error: validation.error });
    return;
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ status: validation.nextStatus, courierId: userId, updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId))
    .returning();

  // Emit real-time events
  // 1. Courier's own view: order is now active
  emitToCourier(userId, {
    type: "order_assigned",
    payload: { order: updated },
  });
  // 2. Customer's view: a courier has been assigned to their order
  if (updated!.customerId) {
    emitToCustomer(updated!.customerId, {
      type: "courier_assigned",
      payload: {
        orderId: updated!.id,
        status: updated!.status,
        courierId: userId,
      },
    });
  }

  // 3. Admin dispatcher: order is now assigned
  emitToAdmins({
    type: "order_assigned",
    payload: {
      id: updated!.id,
      status: updated!.status,
      courierId: userId,
      customerId: updated!.customerId,
      category: updated!.category,
      priceCzk: updated!.priceCzk,
      pickupAddress: updated!.pickupAddress,
      deliveryAddress: updated!.deliveryAddress,
    },
  });

  res.json({ order: updated });
});

// ---------------------------------------------------------------------------
// POST /api/courier/orders/:id/decline  — no status change
// ---------------------------------------------------------------------------
router.post("/orders/:id/decline", async (req, res) => {
  const orderId = req.params["id"]!;

  const [order] = await db
    .select({ id: ordersTable.id, status: ordersTable.status })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const validation = validateCourierTransition("decline", order.status);
  if (!validation.valid) {
    res.status(422).json({ error: validation.error });
    return;
  }

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Shared handler for status-advancing actions
// ---------------------------------------------------------------------------
async function advanceOrder(req: Request, res: Response, action: string) {
  const userId = req.jwtUser!.sub;
  const orderId = req.params["id"]!;

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.courierId, userId)));

  if (!order) {
    res.status(404).json({ error: "Order not found or not assigned to you" });
    return;
  }

  const validation = validateCourierTransition(action, order.status);
  if (!validation.valid) {
    res.status(422).json({ error: validation.error });
    return;
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ status: validation.nextStatus, updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId))
    .returning();

  // Emit real-time events to courier and customer
  const courierEventType = updated!.status === "delivered" ? "order_delivered" : "order_updated";
  emitToCourier(userId, { type: courierEventType, payload: { order: updated } });

  // Map order status to customer event type
  if (updated!.customerId) {
    const customerEventMap: Record<string, "courier_arrived" | "order_picked_up" | "order_delivered"> = {
      courier_arrived: "courier_arrived",
      picked_up: "order_picked_up",
      delivered: "order_delivered",
    };
    const customerEventType = customerEventMap[updated!.status];
    if (customerEventType) {
      emitToCustomer(updated!.customerId, {
        type: customerEventType,
        payload: { orderId: updated!.id, status: updated!.status },
      });
    }
  }

  // FinOps: trigger invoice generation + SLA check on delivery
  if (updated!.status === "delivered") {
    onOrderDelivered(updated!.id);

    // Stripe: capture payment (fire-and-forget)
    // SAFETY GUARD: skip if already captured (idempotency)
    if (updated!.stripePaymentIntentId && updated!.paymentStatus !== "captured") {
      import("../services/stripeService.js").then(async ({ capturePayment }) => {
        const result = await capturePayment(updated!.id, updated!.stripePaymentIntentId!);
        if (result.success) {
          await db.update(ordersTable)
            .set({ paymentStatus: "captured", stripeChargeId: result.chargeId ?? null, capturedAt: new Date(), updatedAt: new Date() })
            .where(eq(ordersTable.id, updated!.id));
          console.info(`[Stripe] Payment captured for order ${updated!.id}: ${result.chargeId} (live: ${result.live})`);
        } else {
          console.error(`[Stripe] Capture failed for order ${updated!.id}: ${result.error ?? "unknown error"}`);
        }
      }).catch(console.error);
    } else if (updated!.paymentStatus === "captured") {
      console.warn(`[Stripe] GUARD: Order ${updated!.id} already captured — skipping duplicate capture`);
    }
  }

  // Admin dispatcher: order status changed
  const adminOrderEventType = updated!.status === "delivered" ? "order_delivered" : "order_updated";
  emitToAdmins({
    type: adminOrderEventType,
    payload: {
      id: updated!.id,
      status: updated!.status,
      courierId: updated!.courierId,
      customerId: updated!.customerId,
      category: updated!.category,
      priceCzk: updated!.priceCzk,
    },
  });

  res.json({ order: updated });
}

router.post("/orders/:id/arrived", (req, res) => advanceOrder(req, res, "arrived"));
router.post("/orders/:id/picked-up", (req, res) => advanceOrder(req, res, "picked-up"));
router.post("/orders/:id/delivered", (req, res) => advanceOrder(req, res, "delivered"));

export default router;
