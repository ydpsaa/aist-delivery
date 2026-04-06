/**
 * Order State Machine
 *
 * Defines valid status transitions for courier order flow.
 * All transition validation goes here — keep business logic out of route handlers.
 *
 * Future: extend this for push notification triggers, customer tracking events.
 */

import type { OrderStatus } from "@workspace/db";

// ---------------------------------------------------------------------------
// Transition map: action → { from, to }
// ---------------------------------------------------------------------------
const COURIER_TRANSITIONS: Record<
  string,
  { from: OrderStatus[]; to: OrderStatus }
> = {
  accept: { from: ["searching"], to: "assigned" },
  arrived: { from: ["assigned"], to: "courier_arrived" },
  "picked-up": { from: ["courier_arrived"], to: "picked_up" },
  delivered: { from: ["picked_up"], to: "delivered" },
};

// ---------------------------------------------------------------------------
// Action labels (for future notification payloads)
// ---------------------------------------------------------------------------
export const ACTION_LABELS: Record<string, string> = {
  accept: "Order accepted",
  arrived: "Courier arrived at pickup",
  "picked-up": "Order picked up",
  delivered: "Order delivered",
  decline: "Order declined",
};

// ---------------------------------------------------------------------------
// Validate a courier action against current order status
// ---------------------------------------------------------------------------
export function validateCourierTransition(
  action: string,
  currentStatus: OrderStatus
): { valid: true; nextStatus: OrderStatus } | { valid: false; error: string } {
  if (action === "decline") {
    if (currentStatus !== "searching") {
      return { valid: false, error: "Can only decline orders in searching status" };
    }
    return { valid: true, nextStatus: currentStatus }; // decline: no status change
  }

  const transition = COURIER_TRANSITIONS[action];
  if (!transition) {
    return { valid: false, error: `Unknown action: ${action}` };
  }

  if (!transition.from.includes(currentStatus)) {
    return {
      valid: false,
      error: `Cannot perform "${action}" when order is "${currentStatus}". Expected: ${transition.from.join(" or ")}`,
    };
  }

  return { valid: true, nextStatus: transition.to };
}

// ---------------------------------------------------------------------------
// Active order statuses — courier is working this order
// ---------------------------------------------------------------------------
export const ACTIVE_STATUSES: OrderStatus[] = [
  "assigned",
  "courier_arrived",
  "picked_up",
];

// ---------------------------------------------------------------------------
// Completed order statuses
// ---------------------------------------------------------------------------
export const COMPLETED_STATUSES: OrderStatus[] = ["delivered", "cancelled"];
