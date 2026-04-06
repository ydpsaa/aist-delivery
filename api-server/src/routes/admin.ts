/**
 * Admin API routes
 *
 * Protected: requires JWT with role = "admin".
 *
 * Endpoints:
 * - GET  /api/admin/dashboard          — dashboard stats + recent data
 * - GET  /api/admin/users              — list users (searchable/filterable)
 * - PATCH /api/admin/users/:id/role    — promote/demote user role
 * - GET  /api/admin/couriers           — list couriers with profiles
 * - PATCH /api/admin/courier/:userId/profile — update courier vehicle/status
 * - GET  /api/admin/orders             — list orders with filters
 * - GET  /api/admin/orders/:id         — order detail with full join data
 */

import { Router } from "express";
import { db, usersTable, courierProfilesTable, ordersTable } from "@workspace/db";
import type { UserRole, VehicleType, CourierOnlineStatus, OrderStatus, OrderCategory } from "@workspace/db";
import { eq, and, sql, desc, or, ilike, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { emitToCourier } from "../services/courierEventBus.js";
import { emitToCustomer } from "../services/customerEventBus.js";
import { emitToAdmins } from "../services/adminEventBus.js";
import { onOrderCancelled } from "../services/backgroundJobs.js";

const router = Router();

// All admin routes require auth + admin role
router.use(requireAuth, requireRole("admin"));

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard — aggregated stats + recent rows
// ---------------------------------------------------------------------------
router.get("/dashboard", async (_req, res) => {
  // User role counts
  const userCounts = await db
    .select({
      role: usersTable.role,
      count: sql<number>`count(*)::int`,
    })
    .from(usersTable)
    .groupBy(usersTable.role);

  const totalUsers = userCounts.reduce((sum, r) => sum + r.count, 0);
  const totalCustomers = userCounts.find((r) => r.role === "customer")?.count ?? 0;
  const totalCouriers = userCounts.find((r) => r.role === "courier")?.count ?? 0;
  const totalAdmins = userCounts.find((r) => r.role === "admin")?.count ?? 0;

  // Order status counts
  const orderCounts = await db
    .select({
      status: ordersTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(ordersTable)
    .groupBy(ordersTable.status);

  const totalOrders = orderCounts.reduce((sum, r) => sum + r.count, 0);
  const searchingOrders = orderCounts.find((r) => r.status === "searching")?.count ?? 0;
  const deliveredOrders = orderCounts.find((r) => r.status === "delivered")?.count ?? 0;
  const activeOrders = orderCounts
    .filter((r) => ["assigned", "courier_arrived", "picked_up"].includes(r.status))
    .reduce((sum, r) => sum + r.count, 0);

  // Online couriers
  const [onlineCouriersRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(courierProfilesTable)
    .where(eq(courierProfilesTable.onlineStatus, "online"));
  const onlineCouriers = onlineCouriersRow?.count ?? 0;

  // Recent orders (5) with customer/courier names
  const recentOrderRows = await db
    .select({
      id: ordersTable.id,
      customerId: ordersTable.customerId,
      courierId: ordersTable.courierId,
      category: ordersTable.category,
      pickupAddress: ordersTable.pickupAddress,
      deliveryAddress: ordersTable.deliveryAddress,
      priceCzk: ordersTable.priceCzk,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
      customerName: usersTable.name,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.customerId, usersTable.id))
    .orderBy(desc(ordersTable.createdAt))
    .limit(5);

  // Get courier names for recent orders
  const courierIds = recentOrderRows
    .map((o) => o.courierId)
    .filter((id): id is string => id !== null);

  const courierMap: Record<string, string> = {};
  if (courierIds.length > 0) {
    const couriers = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(inArray(usersTable.id, courierIds));
    for (const c of couriers) {
      courierMap[c.id] = c.name;
    }
  }

  const recentOrders = recentOrderRows.map((o) => ({
    id: o.id,
    customerId: o.customerId,
    customerName: o.customerName,
    courierId: o.courierId,
    courierName: o.courierId ? (courierMap[o.courierId] ?? null) : null,
    category: o.category,
    pickupAddress: o.pickupAddress,
    deliveryAddress: o.deliveryAddress,
    priceCzk: o.priceCzk,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
  }));

  // Recent users (5)
  const recentUserRows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      phone: usersTable.phone,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(desc(usersTable.createdAt))
    .limit(5);

  const recentUsers = recentUserRows.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));

  res.json({
    totalUsers,
    totalCustomers,
    totalCouriers,
    totalAdmins,
    totalOrders,
    activeOrders,
    searchingOrders,
    deliveredOrders,
    onlineCouriers,
    recentOrders,
    recentUsers,
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/users  — list all users (with optional search + role filter)
// ---------------------------------------------------------------------------
router.get("/users", async (req, res) => {
  const { search, role } = req.query as { search?: string; role?: string };

  const conditions = [];
  if (role && ["customer", "courier", "admin"].includes(role)) {
    conditions.push(eq(usersTable.role, role as UserRole));
  }
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      or(ilike(usersTable.name, term), ilike(usersTable.email, term))
    );
  }

  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      phone: usersTable.phone,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(usersTable.createdAt));

  const users = rows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }));

  res.json({ users });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users/:id/role  — promote/demote user role
// ---------------------------------------------------------------------------
router.patch("/users/:id/role", async (req, res) => {
  const userId = req.params["id"]!;
  const { role } = req.body as { role?: string };

  const validRoles: UserRole[] = ["customer", "courier", "admin"];
  if (!role || !validRoles.includes(role as UserRole)) {
    res.status(400).json({ error: `role must be one of: ${validRoles.join(", ")}` });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ role: role as UserRole, updatedAt: new Date() })
    .where(eq(usersTable.id, userId))
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      phone: usersTable.phone,
      createdAt: usersTable.createdAt,
    });

  // If promoting to courier, auto-create courier profile if it doesn't exist
  if (role === "courier") {
    await db
      .insert(courierProfilesTable)
      .values({ userId })
      .onConflictDoNothing();
  }

  res.json({ user: { ...updated, createdAt: updated!.createdAt.toISOString() } });
});

// ---------------------------------------------------------------------------
// GET /api/admin/couriers  — list couriers with their profiles
// ---------------------------------------------------------------------------
router.get("/couriers", async (_req, res) => {
  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      phone: usersTable.phone,
      createdAt: usersTable.createdAt,
      vehicleType: courierProfilesTable.vehicleType,
      vehiclePlate: courierProfilesTable.vehiclePlate,
      onlineStatus: courierProfilesTable.onlineStatus,
    })
    .from(usersTable)
    .leftJoin(courierProfilesTable, eq(usersTable.id, courierProfilesTable.userId))
    .where(eq(usersTable.role, "courier"))
    .orderBy(desc(usersTable.createdAt));

  const couriers = rows.map((c) => ({
    id: c.id,
    email: c.email,
    name: c.name,
    phone: c.phone,
    onlineStatus: c.onlineStatus ?? "offline",
    vehicleType: c.vehicleType ?? null,
    vehiclePlate: c.vehiclePlate ?? null,
    createdAt: c.createdAt.toISOString(),
  }));

  res.json({ couriers });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/courier/:userId/profile  — update courier vehicle info
// ---------------------------------------------------------------------------
router.patch("/courier/:userId/profile", async (req, res) => {
  const userId = req.params["userId"]!;
  const { vehicleType, vehiclePlate, onlineStatus } = req.body as {
    vehicleType?: string;
    vehiclePlate?: string;
    onlineStatus?: string;
  };

  const validVehicles: VehicleType[] = ["bike", "scooter", "car", "van"];
  const validStatuses: CourierOnlineStatus[] = ["online", "offline", "busy"];

  const updates: Partial<{
    vehicleType: VehicleType;
    vehiclePlate: string;
    onlineStatus: CourierOnlineStatus;
    updatedAt: Date;
  }> = { updatedAt: new Date() };

  if (vehicleType !== undefined) {
    if (!validVehicles.includes(vehicleType as VehicleType)) {
      res.status(400).json({ error: `vehicleType must be one of: ${validVehicles.join(", ")}` });
      return;
    }
    updates.vehicleType = vehicleType as VehicleType;
  }

  if (vehiclePlate !== undefined) {
    updates.vehiclePlate = vehiclePlate;
  }

  if (onlineStatus !== undefined) {
    if (!validStatuses.includes(onlineStatus as CourierOnlineStatus)) {
      res.status(400).json({ error: `onlineStatus must be one of: ${validStatuses.join(", ")}` });
      return;
    }
    updates.onlineStatus = onlineStatus as CourierOnlineStatus;
  }

  const [profile] = await db
    .update(courierProfilesTable)
    .set(updates)
    .where(eq(courierProfilesTable.userId, userId))
    .returning();

  if (!profile) {
    res.status(404).json({ error: "Courier profile not found" });
    return;
  }

  res.json({
    profile: {
      userId: profile.userId,
      vehicleType: profile.vehicleType ?? null,
      vehiclePlate: profile.vehiclePlate ?? null,
      onlineStatus: profile.onlineStatus,
      updatedAt: profile.updatedAt.toISOString(),
    },
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/orders  — list orders with optional filters
// ---------------------------------------------------------------------------
router.get("/orders", async (req, res) => {
  const { status, category, courierId, limit, offset } = req.query as {
    status?: string;
    category?: string;
    courierId?: string;
    limit?: string;
    offset?: string;
  };

  const validStatuses: OrderStatus[] = [
    "searching", "assigned", "courier_arrived", "picked_up", "delivered", "cancelled",
  ];
  const validCategories: OrderCategory[] = ["flash", "window", "buy", "cargo"];

  const conditions = [];
  if (status && validStatuses.includes(status as OrderStatus)) {
    conditions.push(eq(ordersTable.status, status as OrderStatus));
  }
  if (category && validCategories.includes(category as OrderCategory)) {
    conditions.push(eq(ordersTable.category, category as OrderCategory));
  }
  if (courierId) {
    conditions.push(eq(ordersTable.courierId, courierId));
  }

  const limitVal = Math.min(parseInt(limit ?? "50", 10) || 50, 200);
  const offsetVal = parseInt(offset ?? "0", 10) || 0;

  // Get total count
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  const total = countRow?.count ?? 0;

  // Get orders with customer name
  const rows = await db
    .select({
      id: ordersTable.id,
      customerId: ordersTable.customerId,
      courierId: ordersTable.courierId,
      category: ordersTable.category,
      pickupAddress: ordersTable.pickupAddress,
      deliveryAddress: ordersTable.deliveryAddress,
      priceCzk: ordersTable.priceCzk,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
      customerName: usersTable.name,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.customerId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(ordersTable.createdAt))
    .limit(limitVal)
    .offset(offsetVal);

  // Resolve courier names
  const courierIds = [...new Set(rows.map((o) => o.courierId).filter((id): id is string => id !== null))];
  const courierMap: Record<string, string> = {};
  if (courierIds.length > 0) {
    const couriers = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(inArray(usersTable.id, courierIds));
    for (const c of couriers) {
      courierMap[c.id] = c.name;
    }
  }

  const orders = rows.map((o) => ({
    id: o.id,
    customerId: o.customerId,
    customerName: o.customerName ?? null,
    courierId: o.courierId ?? null,
    courierName: o.courierId ? (courierMap[o.courierId] ?? null) : null,
    category: o.category,
    pickupAddress: o.pickupAddress,
    deliveryAddress: o.deliveryAddress,
    priceCzk: o.priceCzk,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
  }));

  res.json({ orders, total });
});

// ---------------------------------------------------------------------------
// GET /api/admin/orders/:id  — full order detail
// ---------------------------------------------------------------------------
router.get("/orders/:id", async (req, res) => {
  const orderId = req.params["id"]!;

  const [row] = await db
    .select({
      id: ordersTable.id,
      customerId: ordersTable.customerId,
      courierId: ordersTable.courierId,
      category: ordersTable.category,
      pickupAddress: ordersTable.pickupAddress,
      deliveryAddress: ordersTable.deliveryAddress,
      description: ordersTable.description,
      priceCzk: ordersTable.priceCzk,
      distanceKm: ordersTable.distanceKm,
      estimatedMinutes: ordersTable.estimatedMinutes,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
      updatedAt: ordersTable.updatedAt,
      customerName: usersTable.name,
      customerEmail: usersTable.email,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.customerId, usersTable.id))
    .where(eq(ordersTable.id, orderId))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  // Fetch courier details if present
  let courierName: string | null = null;
  let courierEmail: string | null = null;
  if (row.courierId) {
    const [courier] = await db
      .select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, row.courierId))
      .limit(1);
    if (courier) {
      courierName = courier.name;
      courierEmail = courier.email;
    }
  }

  const order = {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName ?? null,
    customerEmail: row.customerEmail ?? null,
    courierId: row.courierId ?? null,
    courierName,
    courierEmail,
    category: row.category,
    pickupAddress: row.pickupAddress,
    deliveryAddress: row.deliveryAddress,
    description: row.description ?? null,
    priceCzk: row.priceCzk,
    distanceKm: row.distanceKm ?? null,
    estimatedMinutes: row.estimatedMinutes ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  res.json({ order });
});

// ---------------------------------------------------------------------------
// POST /api/admin/orders/:id/cancel  — force-cancel an order
// ---------------------------------------------------------------------------
router.post("/orders/:id/cancel", async (req, res) => {
  const orderId = req.params["id"]!;

  const [row] = await db
    .select({
      status: ordersTable.status,
      courierId: ordersTable.courierId,
      customerId: ordersTable.customerId,
      stripePaymentIntentId: ordersTable.stripePaymentIntentId,
    })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));

  if (!row) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (row.status === "cancelled" || row.status === "delivered") {
    res.status(422).json({ error: `Cannot cancel order in status: ${row.status}` });
    return;
  }

  await db
    .update(ordersTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId));

  // Notify assigned courier if there is one
  if (row.courierId) {
    // 1. WebSocket real-time event to courier (instant, primary)
    emitToCourier(row.courierId, {
      type: "order_cancelled",
      payload: { orderId },
    });

    // 2. Expo push notification as fallback when courier app is closed/backgrounded
    const { notifyCourierById } = await import("../services/notificationService.js");
    notifyCourierById(row.courierId, {
      type: "order_cancelled",
      title: "Order cancelled",
      body: "The order you accepted has been cancelled by the dispatcher.",
      data: { orderId },
    });
  }

  // Notify the customer (instant via WS)
  if (row.customerId) {
    emitToCustomer(row.customerId, {
      type: "order_cancelled",
      payload: { orderId },
    });
  }

  // Notify the admin dispatcher
  emitToAdmins({
    type: "order_cancelled",
    payload: { id: orderId, status: "cancelled", courierId: row.courierId, customerId: row.customerId },
  });

  // FinOps: trigger refund evaluation on admin cancel
  onOrderCancelled(orderId, true);

  // Stripe: cancel / release hold (fire-and-forget)
  if (row.stripePaymentIntentId) {
    import("../services/stripeService.js").then(async ({ cancelPaymentIntent }) => {
      await cancelPaymentIntent(orderId, row.stripePaymentIntentId!);
      await db.update(ordersTable)
        .set({ paymentStatus: "cancelled", updatedAt: new Date() })
        .where(eq(ordersTable.id, orderId));
    }).catch(console.error);
  }

  res.json({ ok: true, orderId, status: "cancelled" });
});

// ---------------------------------------------------------------------------
// GET /api/admin/finance/stats  — Stripe + FinOps summary
// ---------------------------------------------------------------------------
router.get("/finance/stats", async (_req, res) => {
  const result = await db.execute(
    sql`
      SELECT
        COUNT(*) FILTER (WHERE payment_status = 'requires_capture')  AS pending_capture,
        COUNT(*) FILTER (WHERE payment_status = 'captured')          AS captured,
        COUNT(*) FILTER (WHERE payment_status = 'cancelled')         AS voided,
        COUNT(*) FILTER (WHERE payment_status = 'refunded')          AS refunded,
        COALESCE(SUM(price_czk) FILTER (WHERE payment_status = 'captured'), 0) AS total_captured_czk,
        COALESCE(SUM(refunded_amount_czk) FILTER (WHERE refunded_amount_czk IS NOT NULL), 0) AS total_refunded_czk,
        COUNT(*) FILTER (WHERE stripe_payment_intent_id IS NOT NULL) AS stripe_orders
      FROM orders
    `
  );
  // drizzle-orm pg driver returns { rows: [...] }
  const rows = (result as unknown as { rows: Record<string, unknown>[] }).rows;
  res.json({ stats: rows?.[0] ?? {} });
});

export default router;
