import http from "node:http";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import jwt from "jsonwebtoken";

import app from "./app.js";
import { logger } from "./lib/logger.js";
import { logStartupConfig } from "./config.js";
import {
  registerConnection,
  unregisterConnection,
} from "./services/courierEventBus.js";
import {
  registerCustomerConnection,
  unregisterCustomerConnection,
} from "./services/customerEventBus.js";
import {
  registerAdminConnection,
  unregisterAdminConnection,
} from "./services/adminEventBus.js";
import {
  JWT_SECRET,
  type JwtPayload,
} from "./middlewares/auth.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ---------------------------------------------------------------------------
// Create explicit HTTP server so we can attach the WebSocket servers
// ---------------------------------------------------------------------------
const server = http.createServer(app);

// ---------------------------------------------------------------------------
// WebSocket servers — all use noServer: true so we manually route upgrades.
// Without this, the first-registered WSS calls abortHandshake(400) for any
// path that doesn't match it, preventing the other WSSes from ever firing.
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ noServer: true });
const customerWss = new WebSocketServer({ noServer: true });
const adminWss = new WebSocketServer({ noServer: true });

// Route WebSocket upgrade requests to the correct WSS based on pathname.
server.on("upgrade", (req, socket, head) => {
  const pathname = (req.url ?? "").split("?")[0];

  if (pathname === "/api/courier/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else if (pathname === "/api/customer/ws") {
    customerWss.handleUpgrade(req, socket, head, (ws) => {
      customerWss.emit("connection", ws, req);
    });
  } else if (pathname === "/api/admin/ws") {
    adminWss.handleUpgrade(req, socket, head, (ws) => {
      adminWss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// ---------------------------------------------------------------------------
// WebSocket server — /api/courier/ws
// ---------------------------------------------------------------------------

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url ?? "", `http://localhost`);
  const token = url.searchParams.get("token");

  if (!token) {
    ws.close(4001, "Missing auth token");
    return;
  }

  let courierId: string;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (payload.type !== "access" || payload.role !== "courier") {
      ws.close(4003, "Forbidden: courier access token required");
      return;
    }
    courierId = payload.sub;
  } catch {
    ws.close(4001, "Invalid or expired token");
    return;
  }

  registerConnection(courierId, ws);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { type?: string };
      if (msg.type === "ping" && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
      }
    } catch {
      // Ignore malformed frames
    }
  });

  ws.on("close", () => {
    unregisterConnection(courierId, ws);
  });

  ws.on("error", (err) => {
    logger.warn({ err, courierId }, "[ws] Courier WebSocket error");
    unregisterConnection(courierId, ws);
  });

  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }));
  }
});

// ---------------------------------------------------------------------------
// WebSocket server — /api/customer/ws
// ---------------------------------------------------------------------------

customerWss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url ?? "", `http://localhost`);
  const token = url.searchParams.get("token");

  if (!token) {
    ws.close(4001, "Missing auth token");
    return;
  }

  let customerId: string;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (payload.type !== "access") {
      ws.close(4003, "Forbidden: valid access token required");
      return;
    }
    customerId = payload.sub;
  } catch {
    ws.close(4001, "Invalid or expired token");
    return;
  }

  registerCustomerConnection(customerId, ws);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { type?: string };
      if (msg.type === "ping" && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
      }
    } catch {
      // Ignore malformed frames
    }
  });

  ws.on("close", () => {
    unregisterCustomerConnection(customerId, ws);
  });

  ws.on("error", (err) => {
    logger.warn({ err, customerId }, "[ws] Customer WebSocket error");
    unregisterCustomerConnection(customerId, ws);
  });

  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "connected", timestamp: new Date().toISOString() }));
  }
});

// ---------------------------------------------------------------------------
// WebSocket server — /api/admin/ws  (admin/dispatcher real-time)
// ---------------------------------------------------------------------------

adminWss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const url = new URL(req.url ?? "", `http://localhost`);
  const token = url.searchParams.get("token");

  if (!token) {
    ws.close(4001, "Missing auth token");
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (payload.type !== "access" || payload.role !== "admin") {
      ws.close(4003, "Forbidden: admin access token required");
      return;
    }
  } catch {
    ws.close(4001, "Invalid or expired token");
    return;
  }

  registerAdminConnection(ws);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { type?: string };
      if (msg.type === "ping" && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "pong", timestamp: new Date().toISOString() }));
      }
    } catch {
      // Ignore malformed frames
    }
  });

  ws.on("close", () => {
    unregisterAdminConnection(ws);
  });

  ws.on("error", (err) => {
    logger.warn({ err }, "[ws] Admin WebSocket error");
    unregisterAdminConnection(ws);
  });

  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: "connected", role: "admin", timestamp: new Date().toISOString() }));
  }
});

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------
server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info(
    { port, courierWs: "/api/courier/ws", customerWs: "/api/customer/ws", adminWs: "/api/admin/ws" },
    "Server listening"
  );
  // Log integration readiness at startup
  logStartupConfig();
});
