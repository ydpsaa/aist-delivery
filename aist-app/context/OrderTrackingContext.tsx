/**
 * OrderTrackingContext — customer-side live order tracking
 *
 * Manages the customer's currently active order and receives real-time
 * status updates via WebSocket. Falls back gracefully when:
 *   - User is not authenticated (mock flow still works via AppContext)
 *   - WebSocket is unavailable (state reflects last known status)
 *   - No active order exists (context is idle, no WS connection held)
 *
 * Flow:
 *   1. Customer creates order → `createOrder()` → backend → returns real order
 *   2. OrderTrackingContext stores the order + connects to /api/customer/ws
 *   3. Events arrive: courier_assigned / courier_arrived / order_picked_up /
 *      order_delivered / order_cancelled → state updates instantly
 *   4. Customer navigates to tracking screen → reads from this context
 *   5. On delivery or cancellation → context clears active order
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import {
  createOrder as apiCreateOrder,
  getActiveOrder,
  type CustomerOrder,
  type OrderStatus,
  type CreateOrderParams,
} from "@/services/customerService";
import {
  customerWS,
  connectCustomerWS,
  type ConnectionState,
  type CustomerWSEvent,
} from "@/services/customerWebSocket";
import { useAuth } from "./AuthContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CourierLocation {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

interface OrderTrackingContextType {
  /** The customer's currently active order (null if none). */
  activeOrder: CustomerOrder | null;
  /** Live courier GPS position (null until first update arrives). */
  courierLocation: CourierLocation | null;
  /** Whether an order creation API call is in flight. */
  isCreating: boolean;
  /** Error message if order creation failed. */
  createError: string | null;
  /** Real-time connection state for the tracking WS. */
  liveState: ConnectionState;
  /** Create a new order via the backend API. Returns the created order. */
  createOrder: (params: CreateOrderParams) => Promise<CustomerOrder>;
  /** Clear the active order (e.g., after delivery, tip screen, cancel). */
  clearActiveOrder: () => void;
  /** Manually refresh the active order from the backend. */
  refreshActiveOrder: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context defaults
// ---------------------------------------------------------------------------

const OrderTrackingContext = createContext<OrderTrackingContextType>({
  activeOrder: null,
  courierLocation: null,
  isCreating: false,
  createError: null,
  liveState: "disconnected",
  createOrder: async () => { throw new Error("OrderTrackingProvider not mounted"); },
  clearActiveOrder: () => {},
  refreshActiveOrder: async () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function OrderTrackingProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  const [activeOrder, setActiveOrder] = useState<CustomerOrder | null>(null);
  const [courierLocation, setCourierLocation] = useState<CourierLocation | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<ConnectionState>("disconnected");

  const wsConnected = useRef(false);

  // -------------------------------------------------------------------------
  // Connect WS when there is an active order
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || !activeOrder) {
      if (wsConnected.current) {
        customerWS.disconnect();
        wsConnected.current = false;
      }
      return;
    }

    if (!wsConnected.current) {
      wsConnected.current = true;
      connectCustomerWS();
    }

    const offState = customerWS.onStateChange(setLiveState);

    // -----------------------------------------------------------------------
    // WS event handlers
    // -----------------------------------------------------------------------
    const handleCourierAssigned = (evt: CustomerWSEvent) => {
      const payload = evt.payload as { orderId?: string; status?: OrderStatus; courierId?: string } | undefined;
      if (!payload?.orderId || payload.orderId !== activeOrder?.id) return;

      setActiveOrder((prev) =>
        prev ? { ...prev, status: "assigned", courierId: payload.courierId ?? prev.courierId } : prev
      );
    };

    const handleCourierArrived = (evt: CustomerWSEvent) => {
      const payload = evt.payload as { orderId?: string } | undefined;
      if (!payload?.orderId || payload.orderId !== activeOrder?.id) return;
      setActiveOrder((prev) => (prev ? { ...prev, status: "courier_arrived" } : prev));
    };

    const handleOrderPickedUp = (evt: CustomerWSEvent) => {
      const payload = evt.payload as { orderId?: string } | undefined;
      if (!payload?.orderId || payload.orderId !== activeOrder?.id) return;
      setActiveOrder((prev) => (prev ? { ...prev, status: "picked_up" } : prev));
    };

    const handleOrderDelivered = (evt: CustomerWSEvent) => {
      const payload = evt.payload as { orderId?: string } | undefined;
      if (!payload?.orderId || payload.orderId !== activeOrder?.id) return;
      setActiveOrder((prev) => (prev ? { ...prev, status: "delivered" } : prev));
      // Don't auto-clear — tracking screen shows delivered state + tip prompt
    };

    const handleOrderCancelled = (evt: CustomerWSEvent) => {
      const payload = evt.payload as { orderId?: string } | undefined;
      if (!payload?.orderId || payload.orderId !== activeOrder?.id) return;
      setActiveOrder((prev) => (prev ? { ...prev, status: "cancelled" } : prev));
    };

    const handleCourierLocation = (evt: CustomerWSEvent) => {
      const payload = evt.payload as {
        orderId?: string;
        lat?: number;
        lng?: number;
        heading?: number | null;
        speed?: number | null;
        updatedAt?: string;
      } | undefined;
      if (!payload?.lat || !payload?.lng) return;
      if (payload.orderId && payload.orderId !== activeOrder?.id) return;
      setCourierLocation({
        lat: payload.lat,
        lng: payload.lng,
        heading: payload.heading ?? null,
        speed: payload.speed ?? null,
        updatedAt: payload.updatedAt ?? new Date().toISOString(),
      });
    };

    const offAssigned = customerWS.on("courier_assigned", handleCourierAssigned);
    const offArrived = customerWS.on("courier_arrived", handleCourierArrived);
    const offPickedUp = customerWS.on("order_picked_up", handleOrderPickedUp);
    const offDelivered = customerWS.on("order_delivered", handleOrderDelivered);
    const offCancelled = customerWS.on("order_cancelled", handleOrderCancelled);
    const offLocation = customerWS.on("courier_location", handleCourierLocation);

    return () => {
      offState();
      offAssigned();
      offArrived();
      offPickedUp();
      offDelivered();
      offCancelled();
      offLocation();
    };
  }, [isAuthenticated, activeOrder?.id]);

  // -------------------------------------------------------------------------
  // Disconnect WS when user logs out
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) {
      customerWS.disconnect();
      wsConnected.current = false;
      setActiveOrder(null);
      setLiveState("disconnected");
    }
  }, [isAuthenticated]);

  // -------------------------------------------------------------------------
  // Load active order on mount (resume tracking if app restarted)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) return;

    getActiveOrder()
      .then((order) => {
        if (order) setActiveOrder(order);
      })
      .catch((err) => {
        // Not authenticated or no order — silent
        console.info("[OrderTracking] No active order on mount:", String(err).slice(0, 80));
      });
  }, [isAuthenticated]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  const createOrder = useCallback(async (params: CreateOrderParams): Promise<CustomerOrder> => {
    setIsCreating(true);
    setCreateError(null);

    try {
      const order = await apiCreateOrder(params);
      setActiveOrder(order);
      return order;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create order";
      setCreateError(msg);
      throw err;
    } finally {
      setIsCreating(false);
    }
  }, []);

  const clearActiveOrder = useCallback(() => {
    customerWS.disconnect();
    wsConnected.current = false;
    setActiveOrder(null);
    setCourierLocation(null);
    setLiveState("disconnected");
  }, []);

  const refreshActiveOrder = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const order = await getActiveOrder();
      setActiveOrder(order);
    } catch {
      // Silently fail — UI shows last known state
    }
  }, [isAuthenticated]);

  return (
    <OrderTrackingContext.Provider
      value={{
        activeOrder,
        courierLocation,
        isCreating,
        createError,
        liveState,
        createOrder,
        clearActiveOrder,
        refreshActiveOrder,
      }}
    >
      {children}
    </OrderTrackingContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useOrderTracking() {
  return useContext(OrderTrackingContext);
}
