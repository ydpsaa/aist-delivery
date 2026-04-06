/**
 * AIST Stripe Service
 *
 * Centralized Stripe execution layer for AIST beta (OSVČ platform account).
 * Handles:
 *   - PaymentIntent create / capture / cancel
 *   - Partial & full refunds
 *   - Transfer foundation for Fleet/OSVČ couriers (Stripe Connect)
 *   - Webhook event verification
 *
 * CZK → Stripe: 1 CZK = 100 "halíř" (smallest CZK unit is 1 haléř but CZK is not a zero-decimal currency)
 * Actually: CZK is NOT a zero-decimal currency — Stripe expects amounts in smallest unit (haléř), so 100 CZK = 10000 haléř.
 * BUT: Stripe does NOT support CZK as a capture_method=manual currency in all regions.
 * For beta: we create PaymentIntents in manual capture mode and hold until delivery.
 *
 * ENV VARS REQUIRED:
 *   STRIPE_SECRET_KEY         — sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET     — whsec_...
 *
 * WITHOUT CREDENTIALS:
 *   - All methods return mock/stubbed responses
 *   - Real execution flows are ready to activate with just env vars
 */

import Stripe from "stripe";
import { db, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"];
const STRIPE_WEBHOOK_SECRET = process.env["STRIPE_WEBHOOK_SECRET"] ?? "";
const IS_LIVE = !!STRIPE_SECRET_KEY;

// CZK: smallest currency unit is 1 haléř = 0.01 CZK
// Stripe expects haléře: 100 CZK → 10000 haléř
function czkToHalere(czk: number): number {
  return Math.round(czk * 100);
}

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!IS_LIVE) throw new Error("Stripe not configured — set STRIPE_SECRET_KEY");
  if (!_stripe) {
    _stripe = new Stripe(STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" });
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// Idempotency key helpers
// ---------------------------------------------------------------------------
function idempotencyKey(prefix: string, id: string): string {
  return `${prefix}-${id}`;
}

// ---------------------------------------------------------------------------
// PaymentIntent — create with manual capture
// ---------------------------------------------------------------------------
export interface CreatePaymentIntentResult {
  paymentIntentId: string;
  clientSecret: string;
  status: string;
  live: boolean;
}

export async function createPaymentIntent(
  orderId: string,
  amountCzk: number,
  customerEmail?: string,
): Promise<CreatePaymentIntentResult> {
  if (!IS_LIVE) {
    const mockId = `pi_mock_${orderId.slice(0, 8)}`;
    console.info(`[Stripe] MOCK: createPaymentIntent for order ${orderId} — ${amountCzk} CZK`);
    return { paymentIntentId: mockId, clientSecret: `${mockId}_secret_mock`, status: "requires_payment_method", live: false };
  }

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.create(
    {
      amount: czkToHalere(amountCzk),
      currency: "czk",
      capture_method: "manual",
      metadata: { orderId, source: "aist_delivery" },
      description: `AIST Delivery — Order ${orderId}`,
      receipt_email: customerEmail,
    },
    { idempotencyKey: idempotencyKey("pi-create", orderId) },
  );

  return { paymentIntentId: intent.id, clientSecret: intent.client_secret!, status: intent.status, live: true };
}

// ---------------------------------------------------------------------------
// PaymentIntent — capture (on delivery)
// ---------------------------------------------------------------------------
export interface CaptureResult {
  success: boolean;
  chargeId?: string;
  status: string;
  live: boolean;
  error?: string;
}

export async function capturePayment(orderId: string, paymentIntentId: string): Promise<CaptureResult> {
  if (!IS_LIVE) {
    console.info(`[Stripe] MOCK: capture for order ${orderId} intent ${paymentIntentId}`);
    return { success: true, chargeId: `ch_mock_${orderId.slice(0, 8)}`, status: "succeeded", live: false };
  }

  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.capture(
      paymentIntentId,
      {},
      { idempotencyKey: idempotencyKey("pi-capture", orderId) },
    );
    return {
      success: intent.status === "succeeded",
      chargeId: typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id,
      status: intent.status,
      live: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Stripe] Capture failed for ${orderId}:`, message);
    return { success: false, status: "failed", live: true, error: message };
  }
}

// ---------------------------------------------------------------------------
// PaymentIntent — cancel (release hold)
// ---------------------------------------------------------------------------
export async function cancelPaymentIntent(orderId: string, paymentIntentId: string): Promise<{ success: boolean; live: boolean }> {
  if (!IS_LIVE) {
    console.info(`[Stripe] MOCK: cancel intent for order ${orderId}`);
    return { success: true, live: false };
  }

  try {
    const stripe = getStripe();
    await stripe.paymentIntents.cancel(paymentIntentId, {}, { idempotencyKey: idempotencyKey("pi-cancel", orderId) });
    return { success: true, live: true };
  } catch (err) {
    console.error(`[Stripe] Cancel failed for ${orderId}:`, err);
    return { success: false, live: true };
  }
}

// ---------------------------------------------------------------------------
// Refund — partial or full
// ---------------------------------------------------------------------------
export interface RefundResult {
  success: boolean;
  refundId?: string;
  amountCzk: number;
  live: boolean;
  error?: string;
}

export async function createRefund(
  orderId: string,
  chargeId: string,
  amountCzk: number,
  reason?: Stripe.RefundCreateParams.Reason,
): Promise<RefundResult> {
  if (!IS_LIVE) {
    console.info(`[Stripe] MOCK: refund ${amountCzk} CZK for order ${orderId}`);
    return { success: true, refundId: `re_mock_${orderId.slice(0, 8)}`, amountCzk, live: false };
  }

  try {
    const stripe = getStripe();
    const refund = await stripe.refunds.create(
      { charge: chargeId, amount: czkToHalere(amountCzk), reason },
      { idempotencyKey: idempotencyKey("refund", `${orderId}-${amountCzk}`) },
    );
    return {
      success: refund.status === "succeeded",
      refundId: refund.id,
      amountCzk,
      live: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Stripe] Refund failed for ${orderId}:`, message);
    return { success: false, amountCzk, live: true, error: message };
  }
}

// ---------------------------------------------------------------------------
// Stripe Connect — Transfer to courier (foundation)
// ---------------------------------------------------------------------------
export interface TransferResult {
  success: boolean;
  transferId?: string;
  live: boolean;
  error?: string;
}

export async function createCourierTransfer(
  batchId: string,
  connectedAccountId: string,
  amountCzk: number,
): Promise<TransferResult> {
  if (!IS_LIVE) {
    console.info(`[Stripe] MOCK: transfer ${amountCzk} CZK to ${connectedAccountId} for batch ${batchId}`);
    return { success: true, transferId: `tr_mock_${batchId.slice(0, 8)}`, live: false };
  }

  try {
    const stripe = getStripe();
    const transfer = await stripe.transfers.create(
      { amount: czkToHalere(amountCzk), currency: "czk", destination: connectedAccountId },
      { idempotencyKey: idempotencyKey("transfer", batchId) },
    );
    return { success: true, transferId: transfer.id, live: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Stripe] Transfer failed for batch ${batchId}:`, message);
    return { success: false, live: true, error: message };
  }
}

// ---------------------------------------------------------------------------
// Webhook verification
// ---------------------------------------------------------------------------
export function constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
  if (!IS_LIVE) throw new Error("Stripe not configured");
  return getStripe().webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
}

// ---------------------------------------------------------------------------
// Stripe integration status (for health/admin)
// ---------------------------------------------------------------------------
export function stripeStatus() {
  return {
    configured: IS_LIVE,
    mode: IS_LIVE
      ? (STRIPE_SECRET_KEY!.startsWith("sk_live") ? "live" : "test")
      : "mock",
    webhookConfigured: !!STRIPE_WEBHOOK_SECRET,
  };
}
