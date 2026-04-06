/**
 * Courier Event Bus
 *
 * In-memory registry of active WebSocket connections per courier.
 * Allows backend route handlers to push real-time events to specific
 * couriers or to all connected couriers without coupling to HTTP.
 *
 * One courier may be connected from multiple devices simultaneously
 * (e.g., phone + tablet) — each device gets its own WebSocket entry.
 *
 * This module has NO external dependencies — it is a pure in-process
 * pub/sub registry. For multi-instance deployments, replace the Map
 * with Redis pub/sub.
 */

import type { WebSocket } from "ws";
import { logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Event shape
// ---------------------------------------------------------------------------

export type CourierEventType =
  | "new_order_available"
  | "order_assigned"
  | "order_updated"
  | "order_cancelled"
  | "order_delivered"
  | "courier_status_updated"
  | "ping";

export interface CourierEvent {
  type: CourierEventType;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Internal registry
// ---------------------------------------------------------------------------

/** courierId → set of active WebSocket connections */
const connections = new Map<string, Set<WebSocket>>();

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Called when an authenticated courier WebSocket connects. */
export function registerConnection(courierId: string, ws: WebSocket): void {
  if (!connections.has(courierId)) {
    connections.set(courierId, new Set());
  }
  connections.get(courierId)!.add(ws);
  logger.info({ courierId, total: connections.size }, "[eventBus] courier connected");
}

/** Called when the WebSocket closes or errors. */
export function unregisterConnection(courierId: string, ws: WebSocket): void {
  const sockets = connections.get(courierId);
  if (!sockets) return;

  sockets.delete(ws);
  if (sockets.size === 0) {
    connections.delete(courierId);
  }
  logger.info({ courierId, total: connections.size }, "[eventBus] courier disconnected");
}

// ---------------------------------------------------------------------------
// Emit helpers
// ---------------------------------------------------------------------------

function sendEvent(ws: WebSocket, event: CourierEvent): void {
  try {
    if (ws.readyState === 1 /* WebSocket.OPEN */) {
      ws.send(JSON.stringify({ ...event, timestamp: new Date().toISOString() }));
    }
  } catch (err) {
    logger.warn({ err }, "[eventBus] Failed to send event to courier WS");
  }
}

/** Emit an event to all connections belonging to a specific courier. */
export function emitToCourier(courierId: string, event: CourierEvent): void {
  const sockets = connections.get(courierId);
  if (!sockets || sockets.size === 0) return;

  for (const ws of sockets) {
    sendEvent(ws, event);
  }
}

/** Emit an event to all currently-connected couriers. */
export function emitToAllConnectedCouriers(event: CourierEvent): void {
  for (const [courierId, sockets] of connections) {
    for (const ws of sockets) {
      sendEvent(ws, event);
    }
    if (sockets.size > 0) {
      logger.debug({ courierId }, "[eventBus] broadcast to courier");
    }
  }
}

/** Emit an event to a specific set of courier IDs (e.g., online couriers from DB). */
export function emitToSpecificCouriers(
  courierIds: string[],
  event: CourierEvent
): void {
  for (const courierId of courierIds) {
    emitToCourier(courierId, event);
  }
}

/** Returns IDs of all currently-connected couriers. */
export function getConnectedCourierIds(): string[] {
  return [...connections.keys()];
}

/** Returns total number of active connections. */
export function getConnectionCount(): number {
  let count = 0;
  for (const sockets of connections.values()) count += sockets.size;
  return count;
}
