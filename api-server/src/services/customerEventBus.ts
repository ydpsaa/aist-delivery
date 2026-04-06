/**
 * Customer Event Bus
 *
 * In-memory registry of active WebSocket connections per customer.
 * Mirrors the pattern of courierEventBus.ts — same architecture, separate registry.
 *
 * Emits order lifecycle events to customers watching their active order.
 *
 * Events flow:
 *   courier accepts   → courier_assigned  → emitToCustomer(customerId)
 *   courier arrives   → courier_arrived   → emitToCustomer(customerId)
 *   courier picks up  → order_picked_up   → emitToCustomer(customerId)
 *   courier delivers  → order_delivered   → emitToCustomer(customerId)
 *   admin cancels     → order_cancelled   → emitToCustomer(customerId)
 *   order created     → order_created     → emitToCustomer(customerId) (optional confirm)
 */

import type { WebSocket } from "ws";
import { logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type CustomerEventType =
  | "order_created"
  | "courier_assigned"
  | "courier_arrived"
  | "order_picked_up"
  | "order_delivered"
  | "order_cancelled"
  | "order_status_updated"
  | "courier_location"
  | "ping";

export interface CustomerEvent {
  type: CustomerEventType;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** customerId → set of active WebSocket connections */
const connections = new Map<string, Set<WebSocket>>();

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerCustomerConnection(customerId: string, ws: WebSocket): void {
  if (!connections.has(customerId)) {
    connections.set(customerId, new Set());
  }
  connections.get(customerId)!.add(ws);
  logger.info({ customerId, total: connections.size }, "[customerEventBus] customer connected");
}

export function unregisterCustomerConnection(customerId: string, ws: WebSocket): void {
  const sockets = connections.get(customerId);
  if (!sockets) return;

  sockets.delete(ws);
  if (sockets.size === 0) {
    connections.delete(customerId);
  }
  logger.info({ customerId, total: connections.size }, "[customerEventBus] customer disconnected");
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function sendEvent(ws: WebSocket, event: CustomerEvent): void {
  try {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify({ ...event, timestamp: new Date().toISOString() }));
    }
  } catch (err) {
    logger.warn({ err }, "[customerEventBus] Failed to send event");
  }
}

/** Emit a live event to all connections belonging to a specific customer. */
export function emitToCustomer(customerId: string, event: CustomerEvent): void {
  const sockets = connections.get(customerId);
  if (!sockets || sockets.size === 0) return;

  for (const ws of sockets) {
    sendEvent(ws, event);
  }
}

/** How many customers are currently connected. */
export function getCustomerConnectionCount(): number {
  let count = 0;
  for (const sockets of connections.values()) count += sockets.size;
  return count;
}
