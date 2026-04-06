/**
 * useAdminLive — React hook for the admin live dispatcher
 *
 * Manages:
 *  - Admin WebSocket connection lifecycle (connects on mount, disconnects on unmount)
 *  - Live order list (surgically updated by WS events — no full refetch on each event)
 *  - Live courier list (online/offline status, active order tracking)
 *  - Live stat counters derived from the order/courier state
 *
 * Initial data is loaded from the REST API. After that, WS events
 * keep the state up to date. If the WS drops, state holds its last
 * known value until reconnection.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { adminWS, type ConnectionState, type AdminWSEvent } from "@/lib/adminWS";
import { useGetAdminDashboard, useGetAdminOrders, useGetAdminCouriers } from "@workspace/api-client-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveOrder {
  id: string;
  status: string;
  category: string;
  priceCzk: number;
  courierId: string | null;
  customerId: string | null;
  pickupAddress: { label?: string; address?: string; contactName?: string };
  deliveryAddress: { label?: string; address?: string; contactName?: string };
  createdAt: string;
  updatedAt?: string;
}

export interface LiveCourier {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  onlineStatus: "online" | "offline" | "busy";
  vehicleType: string | null;
  licensePlate: string | null;
  activeOrderId: string | null;
}

export interface LiveStats {
  onlineCouriers: number;
  waitingOrders: number;
  activeDeliveries: number;
  deliveredToday: number;
  cancelledTotal: number;
}

export interface CourierLocation {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  orderId: string | null;
  updatedAt: string;
}

function computeStats(orders: LiveOrder[], couriers: LiveCourier[]): LiveStats {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  return {
    onlineCouriers: couriers.filter(c => c.onlineStatus !== "offline").length,
    waitingOrders: orders.filter(o => o.status === "searching").length,
    activeDeliveries: orders.filter(o => ["assigned", "courier_arrived", "picked_up"].includes(o.status)).length,
    deliveredToday: orders.filter(o =>
      o.status === "delivered" && o.updatedAt && new Date(o.updatedAt) >= todayStart
    ).length,
    cancelledTotal: orders.filter(o => o.status === "cancelled").length,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAdminLive() {
  const [wsState, setWsState] = useState<ConnectionState>(adminWS.getState());
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [couriers, setCouriers] = useState<LiveCourier[]>([]);
  const [courierLocations, setCourierLocations] = useState<Map<string, CourierLocation>>(new Map());
  const [lastEvent, setLastEvent] = useState<{ type: string; at: string } | null>(null);
  const ordersRef = useRef<LiveOrder[]>([]);

  // Keep ref in sync so WS event handlers always see fresh state
  useEffect(() => { ordersRef.current = orders; }, [orders]);

  // ---------------------------------------------------------------------------
  // Bootstrap: load initial data from REST API
  // ---------------------------------------------------------------------------
  const { data: dashboardData } = useGetAdminDashboard({ query: { staleTime: 60_000 } });
  const { data: ordersData } = useGetAdminOrders(
    { limit: 100, offset: 0 },
    { query: { staleTime: 60_000 } }
  );
  const { data: couriersData } = useGetAdminCouriers({ query: { staleTime: 60_000 } });

  // Load orders from REST into live state (once)
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    if (!ordersData?.orders) return;

    bootstrapped.current = true;
    const mapped: LiveOrder[] = ordersData.orders.map((o: any) => ({
      id: o.id,
      status: o.status,
      category: o.category,
      priceCzk: o.priceCzk,
      courierId: o.courierId ?? null,
      customerId: o.customerId ?? null,
      pickupAddress: o.pickupAddress ?? {},
      deliveryAddress: o.deliveryAddress ?? {},
      createdAt: o.createdAt ?? new Date().toISOString(),
      updatedAt: o.updatedAt ?? undefined,
    }));
    // Newest first
    mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setOrders(mapped);
  }, [ordersData]);

  // Load couriers from REST into live state (once)
  const couriersBootstrapped = useRef(false);
  useEffect(() => {
    if (couriersBootstrapped.current) return;
    if (!couriersData?.couriers) return;

    couriersBootstrapped.current = true;
    const mapped: LiveCourier[] = couriersData.couriers.map((c: any) => ({
      id: c.id,
      name: c.name ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
      onlineStatus: (c.onlineStatus ?? "offline") as "online" | "offline" | "busy",
      vehicleType: c.vehicleType ?? null,
      licensePlate: c.vehiclePlate ?? null,
      activeOrderId: null, // not returned by list endpoint; updated via WS events
    }));
    setCouriers(mapped);
  }, [couriersData]);

  // ---------------------------------------------------------------------------
  // WS event handlers
  // ---------------------------------------------------------------------------
  const recordEvent = useCallback((type: string) => {
    setLastEvent({ type, at: new Date().toISOString() });
  }, []);

  const updateOrderStatus = useCallback((payload: Record<string, unknown>) => {
    const { id, status, courierId } = payload as {
      id?: string;
      status?: string;
      courierId?: string | null;
      customerId?: string | null;
    };
    if (!id || !status) return;

    setOrders(prev => prev.map(o =>
      o.id === id
        ? { ...o, status, courierId: courierId !== undefined ? (courierId ?? null) : o.courierId, updatedAt: new Date().toISOString() }
        : o
    ));
  }, []);

  // ---------------------------------------------------------------------------
  // Wire up WS connection and event subscriptions
  // ---------------------------------------------------------------------------
  useEffect(() => {
    adminWS.connect();
    const offState = adminWS.onStateChange(setWsState);

    // New order created
    const offCreated = adminWS.on("order_created", (evt: AdminWSEvent) => {
      const p = evt.payload ?? {};
      const newOrder: LiveOrder = {
        id: (p.id as string) ?? "",
        status: (p.status as string) ?? "searching",
        category: (p.category as string) ?? "flash",
        priceCzk: (p.priceCzk as number) ?? 0,
        courierId: (p.courierId as string | null) ?? null,
        customerId: (p.customerId as string | null) ?? null,
        pickupAddress: (p.pickupAddress as any) ?? {},
        deliveryAddress: (p.deliveryAddress as any) ?? {},
        createdAt: evt.timestamp ?? new Date().toISOString(),
        updatedAt: undefined,
      };
      setOrders(prev => [newOrder, ...prev]);
      recordEvent("order_created");
    });

    // Courier accepted an order
    const offAssigned = adminWS.on("order_assigned", (evt: AdminWSEvent) => {
      updateOrderStatus(evt.payload ?? {});
      recordEvent("order_assigned");
    });

    // Status advanced (courier_arrived, picked_up)
    const offUpdated = adminWS.on("order_updated", (evt: AdminWSEvent) => {
      updateOrderStatus(evt.payload ?? {});
      recordEvent("order_updated");
    });

    // Order delivered
    const offDelivered = adminWS.on("order_delivered", (evt: AdminWSEvent) => {
      updateOrderStatus(evt.payload ?? {});
      recordEvent("order_delivered");
    });

    // Order cancelled
    const offCancelled = adminWS.on("order_cancelled", (evt: AdminWSEvent) => {
      updateOrderStatus(evt.payload ?? {});
      recordEvent("order_cancelled");
    });

    // Courier went online
    const offOnline = adminWS.on("courier_online", (evt: AdminWSEvent) => {
      const courierId = (evt.payload?.courierId as string) ?? null;
      if (!courierId) return;
      setCouriers(prev => prev.map(c =>
        c.id === courierId ? { ...c, onlineStatus: "online" } : c
      ));
      recordEvent("courier_online");
    });

    // Courier went offline
    const offOffline = adminWS.on("courier_offline", (evt: AdminWSEvent) => {
      const courierId = (evt.payload?.courierId as string) ?? null;
      if (!courierId) return;
      setCouriers(prev => prev.map(c =>
        c.id === courierId ? { ...c, onlineStatus: "offline" } : c
      ));
      recordEvent("courier_offline");
    });

    // Courier live location update
    const offLocation = adminWS.on("courier_location", (evt: AdminWSEvent) => {
      const p = evt.payload ?? {};
      const courierId = p.courierId as string | undefined;
      const lat = p.lat as number | undefined;
      const lng = p.lng as number | undefined;
      if (!courierId || typeof lat !== "number" || typeof lng !== "number") return;

      setCourierLocations(prev => {
        const next = new Map(prev);
        next.set(courierId, {
          lat,
          lng,
          heading: (p.heading as number | null) ?? null,
          speed: (p.speed as number | null) ?? null,
          orderId: (p.orderId as string | null) ?? null,
          updatedAt: (p.updatedAt as string) ?? new Date().toISOString(),
        });
        return next;
      });
    });

    return () => {
      offState();
      offCreated();
      offAssigned();
      offUpdated();
      offDelivered();
      offCancelled();
      offOnline();
      offOffline();
      offLocation();
      // Don't disconnect — WS stays alive while Layout is mounted
    };
  }, [updateOrderStatus, recordEvent]);

  const stats = computeStats(orders, couriers);

  return { wsState, orders, couriers, courierLocations, stats, lastEvent, dashboardData };
}
