/**
 * CourierContext — backend-driven courier state
 *
 * Real-time updates are handled via WebSocket (courierWebSocket.ts).
 * Polling is kept as a fallback at 60s (down from 10s) for when the
 * WebSocket connection is unavailable.
 *
 * Event flow:
 *   1. Courier authenticates → WS connects
 *   2. Backend emits events → state updates immediately
 *   3. WS disconnected → reconnect with backoff; polling continues
 *   4. Courier logs out → WS disconnects, polling stops
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  getCourierProfile,
  setCourierStatus,
  getAvailableOrders,
  getCurrentOrder,
  getOrderHistory,
  acceptOrder as apiAcceptOrder,
  declineOrder as apiDeclineOrder,
  markArrived,
  markPickedUp,
  markDelivered,
  type CourierOrder,
  type CourierProfile,
  type CourierStatus,
  type OrderStatus,
} from "@/services/courierService";
import { registerCourierPushToken } from "@/services/notificationService";
import {
  courierWS,
  connectCourierWS,
  type ConnectionState,
} from "@/services/courierWebSocket";
import { startTracking, stopTracking } from "@/services/locationService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./AuthContext";

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------
export type { CourierOrder, CourierStatus, OrderStatus };

export interface TodaySummary {
  earningsCzk: number;
  deliveries: number;
  hoursActive: number;
}

interface CourierContextType {
  // State
  status: CourierStatus;
  profile: CourierProfile | null;
  availableOrders: CourierOrder[];
  activeOrder: CourierOrder | null;
  completedOrders: CourierOrder[];
  todaySummary: TodaySummary;

  // Loading / error
  isLoadingOrders: boolean;
  ordersError: string | null;

  // Real-time connection state
  liveState: ConnectionState;

  // Actions
  setStatus: (s: CourierStatus) => Promise<void>;
  acceptOrder: (orderId: string) => Promise<void>;
  declineOrder: (orderId: string) => Promise<void>;
  advanceOrderStatus: (orderId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Fallback polling interval when WebSocket is unavailable.
 * 60 s is generous — WS will normally handle updates well within this window.
 */
const FALLBACK_POLL_INTERVAL_MS = 60_000;

const ACTIVE_STATUSES: OrderStatus[] = ["assigned", "courier_arrived", "picked_up"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeSummary(completed: CourierOrder[]): TodaySummary {
  const delivered = completed.filter((o) => o.status === "delivered");
  return {
    earningsCzk: delivered.reduce((sum, o) => sum + o.priceCzk, 0),
    deliveries: delivered.length,
    hoursActive: 0,
  };
}

function nextActionForStatus(status: OrderStatus): string | null {
  const MAP: Partial<Record<OrderStatus, string>> = {
    assigned: "arrived",
    courier_arrived: "picked-up",
    picked_up: "delivered",
  };
  return MAP[status] ?? null;
}

// ---------------------------------------------------------------------------
// Context defaults
// ---------------------------------------------------------------------------
const CourierContext = createContext<CourierContextType>({
  status: "offline",
  profile: null,
  availableOrders: [],
  activeOrder: null,
  completedOrders: [],
  todaySummary: { earningsCzk: 0, deliveries: 0, hoursActive: 0 },
  isLoadingOrders: false,
  ordersError: null,
  liveState: "disconnected",
  setStatus: async () => {},
  acceptOrder: async () => {},
  declineOrder: async () => {},
  advanceOrderStatus: async () => {},
  refresh: async () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function CourierProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isCourier } = useAuth();

  const [profile, setProfile] = useState<CourierProfile | null>(null);
  const [status, setStatusState] = useState<CourierStatus>("offline");
  const [availableOrders, setAvailableOrders] = useState<CourierOrder[]>([]);
  const [activeOrder, setActiveOrder] = useState<CourierOrder | null>(null);
  const [completedOrders, setCompletedOrders] = useState<CourierOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<ConnectionState>("disconnected");

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pushRegistered = useRef(false);

  // -------------------------------------------------------------------------
  // Core data fetch (used for initial load + fallback polling)
  // -------------------------------------------------------------------------
  const fetchAll = useCallback(async () => {
    if (!isAuthenticated || !isCourier) return;

    setIsLoadingOrders(true);
    setOrdersError(null);

    try {
      const [available, current, history] = await Promise.all([
        getAvailableOrders(),
        getCurrentOrder(),
        getOrderHistory(),
      ]);
      setAvailableOrders(available);
      setActiveOrder(current);
      setCompletedOrders(history);
    } catch (err) {
      setOrdersError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setIsLoadingOrders(false);
    }
  }, [isAuthenticated, isCourier]);

  const loadProfile = useCallback(async () => {
    if (!isAuthenticated || !isCourier) return;
    try {
      const p = await getCourierProfile();
      setProfile(p);
      setStatusState(p.onlineStatus === "online" ? "online" : "offline");
    } catch {
      // Profile remains null — handled in UI
    }
  }, [isAuthenticated, isCourier]);

  // -------------------------------------------------------------------------
  // WebSocket real-time event handlers
  // -------------------------------------------------------------------------
  const handleNewOrderAvailable = useCallback((event: { payload?: Record<string, unknown> }) => {
    if (status !== "online") return; // Only show new orders when online

    const payload = event.payload as {
      orderId?: string;
      category?: string;
      priceCzk?: number;
      pickupAddress?: CourierOrder["pickupAddress"];
      deliveryAddress?: CourierOrder["deliveryAddress"];
      estimatedMinutes?: number;
    };

    if (!payload?.orderId) return;

    // Add to available orders if not already present
    setAvailableOrders((prev) => {
      if (prev.some((o) => o.id === payload.orderId)) return prev;

      // Optimistic add with data from WS payload
      const newOrder: CourierOrder = {
        id: payload.orderId!,
        status: "searching",
        category: (payload.category as CourierOrder["category"]) ?? "flash",
        priceCzk: payload.priceCzk ?? 0,
        pickupAddress: payload.pickupAddress ?? { label: "", address: "", contactName: "", contactPhone: "" },
        deliveryAddress: payload.deliveryAddress ?? { label: "", address: "", contactName: "", contactPhone: "" },
        estimatedMinutes: payload.estimatedMinutes ?? null,
        distanceKm: null,
        description: null,
        customerId: "",
        courierId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return [newOrder, ...prev];
    });
  }, [status]);

  const handleOrderAssigned = useCallback((event: { payload?: Record<string, unknown> }) => {
    const order = event.payload?.["order"] as CourierOrder | undefined;
    if (!order) return;

    setAvailableOrders((prev) => prev.filter((o) => o.id !== order.id));
    setActiveOrder(order);
  }, []);

  const handleOrderUpdated = useCallback((event: { payload?: Record<string, unknown> }) => {
    const order = event.payload?.["order"] as CourierOrder | undefined;
    if (!order) return;

    setActiveOrder((prev) =>
      prev?.id === order.id ? { ...prev, ...order } : prev
    );
  }, []);

  const handleOrderCancelled = useCallback((event: { payload?: Record<string, unknown> }) => {
    const orderId = event.payload?.["orderId"] as string | undefined;
    if (!orderId) return;

    setActiveOrder((prev) => {
      if (prev?.id !== orderId) return prev;
      // Move to completed history with cancelled status
      setCompletedOrders((hist) => [
        { ...prev, status: "cancelled" as OrderStatus },
        ...hist,
      ]);
      return null;
    });
    setAvailableOrders((prev) => prev.filter((o) => o.id !== orderId));
  }, []);

  const handleOrderDelivered = useCallback((event: { payload?: Record<string, unknown> }) => {
    const order = event.payload?.["order"] as CourierOrder | undefined;
    if (!order) return;

    setActiveOrder((prev) => {
      if (prev?.id !== order.id) return prev;
      setCompletedOrders((hist) => [order, ...hist]);
      return null;
    });
  }, []);

  // -------------------------------------------------------------------------
  // WebSocket lifecycle — connect when courier authenticates
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || !isCourier) {
      courierWS.disconnect();
      setLiveState("disconnected");
      return;
    }

    // Connect
    connectCourierWS();

    // Track connection state
    const offState = courierWS.onStateChange(setLiveState);

    // Subscribe to events
    const offNew = courierWS.on("new_order_available", handleNewOrderAvailable as Parameters<typeof courierWS.on>[1]);
    const offAssigned = courierWS.on("order_assigned", handleOrderAssigned as Parameters<typeof courierWS.on>[1]);
    const offUpdated = courierWS.on("order_updated", handleOrderUpdated as Parameters<typeof courierWS.on>[1]);
    const offCancelled = courierWS.on("order_cancelled", handleOrderCancelled as Parameters<typeof courierWS.on>[1]);
    const offDelivered = courierWS.on("order_delivered", handleOrderDelivered as Parameters<typeof courierWS.on>[1]);

    return () => {
      offState();
      offNew();
      offAssigned();
      offUpdated();
      offCancelled();
      offDelivered();
    };
  }, [
    isAuthenticated,
    isCourier,
    handleNewOrderAvailable,
    handleOrderAssigned,
    handleOrderUpdated,
    handleOrderCancelled,
    handleOrderDelivered,
  ]);

  // -------------------------------------------------------------------------
  // Push notification registration — run once when courier authenticates
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || !isCourier) {
      pushRegistered.current = false;
      return;
    }
    if (pushRegistered.current) return;

    pushRegistered.current = true;
    registerCourierPushToken().catch((err) => {
      console.warn("[CourierContext] Push registration failed:", err);
    });
  }, [isAuthenticated, isCourier]);

  // -------------------------------------------------------------------------
  // Location tracking — start when online + has active order, stop otherwise
  // -------------------------------------------------------------------------
  useEffect(() => {
    const shouldTrack = isAuthenticated && isCourier && status === "online" && !!activeOrder;

    if (shouldTrack) {
      AsyncStorage.getItem("@aist_access_token").then((token) => {
        if (token) startTracking(token);
      }).catch(() => {});
    } else {
      stopTracking();
    }

    return () => {
      stopTracking();
    };
  }, [isAuthenticated, isCourier, status, activeOrder?.id]);

  // -------------------------------------------------------------------------
  // Initial load
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || !isCourier) return;
    loadProfile();
    fetchAll();
  }, [isAuthenticated, isCourier, loadProfile, fetchAll]);

  // -------------------------------------------------------------------------
  // Fallback polling at 60s — keeps data fresh when WS is unavailable
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || !isCourier) {
      if (pollTimer.current) clearInterval(pollTimer.current);
      return;
    }

    pollTimer.current = setInterval(fetchAll, FALLBACK_POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [isAuthenticated, isCourier, fetchAll]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  const setStatus = useCallback(async (s: CourierStatus) => {
    // Optimistic update
    setStatusState(s);
    if (profile) setProfile({ ...profile, onlineStatus: s });

    try {
      const updated = await setCourierStatus(s);
      setProfile(updated);
      setStatusState(updated.onlineStatus === "online" ? "online" : "offline");

      if (s === "online") await fetchAll();
    } catch {
      // Revert on failure
      const prev: CourierStatus = s === "online" ? "offline" : "online";
      setStatusState(prev);
    }
  }, [profile, fetchAll]);

  const acceptOrder = useCallback(async (orderId: string) => {
    const updated = await apiAcceptOrder(orderId);
    // WS event (order_assigned) will also update state, but API response
    // is authoritative — apply immediately too
    setAvailableOrders((prev) => prev.filter((o) => o.id !== orderId));
    setActiveOrder(updated);
  }, []);

  const declineOrder = useCallback(async (orderId: string) => {
    await apiDeclineOrder(orderId);
    setAvailableOrders((prev) => prev.filter((o) => o.id !== orderId));
  }, []);

  const advanceOrderStatus = useCallback(async (orderId: string) => {
    if (!activeOrder || activeOrder.id !== orderId) return;

    const action = nextActionForStatus(activeOrder.status);
    if (!action) return;

    let updated: CourierOrder;
    if (action === "arrived") updated = await markArrived(orderId);
    else if (action === "picked-up") updated = await markPickedUp(orderId);
    else updated = await markDelivered(orderId);

    // Apply immediately (WS will also confirm via order_updated/order_delivered)
    if (updated.status === "delivered") {
      setActiveOrder(null);
      setCompletedOrders((prev) => [updated, ...prev]);
    } else {
      setActiveOrder(updated);
    }
  }, [activeOrder]);

  const refresh = useCallback(async () => {
    await Promise.all([loadProfile(), fetchAll()]);
  }, [loadProfile, fetchAll]);

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------
  const todaySummary = computeSummary(completedOrders);

  return (
    <CourierContext.Provider
      value={{
        status,
        profile,
        availableOrders,
        activeOrder,
        completedOrders,
        todaySummary,
        isLoadingOrders,
        ordersError,
        liveState,
        setStatus,
        acceptOrder,
        declineOrder,
        advanceOrderStatus,
        refresh,
      }}
    >
      {children}
    </CourierContext.Provider>
  );
}

export function useCourier() {
  return useContext(CourierContext);
}

// ---------------------------------------------------------------------------
// Re-export helpers for screens
// ---------------------------------------------------------------------------
export function orderStatusLabel(s: OrderStatus): string {
  const MAP: Record<OrderStatus, string> = {
    searching: "Searching for courier",
    assigned: "Accepted",
    courier_arrived: "Arrived at pickup",
    picked_up: "Picked up",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };
  return MAP[s] ?? s;
}

export function orderStatusNext(s: OrderStatus): string | null {
  const LABELS: Partial<Record<OrderStatus, string>> = {
    assigned: "Arrived at pickup",
    courier_arrived: "Picked up",
    picked_up: "Mark delivered",
  };
  return LABELS[s] ?? null;
}
