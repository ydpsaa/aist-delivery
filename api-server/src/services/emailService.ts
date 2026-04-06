/**
 * AIST Email Service
 *
 * Transactional email delivery via SendGrid (or fallback log).
 * Tracks all email attempts in the email_logs table.
 *
 * ENV VARS REQUIRED:
 *   SENDGRID_API_KEY     — SG.xxx
 *   AIST_FROM_EMAIL      — noreply@aist.cz (verified sender)
 *
 * WITHOUT CREDENTIALS:
 *   - Emails are logged but NOT sent
 *   - System is ready to activate with just env vars
 *
 * Templates covered:
 *   order_accepted         — customer: order placed
 *   courier_assigned       — customer: courier found
 *   order_delivered        — customer: order delivered + invoice ready
 *   invoice_ready          — customer: invoice available
 *   refund_issued          — customer: refund/coupon applied
 *   weekly_statement       — courier: weekly earnings summary
 */

import sgMail from "@sendgrid/mail";
import { db } from "@workspace/db";
import { pgTable, uuid, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";

const SENDGRID_API_KEY = process.env["SENDGRID_API_KEY"];
const FROM_EMAIL = process.env["AIST_FROM_EMAIL"] ?? "noreply@aist.cz";
const IS_LIVE = !!SENDGRID_API_KEY;

if (IS_LIVE) {
  sgMail.setApiKey(SENDGRID_API_KEY!);
}

// ---------------------------------------------------------------------------
// Email log table (in-memory for beta — upgrade to DB table in prod)
// ---------------------------------------------------------------------------
const emailLog: Array<{
  id: string;
  to: string;
  subject: string;
  template: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
  sentAt: Date;
}> = [];

export function getEmailLog() { return [...emailLog]; }

// ---------------------------------------------------------------------------
// Core send helper
// ---------------------------------------------------------------------------
export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  template: string;
  metadata?: Record<string, unknown>;
}

export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; mock: boolean }> {
  const id = Math.random().toString(36).slice(2, 10);

  if (!IS_LIVE) {
    console.info(`[Email] MOCK (no SendGrid key) — "${payload.subject}" → ${payload.to}`);
    emailLog.push({ id, to: payload.to, subject: payload.subject, template: payload.template, status: "skipped", sentAt: new Date() });
    return { success: true, mock: true };
  }

  try {
    await sgMail.send({ to: payload.to, from: FROM_EMAIL, subject: payload.subject, html: payload.html });
    emailLog.push({ id, to: payload.to, subject: payload.subject, template: payload.template, status: "sent", sentAt: new Date() });
    console.info(`[Email] Sent "${payload.subject}" → ${payload.to}`);
    return { success: true, mock: false };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    emailLog.push({ id, to: payload.to, subject: payload.subject, template: payload.template, status: "failed", error, sentAt: new Date() });
    console.error(`[Email] Failed "${payload.subject}" → ${payload.to}:`, error);
    return { success: false, mock: false };
  }
}

// ---------------------------------------------------------------------------
// Template: Order accepted / confirmed
// ---------------------------------------------------------------------------
export async function sendOrderConfirmation(opts: {
  customerEmail: string;
  customerName: string;
  orderId: string;
  category: string;
  priceCzk: number;
  pickup: string;
  delivery: string;
}) {
  const categoryLabels: Record<string, string> = {
    flash: "Flash Express", window: "Cargo Window", cargo: "Cargo Window", buy: "Buy For Me",
  };

  return sendEmail({
    to: opts.customerEmail,
    subject: `✅ Objednávka přijata — AIST Delivery`,
    template: "order_accepted",
    html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:40px auto;color:#222">
      <div style="background:#1762FF;padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;margin:0;font-size:24px">🦢 AIST Delivery</h1>
      </div>
      <div style="background:#f8f9fa;padding:24px;border-radius:0 0 12px 12px">
        <h2 style="color:#1762FF">Objednávka potvrzena</h2>
        <p>Ahoj ${opts.customerName}, tvoja objednávka byla přijata!</p>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#666">Služba</td><td style="font-weight:bold">${categoryLabels[opts.category] ?? opts.category}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Vyzvednutí</td><td>${opts.pickup}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Doručení</td><td>${opts.delivery}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Cena</td><td style="font-weight:bold;color:#1762FF">${opts.priceCzk} CZK</td></tr>
        </table>
        <p style="color:#666;font-size:13px">Hledáme kurýra pro tvou objednávku…</p>
      </div>
    </body></html>`,
  });
}

// ---------------------------------------------------------------------------
// Template: Courier assigned
// ---------------------------------------------------------------------------
export async function sendCourierAssigned(opts: {
  customerEmail: string;
  customerName: string;
  orderId: string;
  courierName: string;
  estimatedMinutes?: number;
}) {
  return sendEmail({
    to: opts.customerEmail,
    subject: `🚀 Kurýr přiřazen — AIST Delivery`,
    template: "courier_assigned",
    html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:40px auto;color:#222">
      <div style="background:#1762FF;padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;margin:0;font-size:24px">🦢 AIST Delivery</h1>
      </div>
      <div style="background:#f8f9fa;padding:24px;border-radius:0 0 12px 12px">
        <h2 style="color:#1762FF">Kurýr na cestě!</h2>
        <p>Ahoj ${opts.customerName}!</p>
        <p>Kurýr <strong>${opts.courierName}</strong> byl přiřazen k tvé objednávce.${opts.estimatedMinutes ? ` Odhadovaný čas doručení: <strong>${opts.estimatedMinutes} min</strong>.` : ""}</p>
        <p style="color:#666;font-size:13px">Sleduj polohu kurýra v aplikaci AIST.</p>
      </div>
    </body></html>`,
  });
}

// ---------------------------------------------------------------------------
// Template: Order delivered + invoice ready
// ---------------------------------------------------------------------------
export async function sendDeliveryConfirmation(opts: {
  customerEmail: string;
  customerName: string;
  orderId: string;
  priceCzk: number;
  invoiceNumber?: string;
}) {
  return sendEmail({
    to: opts.customerEmail,
    subject: `📦 Doručeno — AIST Delivery${opts.invoiceNumber ? ` | Faktura ${opts.invoiceNumber}` : ""}`,
    template: "order_delivered",
    html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:40px auto;color:#222">
      <div style="background:#1762FF;padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;margin:0;font-size:24px">🦢 AIST Delivery</h1>
      </div>
      <div style="background:#f8f9fa;padding:24px;border-radius:0 0 12px 12px">
        <h2 style="color:#1762FF">Zásilka doručena ✓</h2>
        <p>Ahoj ${opts.customerName}, tvoje zásilka byla úspěšně doručena.</p>
        <p>Celková cena: <strong style="color:#1762FF">${opts.priceCzk} CZK</strong></p>
        ${opts.invoiceNumber ? `<p>Faktura č. <strong>${opts.invoiceNumber}</strong> je dostupná v aplikaci AIST.</p>` : ""}
        <p style="color:#666;font-size:13px">Děkujeme za využití AIST Delivery!</p>
      </div>
    </body></html>`,
  });
}

// ---------------------------------------------------------------------------
// Template: Refund / coupon issued
// ---------------------------------------------------------------------------
export async function sendRefundNotification(opts: {
  customerEmail: string;
  customerName: string;
  refundType: string;
  amountCzk: number;
  couponAmountCzk?: number;
  reason: string;
}) {
  const isCoupon = opts.refundType === "coupon";
  return sendEmail({
    to: opts.customerEmail,
    subject: isCoupon ? `🎟 Kupon vydán — AIST Delivery` : `💰 Vrácení platby — AIST Delivery`,
    template: "refund_issued",
    html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:40px auto;color:#222">
      <div style="background:#1762FF;padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;margin:0;font-size:24px">🦢 AIST Delivery</h1>
      </div>
      <div style="background:#f8f9fa;padding:24px;border-radius:0 0 12px 12px">
        <h2 style="color:#1762FF">${isCoupon ? "Kupon vydán" : "Vrácení platby"}</h2>
        <p>Ahoj ${opts.customerName}!</p>
        ${isCoupon
          ? `<p>Vydali jsme ti kupon v hodnotě <strong>${opts.couponAmountCzk} CZK</strong> na další objednávku.</p>`
          : `<p>Vrátili jsme ti <strong style="color:#1762FF">${opts.amountCzk} CZK</strong> za tvoji objednávku.</p>`
        }
        <p style="color:#666;font-size:13px">Důvod: ${opts.reason}</p>
      </div>
    </body></html>`,
  });
}

// ---------------------------------------------------------------------------
// Template: Weekly courier statement
// ---------------------------------------------------------------------------
export async function sendCourierWeeklyStatement(opts: {
  courierEmail: string;
  courierName: string;
  periodStart: string;
  periodEnd: string;
  orderCount: number;
  grossAmountCzk: number;
  platformFeeCzk: number;
  taxWithheldCzk: number;
  finalPayoutCzk: number;
  courierType: string;
}) {
  return sendEmail({
    to: opts.courierEmail,
    subject: `📊 Týdenní výkaz kurýra — AIST Delivery (${opts.periodStart} – ${opts.periodEnd})`,
    template: "weekly_statement",
    html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:40px auto;color:#222">
      <div style="background:#1762FF;padding:24px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;margin:0;font-size:24px">🦢 AIST Delivery</h1>
      </div>
      <div style="background:#f8f9fa;padding:24px;border-radius:0 0 12px 12px">
        <h2 style="color:#1762FF">Týdenní výkaz</h2>
        <p>Ahoj ${opts.courierName}!</p>
        <p>Zde je tvůj přehled za ${opts.periodStart} – ${opts.periodEnd}:</p>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#666">Doručených objednávek</td><td style="font-weight:bold">${opts.orderCount}</td></tr>
          <tr><td style="padding:8px 0;color:#666">Hrubá tržba</td><td>${opts.grossAmountCzk} CZK</td></tr>
          <tr><td style="padding:8px 0;color:#666">Poplatek platformy</td><td style="color:#dc2626">${opts.platformFeeCzk > 0 ? `−${opts.platformFeeCzk} CZK` : "0 CZK (beta)"}</td></tr>
          ${opts.taxWithheldCzk > 0 ? `<tr><td style="padding:8px 0;color:#666">Srážková daň (15%)</td><td style="color:#f97316">−${opts.taxWithheldCzk} CZK</td></tr>` : ""}
          <tr style="border-top:2px solid #1762FF"><td style="padding:12px 0;font-weight:bold;font-size:16px">K výplatě</td><td style="font-weight:bold;font-size:20px;color:#1762FF">${opts.finalPayoutCzk} CZK</td></tr>
        </table>
        ${opts.courierType === "osvč" ? "<p style=\"color:#666;font-size:12px\">Jako OSVČ prosíme vystavte fakturu pro AIST Delivery (IČ: 21992819) do pondělí.</p>" : ""}
      </div>
    </body></html>`,
  });
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
export function emailStatus() {
  return { configured: IS_LIVE, fromEmail: FROM_EMAIL, loggedCount: emailLog.length };
}
