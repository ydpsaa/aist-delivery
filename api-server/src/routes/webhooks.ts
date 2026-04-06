/**
 * AIST Stripe Webhook Handler
 *
 * Handles Stripe webhook events idempotently.
 * Mounts BEFORE body-parser since Stripe requires raw body for signature verification.
 *
 * Handled events:
 *   payment_intent.succeeded              — capture confirmed
 *   payment_intent.canceled              — hold released
 *   payment_intent.payment_failed        — payment failure
 *   charge.refunded                      — refund applied to charge
 *   transfer.created                     — Stripe Connect transfer (courier payout)
 *
 * Mount point: POST /api/stripe/webhook (raw body, no JSON parse middleware)
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { db, ordersTable, refundsTable, payoutBatchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { constructWebhookEvent } from "../services/stripeService.js";

const router = Router();

// Stripe requires raw body for webhook signature verification
router.post(
  "/",
  (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"] as string;

    // Without Stripe config — acknowledge but skip
    if (!process.env["STRIPE_SECRET_KEY"]) {
      console.info("[Webhook] Stripe not configured — webhook received but skipped");
      res.json({ received: true, note: "stripe_not_configured" });
      return;
    }

    let event: ReturnType<typeof constructWebhookEvent>;
    try {
      event = constructWebhookEvent(req.body as Buffer, signature);
    } catch (err) {
      console.error("[Webhook] Signature verification failed:", err);
      res.status(400).json({ error: "Invalid webhook signature" });
      return;
    }

    // Idempotency: log event ID and skip if already processed
    console.info(`[Webhook] Event: ${event.type} (${event.id})`);

    // Process asynchronously — return 200 immediately
    processWebhookEvent(event).catch((err) =>
      console.error(`[Webhook] Processing error for ${event.id}:`, err)
    );

    res.json({ received: true, eventId: event.id });
  }
);

async function processWebhookEvent(event: { type: string; id: string; data: { object: Record<string, unknown> } }) {
  const obj = event.data.object as Record<string, unknown>;

  switch (event.type) {
    case "payment_intent.succeeded": {
      const piId = obj["id"] as string;
      const chargeId = obj["latest_charge"] as string | undefined;
      const metadata = obj["metadata"] as Record<string, string> | undefined;
      const orderId = metadata?.["orderId"];

      if (orderId) {
        await db.update(ordersTable)
          .set({
            paymentStatus: "captured",
            stripeChargeId: chargeId ?? null,
            capturedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(ordersTable.stripePaymentIntentId, piId));
        console.info(`[Webhook] PaymentIntent ${piId} succeeded — order ${orderId} marked captured`);
      }
      break;
    }

    case "payment_intent.canceled": {
      const piId = obj["id"] as string;
      await db.update(ordersTable)
        .set({ paymentStatus: "cancelled", updatedAt: new Date() })
        .where(eq(ordersTable.stripePaymentIntentId, piId));
      console.info(`[Webhook] PaymentIntent ${piId} cancelled`);
      break;
    }

    case "payment_intent.payment_failed": {
      const piId = obj["id"] as string;
      console.warn(`[Webhook] PaymentIntent ${piId} failed — needs manual review`);
      break;
    }

    case "charge.refunded": {
      const chargeId = obj["id"] as string;
      const refundedAmount = obj["amount_refunded"] as number;
      const amountCzk = Math.round(refundedAmount / 100);
      const refundStatus = obj["refunded"] as boolean ? "refunded" : "partially_refunded";

      await db.update(ordersTable)
        .set({
          paymentStatus: refundStatus,
          refundedAmountCzk: amountCzk,
          updatedAt: new Date(),
        })
        .where(eq(ordersTable.stripeChargeId, chargeId));

      console.info(`[Webhook] Charge ${chargeId} refunded — ${amountCzk} CZK`);
      break;
    }

    case "transfer.created": {
      const transferId = obj["id"] as string;
      const destination = obj["destination"] as string;
      console.info(`[Webhook] Transfer ${transferId} to ${destination}`);
      // Update payout batch status if metadata contains batchId
      const metadata = obj["metadata"] as Record<string, string> | undefined;
      if (metadata?.["batchId"]) {
        await db.update(payoutBatchesTable)
          .set({ status: "executed", executedAt: new Date(), stripeTransferId: transferId, updatedAt: new Date() })
          .where(eq(payoutBatchesTable.id, metadata["batchId"]));
      }
      break;
    }

    default:
      console.info(`[Webhook] Unhandled event type: ${event.type}`);
  }
}

export default router;
