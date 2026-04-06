/**
 * Admin WebSocket singleton
 *
 * Maintains a single persistent WebSocket connection to /api/admin/ws.
 * Implements:
 *   - JWT token authentication via query param ?token=<JWT>
 *   - Exponential-backoff reconnect (1s → 2s → 4s → … → 30s)
 *   - 25s ping/pong keep-alive
 *   - Typed event subscriptions
 *   - Connection state change callbacks
 */

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

export type AdminWSEventType =
  | "connected"
  | "order_created"
  | "order_assigned"
  | "order_updated"
  | "order_delivered"
  | "order_cancelled"
  | "courier_online"
  | "courier_offline"
  | "courier_status_changed"
  | "courier_location"
  | "pong";

export interface AdminWSEvent {
  type: AdminWSEventType;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

type EventHandler = (event: AdminWSEvent) => void;
type StateHandler = (state: ConnectionState) => void;

class AdminWebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryDelay = 1000;
  private maxDelay = 30000;
  private stopped = false;

  private state: ConnectionState = "disconnected";
  private stateHandlers = new Set<StateHandler>();
  private eventHandlers = new Map<AdminWSEventType, Set<EventHandler>>();

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  connect(): void {
    this.stopped = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this._connect();
  }

  disconnect(): void {
    this.stopped = true;
    this._clearTimers();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this._setState("disconnected");
  }

  on(type: AdminWSEventType, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, new Set());
    }
    this.eventHandlers.get(type)!.add(handler);
    return () => this.eventHandlers.get(type)?.delete(handler);
  }

  onStateChange(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  getState(): ConnectionState {
    return this.state;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _connect(): void {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      this._setState("error");
      return;
    }

    this._setState("connecting");

    // Derive WebSocket URL from current window.location
    const { protocol, host } = window.location;
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${host}/api/admin/ws?token=${encodeURIComponent(token)}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.retryDelay = 1000;
      this._setState("connected");
      this._startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as AdminWSEvent;
        this._dispatch(msg);
      } catch {
        // Ignore malformed frames
      }
    };

    this.ws.onclose = () => {
      this._setState("disconnected");
      this._clearTimers();
      if (!this.stopped) {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this._setState("error");
    };
  }

  private _scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.retryDelay = Math.min(this.retryDelay * 2, this.maxDelay);
      this._connect();
    }, this.retryDelay);
  }

  private _startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 25_000);
  }

  private _clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private _setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const h of this.stateHandlers) h(state);
  }

  private _dispatch(event: AdminWSEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const h of handlers) {
        try { h(event); } catch { /* ignore handler errors */ }
      }
    }
  }
}

export const adminWS = new AdminWebSocketService();
