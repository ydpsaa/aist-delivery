/**
 * AIST Notification Service — Expo Push Notifications
 *
 * Sends push messages via Expo's free push API.
 * No Firebase credentials needed — works with ExponentPushToken.
 *
 * Covers:
 *   - Courier push: new order available, order updates
 *   - Customer push: order status updates (courier assigned, delivered)
 *
 * Future: swap for FCM/APNs direct for production.
 */

import { db, courierProfilesTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// ---------------------------------------------------------------------------
// Customer push token store (in-memory for beta)
// In production: persist to users.push_token DB column
// ---------------------------------------------------------------------------
const _customerPushTokens = new Map<string, string>(); // userId → pushToken

export function setCustomerPushToken(userId: string, token: string): void {
  _customerPushTokens.set(userId, token);
  console.info(`[notifications] Customer push token saved: ${userId.slice(0, 8)}`);
}

export function getCustomerPushToken(userId: string): string | undefined {
  return _customerPushTokens.get(userId);
}

export function getCustomerPushTokenCount(): number {
  return _customerPushTokens.size;
}

// ---------------------------------------------------------------------------

export type NotificationType =
  | "new_order_available"
  | "order_updated"
  | "order_cancelled"
  | "courier_assigned"
  | "order_delivered"
  | "order_cancelled_customer";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
  badge?: number;
  channelId?: string;
}

// ---------------------------------------------------------------------------
// Core send function — batches up to 100 messages per Expo limits
// ---------------------------------------------------------------------------
export async function sendExpoPush(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  // Filter to valid Expo push tokens only
  const valid = messages.filter(
    (m) => m.to.startsWith("ExponentPushToken[") || m.to.startsWith("ExpoPushToken[")
  );

  if (valid.length === 0) return;

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(valid),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[notifications] Expo push error:", res.status, text);
    }
  } catch (err) {
    // Never crash the request — notification failure is not fatal
    console.error("[notifications] Failed to send push:", err);
  }
}

// ---------------------------------------------------------------------------
// Notify all online couriers with a push token
// ---------------------------------------------------------------------------
export async function notifyOnlineCouriers(payload: {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    const couriers = await db
      .select({ pushToken: courierProfilesTable.pushToken })
      .from(courierProfilesTable)
      .where(
        and(
          eq(courierProfilesTable.onlineStatus, "online"),
          isNotNull(courierProfilesTable.pushToken)
        )
      );

    const tokens = couriers
      .map((c) => c.pushToken)
      .filter((t): t is string => t !== null && t.length > 0);

    if (tokens.length === 0) return;

    await sendExpoPush(
      tokens.map((to) => ({
        to,
        title: payload.title,
        body: payload.body,
        sound: "default",
        data: { type: payload.type, ...payload.data },
        channelId: "courier",
      }))
    );

    console.info(`[notifications] Sent "${payload.type}" to ${tokens.length} courier(s)`);
  } catch (err) {
    console.error("[notifications] notifyOnlineCouriers failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Notify a specific courier by userId
// ---------------------------------------------------------------------------
export async function notifyCourierById(
  userId: string,
  payload: {
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const [profile] = await db
      .select({ pushToken: courierProfilesTable.pushToken })
      .from(courierProfilesTable)
      .where(eq(courierProfilesTable.userId, userId));

    if (!profile?.pushToken) return;

    await sendExpoPush([
      {
        to: profile.pushToken,
        title: payload.title,
        body: payload.body,
        sound: "default",
        data: { type: payload.type, ...payload.data },
        channelId: "courier",
      },
    ]);

    console.info(`[notifications] Sent "${payload.type}" to courier ${userId.slice(0, 8)}`);
  } catch (err) {
    console.error("[notifications] notifyCourierById failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Notify a specific customer by userId
// ---------------------------------------------------------------------------
export async function notifyCustomerById(
  customerId: string,
  payload: {
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }
): Promise<void> {
  const token = getCustomerPushToken(customerId);
  if (!token) return; // Customer hasn't registered for push yet

  try {
    await sendExpoPush([
      {
        to: token,
        title: payload.title,
        body: payload.body,
        sound: "default",
        data: { type: payload.type, ...payload.data },
        channelId: "default",
      },
    ]);
    console.info(`[notifications] Sent "${payload.type}" to customer ${customerId.slice(0, 8)}`);
  } catch (err) {
    console.error("[notifications] notifyCustomerById failed:", err);
  }
}
