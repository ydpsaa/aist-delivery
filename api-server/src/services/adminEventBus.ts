/**
 * Admin / Dispatcher Event Bus
 *
 * Broadcasts operational events to all connected admin WebSocket clients.
 * Unlike the courier/customer buses (which target individual users), the
 * admin bus is a simple broadcast: every admin watching the dispatcher
 * dashboard receives every event.
 *
 * Events emitted here power the live operations dashboard — admins see
 * orders and courier state changes the instant they happen.
 *
 * For multi-instance deployments, replace the internal Set with a Redis
 * pub/sub channel and broadcast to all nodes.
 */

import type { WebSocket } from "ws";
import { logger } from "../lib/logger.js";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type AdminEventType =
  | "order_created"
  | "order_assigned"
  | "order_updated"
  | "order_delivered"
  | "order_cancelled"
  | "courier_online"
  | "courier_offline"
  | "courier_status_changed"
  | "courier_location";

export interface AdminEvent {
  type: AdminEventType;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Registry — one flat Set of all connected admin sockets
// ---------------------------------------------------------------------------

const adminConnections = new Set<WebSocket>();

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerAdminConnection(ws: WebSocket): void {
  adminConnections.add(ws);
  logger.info({ total: adminConnections.size }, "[adminBus] admin connected");
}

export function unregisterAdminConnection(ws: WebSocket): void {
  adminConnections.delete(ws);
  logger.info({ total: adminConnections.size }, "[adminBus] admin disconnected");
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

/** Broadcast an event to every connected admin client. */
export function emitToAdmins(event: AdminEvent): void {
  if (adminConnections.size === 0) return;

  const payload = JSON.stringify({
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  });

  for (const ws of adminConnections) {
    try {
      if (ws.readyState === 1 /* WebSocket.OPEN */) {
        ws.send(payload);
      }
    } catch (err) {
      logger.warn({ err }, "[adminBus] Failed to send event to admin WS");
    }
  }
}

export function getAdminConnectionCount(): number {
  return adminConnections.size;
}
