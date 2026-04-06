import { useEffect, useState } from "react";

const API = "/api";

interface IntegrationStatus {
  configured: boolean;
  mode: string;
  status: string;
  notes?: string;
  webhookConfigured?: boolean;
  liveModeGuard?: boolean;
  fromEmail?: string;
}

interface Readiness {
  stripe: IntegrationStatus;
  sendgrid: IntegrationStatus;
  storage: IntegrationStatus;
  googleMaps: IntegrationStatus;
  googleOauth: IntegrationStatus;
  firebase: IntegrationStatus;
  push: IntegrationStatus;
  overall: {
    paymentReady: boolean;
    emailReady: boolean;
    storageReady: boolean;
    mapsReady: boolean;
    authReady: boolean;
    pushReady: boolean;
    fullyConfigured: boolean;
    betaReady: boolean;
    readyForTestFlight: boolean;
    readyForClosedBeta: boolean;
    missingCredentials: string[];
  };
  environment: string;
  checkedAt: string;
}

interface FinanceHealth {
  orders: Record<string, string>;
  refunds: Record<string, string>;
  invoices: Record<string, string>;
  coupons: Record<string, string>;
  payouts: Record<string, string>;
  checkedAt: string;
}

interface EmailEntry {
  id: string;
  to: string;
  subject: string;
  template: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
  sentAt: string;
}

interface EmailLog {
  stats: { total: number; sent: number; skipped: number; failed: number };
  log: EmailEntry[];
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    live: "bg-green-100 text-green-700 border-green-200",
    test: "bg-yellow-100 text-yellow-700 border-yellow-200",
    mock: "bg-gray-100 text-gray-500 border-gray-200",
    not_configured: "bg-orange-100 text-orange-700 border-orange-200",
    always_on: "bg-blue-100 text-blue-700 border-blue-200",
  };
  const labels: Record<string, string> = {
    live: "LIVE", test: "TEST", mock: "MOCK", not_configured: "NOT SET", always_on: "ACTIVE",
  };
  return (
    <span className={`px-2 py-0.5 rounded border text-xs font-bold tracking-wide ${colors[status] ?? "bg-gray-100 text-gray-500"}`}>
      {labels[status] ?? status.toUpperCase()}
    </span>
  );
}

function ReadinessCard({ label, icon, status, extra }: {
  label: string; icon: string; status: IntegrationStatus; extra?: React.ReactNode;
}) {
  const borderColor =
    status.status === "live" || status.status === "always_on" ? "border-green-200" :
    status.status === "test" ? "border-yellow-200" : "border-orange-200";
  return (
    <div className={`bg-white border ${borderColor} rounded-xl p-5`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="font-semibold text-gray-800">{label}</span>
        </div>
        <StatusBadge status={status.status} />
      </div>
      {extra}
      {status.notes && (
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">{status.notes}</p>
      )}
    </div>
  );
}

function CheckRow({ done, label, detail }: { done: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className={`mt-0.5 w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full text-xs font-bold
        ${done ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
        {done ? "✓" : "–"}
      </span>
      <div>
        <span className={`text-sm ${done ? "text-gray-800" : "text-gray-500"}`}>{label}</span>
        {detail && <p className="text-xs text-gray-400 mt-0.5">{detail}</p>}
      </div>
    </div>
  );
}

const BETA_CHECKLIST = {
  customer: [
    { id: "c1", label: "App launch & splash screen renders", detail: "White background, new AIST logo, progress bar" },
    { id: "c2", label: "Welcome screen with Google Sign-In option", detail: "Email/password sign-up functional; Google shows configured/not" },
    { id: "c3", label: "Email login + registration flow", detail: "Valid JWT issued, role=customer, redirects to home" },
    { id: "c4", label: "Home screen map renders correctly", detail: "Google Maps tile visible, AIST logo pill in corner" },
    { id: "c5", label: "Address picker — Search tab (Google Places)", detail: "Autocomplete results, select → lat/lng stored" },
    { id: "c6", label: "Address picker — Map tab (tap to place pin)", detail: "Reverse geocode label appears, confirm saves coords" },
    { id: "c7", label: "Address details sheet (note/floor/buzzer)", detail: "Optional, saved to AppContext" },
    { id: "c8", label: "Order creation — service type selection", detail: "Flash / Window / Buy For Me; price shown in CZK" },
    { id: "c9", label: "Order creation — promo code field", detail: "Valid code applies discount; invalid shows error" },
    { id: "c10", label: "Order submitted — searching state shown", detail: "Status card visible on home screen" },
    { id: "c11", label: "Live tracking screen — courier location on map", detail: "Updates in real-time via WebSocket" },
    { id: "c12", label: "Push notification on courier assignment", detail: "Requires physical device + push permission granted" },
    { id: "c13", label: "Order delivered confirmation", detail: "Status updates to 'delivered', invoice accessible" },
    { id: "c14", label: "Invoice download / PDF view", detail: "Invoice PDF available in order history" },
    { id: "c15", label: "Order history visible", detail: "Past orders listed with status and price" },
    { id: "c16", label: "Profile screen — name, email, logout", detail: "Logout clears session, redirect to welcome" },
    { id: "c17", label: "Language switching (EN/CS/RU/UK)", detail: "App text updates without restart" },
  ],
  courier: [
    { id: "r1", label: "Login with role=courier credentials", detail: "Redirects to courier tab, not customer tabs" },
    { id: "r2", label: "Go online toggle", detail: "Status flips to 'online', courier visible to dispatcher" },
    { id: "r3", label: "Push notification: new order available", detail: "Physical device required; shows order details" },
    { id: "r4", label: "Accept order flow", detail: "Order assigned, status → courier_arrived" },
    { id: "r5", label: "Location tracking starts on order accept", detail: "GPS updates sent to backend every 10s or 20m" },
    { id: "r6", label: "Customer sees courier location on map", detail: "Real-time WebSocket updates" },
    { id: "r7", label: "Status advance: picked_up → delivered", detail: "Each step visible to customer and dispatcher" },
    { id: "r8", label: "Order completion — payment capture", detail: "Mock mode: logged; Live mode: Stripe captures" },
    { id: "r9", label: "Go offline — tracking stops", detail: "Location updates halt, courier hidden from dispatcher" },
    { id: "r10", label: "Location permission prompt", detail: "Shows native iOS/Android permission dialog first time" },
    { id: "r11", label: "Courier profile (vehicle, plate)", detail: "Editable from profile screen" },
  ],
  admin: [
    { id: "a1", label: "Admin login (role=admin)", detail: "Redirects to admin dashboard" },
    { id: "a2", label: "Live dispatcher map — couriers visible", detail: "WebSocket connection, location pings updating" },
    { id: "a3", label: "Dispatcher can manually assign order", detail: "Drag or select courier → order assigned" },
    { id: "a4", label: "Orders list — all statuses visible", detail: "Filter by status, courier, date" },
    { id: "a5", label: "Refund evaluation workflow", detail: "Approve/reject refund request, sends mock email" },
    { id: "a6", label: "Coupon generation", detail: "Create code, discount type, max uses" },
    { id: "a7", label: "Invoice list — PDF accessible", detail: "Invoice PDF rendered via pdfkit" },
    { id: "a8", label: "Payout batch creation", detail: "Select couriers, calculate payout, mark approved" },
    { id: "a9", label: "Pricing rules editor", detail: "Zone multipliers, surge config" },
    { id: "a10", label: "System status page (this page)", detail: "Integration readiness visible" },
    { id: "a11", label: "Finance health dashboard", detail: "Orders, revenue, refunds, payouts summary" },
    { id: "a12", label: "Email log visible", detail: "Sent/skipped/failed email attempts tracked" },
  ],
};

export default function SystemAdminPage() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [finance, setFinance] = useState<FinanceHealth | null>(null);
  const [emailLog, setEmailLog] = useState<EmailLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "finance" | "emails" | "checklist">("overview");

  const token = localStorage.getItem("admin_token") ?? "";
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function loadAll() {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch(`${API}/admin/system/readiness`, { headers }).then(r => r.json()),
        fetch(`${API}/admin/system/finance-health`, { headers }).then(r => r.json()),
        fetch(`${API}/admin/system/email-log`, { headers }).then(r => r.json()),
      ]);
      setReadiness(r1.readiness ?? null);
      setFinance(r2 ?? null);
      setEmailLog(r3 ?? null);
    } catch (err) {
      console.error("System page load failed:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  const missingCount = readiness?.overall.missingCredentials.length ?? 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Status</h1>
          <p className="text-sm text-gray-500 mt-1">Integration readiness, device beta ops, and TestFlight prep</p>
        </div>
        <button onClick={loadAll} className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200">
          ↻ Refresh
        </button>
      </div>

      {/* Overall Banner */}
      {readiness && (
        <div className={`rounded-xl px-5 py-4 mb-6 border ${readiness.overall.fullyConfigured ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className={`font-bold text-sm ${readiness.overall.fullyConfigured ? "text-green-800" : "text-amber-800"}`}>
                {readiness.overall.fullyConfigured
                  ? "✅ All integrations live — system fully configured"
                  : `⚠️ ${missingCount} credential${missingCount !== 1 ? "s" : ""} missing — running in degraded/mock mode`}
              </p>
              {!readiness.overall.fullyConfigured && (
                <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                  Missing: {readiness.overall.missingCredentials.join(" · ")}
                </p>
              )}
            </div>
            <div className="flex gap-2 ml-4">
              <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${readiness.overall.betaReady ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
                BETA READY
              </span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${readiness.overall.readyForTestFlight ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500"}`}>
                TESTFLIGHT PREP ✓
              </span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap ${readiness.overall.readyForClosedBeta ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-600"}`}>
                CLOSED BETA {readiness.overall.readyForClosedBeta ? "✓" : "BLOCKED"}
              </span>
            </div>
          </div>
          {readiness.environment && (
            <p className="text-xs text-gray-500 mt-2">
              Environment: <code className="bg-white/60 px-1 rounded">{readiness.environment}</code>
              · Checked: {new Date(readiness.checkedAt).toLocaleString("cs-CZ")}
            </p>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {(["overview", "finance", "emails", "checklist"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${tab === t ? "bg-[#1762FF] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {t === "overview" ? "Integrations" : t === "finance" ? "Finance Health" : t === "emails" ? "Email Log" : "Beta Checklist"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-400 py-12 text-center">Loading system status...</div>
      ) : tab === "overview" ? (
        <div className="space-y-4">
          {/* Integration Cards */}
          {readiness && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <ReadinessCard label="Stripe Payments" icon="💳" status={readiness.stripe}
                  extra={
                    <div className="flex gap-2 mt-1 flex-wrap text-xs">
                      <span className={`px-2 py-0.5 rounded border ${readiness.stripe.webhookConfigured ? "bg-green-50 text-green-700 border-green-200" : "bg-orange-50 text-orange-700 border-orange-200"}`}>
                        Webhook: {readiness.stripe.webhookConfigured ? "✓ set" : "✗ missing"}
                      </span>
                      {readiness.stripe.liveModeGuard && (
                        <span className="px-2 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">⚠ LIVE MONEY</span>
                      )}
                    </div>
                  }
                />
                <ReadinessCard label="SendGrid Email" icon="📧" status={readiness.sendgrid}
                  extra={
                    <div className="text-xs text-gray-500 mt-1">
                      From: <code className="bg-gray-100 px-1 rounded">{readiness.sendgrid.fromEmail}</code>
                    </div>
                  }
                />
                <ReadinessCard label="PDF Storage (S3/R2)" icon="📄" status={readiness.storage} />
                <ReadinessCard label="Expo Push Notifications" icon="🔔" status={readiness.push} />
                <ReadinessCard label="Google Maps / Places" icon="🗺" status={readiness.googleMaps} />
                <ReadinessCard label="Google OAuth (Sign-In)" icon="🔵" status={readiness.googleOauth} />
                <ReadinessCard label="Firebase Admin (Phone Auth)" icon="🔥" status={readiness.firebase} />
                <div className="bg-white border border-green-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🔄</span>
                    <span className="font-semibold text-gray-800">Realtime WebSocket</span>
                    <span className="px-2 py-0.5 rounded border text-xs font-bold tracking-wide bg-green-100 text-green-700 border-green-200">ACTIVE</span>
                  </div>
                  <p className="text-xs text-gray-500">Courier, customer and admin WebSocket buses active. No credentials required.</p>
                </div>
              </div>

              {/* Credentials Checklist */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-semibold text-gray-800 mb-3 text-sm">Server ENV Variables</h3>
                <div className="space-y-2">
                  {[
                    { key: "STRIPE_SECRET_KEY", ready: readiness.stripe.configured, label: "Stripe secret key — sk_test_... / sk_live_..." },
                    { key: "STRIPE_WEBHOOK_SECRET", ready: readiness.stripe.webhookConfigured, label: "Stripe webhook secret — whsec_..." },
                    { key: "SENDGRID_API_KEY", ready: readiness.sendgrid.configured, label: "SendGrid API key — SG.xxx" },
                    { key: "AIST_FROM_EMAIL", ready: readiness.sendgrid.fromEmail !== "noreply@aist.cz", label: "Verified sender email for SendGrid" },
                    { key: "STORAGE_BUCKET_URL", ready: readiness.storage.configured, label: "S3/R2 bucket URL + STORAGE_ACCESS_KEY + STORAGE_SECRET_KEY" },
                    { key: "GOOGLE_CLIENT_ID", ready: readiness.googleOauth.configured, label: "Google OAuth client ID (for Google Sign-In)" },
                    { key: "GOOGLE_CLIENT_SECRET", ready: readiness.googleOauth.configured, label: "Google OAuth client secret" },
                    { key: "GOOGLE_MAPS_SERVER_KEY", ready: readiness.googleMaps.configured, label: "Server-side Maps/Geocoding key (optional)" },
                    { key: "FIREBASE_PROJECT_ID", ready: readiness.firebase.configured, label: "Firebase project ID (for phone auth only)" },
                  ].map(item => (
                    <div key={item.key} className="flex items-center gap-3 text-sm">
                      <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${item.ready ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                        {item.ready ? "✓" : "–"}
                      </span>
                      <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 shrink-0">{item.key}</code>
                      <span className="text-gray-500 text-xs">{item.label}</span>
                    </div>
                  ))}
                </div>

                <h3 className="font-semibold text-gray-800 mb-3 mt-5 text-sm">Mobile ENV Variables (EXPO_PUBLIC_*)</h3>
                <div className="space-y-2">
                  {[
                    { key: "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", label: "Google Maps SDK key (Maps + Places Autocomplete)" },
                    { key: "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID", label: "Google OAuth web client ID (Google Sign-In, PKCE)" },
                    { key: "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID", label: "Google OAuth Android client ID (optional, for native)" },
                    { key: "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", label: "Google OAuth iOS client ID (optional, for native)" },
                    { key: "EAS_PROJECT_ID", label: "EAS project UUID (for push notifications in production builds)" },
                  ].map(item => (
                    <div key={item.key} className="flex items-center gap-3 text-sm">
                      <span className="w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold bg-gray-100 text-gray-400">–</span>
                      <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 shrink-0">{item.key}</code>
                      <span className="text-gray-500 text-xs">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* What works / What's needed */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                  <h3 className="font-semibold text-blue-800 mb-3 text-sm">✅ Works right now (mock mode)</h3>
                  <div className="space-y-1 text-xs text-blue-700">
                    {[
                      "Email/password auth (JWT)",
                      "Customer order creation",
                      "Courier assignment + GPS tracking",
                      "Live dispatcher WebSocket dashboard",
                      "Customer live order tracking",
                      "Pricing engine (zone + surge + promo)",
                      "Promo codes + discount engine",
                      "Refund evaluation + coupon issuance",
                      "PDF invoice generation (pdfkit)",
                      "Finance stats dashboard",
                      "Payout batch creation (OSVČ/zaměstnanec)",
                      "Stripe PaymentIntent (mock mode)",
                      "Push notifications via Expo (courier)",
                      "Push notifications via Expo (customer)",
                      "Admin panel (all sections)",
                      "4-language support (EN/CS/RU/UK)",
                    ].map(item => <div key={item} className="flex items-start gap-1.5"><span className="text-green-600 font-bold">✓</span><span>{item}</span></div>)}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
                    <h3 className="font-semibold text-orange-700 mb-3 text-sm">⚙ Requires live credentials</h3>
                    <div className="space-y-1 text-xs text-orange-700">
                      {[
                        "Real payment capture (STRIPE_SECRET_KEY)",
                        "Stripe webhook processing (STRIPE_WEBHOOK_SECRET)",
                        "Transactional email delivery (SENDGRID_API_KEY)",
                        "PDF cloud storage (STORAGE_BUCKET_URL + keys)",
                        "Google Sign-In (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)",
                        "Courier Stripe Connect payouts",
                      ].map(item => <div key={item} className="flex items-start gap-1.5"><span>⚙</span><span>{item}</span></div>)}
                    </div>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                    <h3 className="font-semibold text-purple-700 mb-3 text-sm">📱 Requires physical device</h3>
                    <div className="space-y-1 text-xs text-purple-700">
                      {[
                        "Real Expo push token (not simulator)",
                        "Google Maps native tile rendering",
                        "Background location tracking",
                        "Location 'Always' permission",
                        "Camera (proof of delivery)",
                      ].map(item => <div key={item} className="flex items-start gap-1.5"><span>📱</span><span>{item}</span></div>)}
                    </div>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                    <h3 className="font-semibold text-gray-700 mb-3 text-sm">🚀 Remaining to TestFlight</h3>
                    <div className="space-y-1 text-xs text-gray-600">
                      {[
                        "Create EAS account + set EAS_PROJECT_ID",
                        "Configure Google OAuth client IDs",
                        "Set up Apple Developer account",
                        "Run: eas build --profile preview --platform ios",
                        "Submit to TestFlight via eas submit",
                        "Configure Stripe test keys for beta",
                      ].map(item => <div key={item} className="flex items-start gap-1.5"><span className="text-gray-400">→</span><span>{item}</span></div>)}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      ) : tab === "finance" ? (
        <div className="space-y-4">
          {finance && (
            <>
              {[
                { label: "Orders", icon: "📦", data: finance.orders, fields: [
                  ["total_orders","Total"],["delivered","Delivered"],["cancelled","Cancelled"],
                  ["stripe_orders","Stripe orders"],["pending_capture","Pending capture"],["captured","Captured"],
                  ["total_revenue_czk","Revenue (CZK)"],
                ]},
                { label: "Invoices", icon: "🧾", data: finance.invoices, fields: [
                  ["total","Total"],["issued","Issued"],["with_pdf","With PDF"],["without_pdf","No PDF"],["total_amount_czk","Total amount (CZK)"],
                ]},
                { label: "Refunds", icon: "↩️", data: finance.refunds, fields: [
                  ["total","Total"],["pending","Pending"],["approved","Approved"],["rejected","Rejected"],["total_approved_czk","Approved amount (CZK)"],
                ]},
                { label: "Coupons", icon: "🎟", data: finance.coupons, fields: [
                  ["total","Total"],["active","Active"],["used","Used"],
                ]},
                { label: "Payouts", icon: "💸", data: finance.payouts, fields: [
                  ["total","Total batches"],["pending","Pending"],["approved","Approved"],["executed","Executed"],
                ]},
              ].map(section => (
                <div key={section.label} className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2 text-sm">
                    <span>{section.icon}</span> {section.label}
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    {section.fields.map(([key, label]) => (
                      <div key={key} className="bg-gray-50 rounded-lg p-3">
                        <div className="text-lg font-bold text-gray-900">{section.data[key] ?? "—"}</div>
                        <div className="text-xs text-gray-500">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      ) : tab === "emails" ? (
        <div className="space-y-4">
          {emailLog && (
            <>
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "Total", value: emailLog.stats.total, color: "text-gray-900" },
                  { label: "Sent", value: emailLog.stats.sent, color: "text-green-700" },
                  { label: "Skipped (mock)", value: emailLog.stats.skipped, color: "text-gray-500" },
                  { label: "Failed", value: emailLog.stats.failed, color: "text-red-600" },
                ].map(s => (
                  <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-gray-500">{s.label}</div>
                  </div>
                ))}
              </div>

              {emailLog.log.length === 0 ? (
                <div className="text-gray-400 text-center py-12">No emails logged yet</div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {["Status","To","Subject","Template","Time"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {emailLog.log.map(entry => (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              entry.status === "sent" ? "bg-green-100 text-green-700" :
                              entry.status === "failed" ? "bg-red-100 text-red-700" :
                              "bg-gray-100 text-gray-500"
                            }`}>{entry.status}</span>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600">{entry.to}</td>
                          <td className="px-4 py-2 text-xs text-gray-700 max-w-xs truncate">{entry.subject}</td>
                          <td className="px-4 py-2 text-xs font-mono text-gray-400">{entry.template}</td>
                          <td className="px-4 py-2 text-xs text-gray-400">{new Date(entry.sentAt).toLocaleString("cs-CZ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* Beta Device Checklist */
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
            <strong>Operational Device Testing Checklist</strong> — Print this and go through it on a real iOS/Android device.
            Use test accounts: <code className="bg-white/60 px-1 rounded">customer@aist.cz / Aist1234</code> and <code className="bg-white/60 px-1 rounded">courier3@aist.cz / courier123</code>
          </div>

          {[
            { title: "Customer Flow", icon: "👤", items: BETA_CHECKLIST.customer, color: "blue" },
            { title: "Courier Flow", icon: "🚴", items: BETA_CHECKLIST.courier, color: "green" },
            { title: "Admin / Ops Flow", icon: "🛠", items: BETA_CHECKLIST.admin, color: "purple" },
          ].map(section => (
            <div key={section.title} className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span>{section.icon}</span>
                <span>{section.title}</span>
                <span className="text-xs font-normal text-gray-400">{section.items.length} steps</span>
              </h3>
              <div>
                {section.items.map(item => (
                  <CheckRow key={item.id} done={false} label={item.label} detail={item.detail} />
                ))}
              </div>
            </div>
          ))}

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
            <h3 className="font-bold text-gray-800 mb-3 text-sm">🔧 Build Commands (when ready)</h3>
            <div className="space-y-2 font-mono text-xs">
              {[
                ["Install EAS CLI", "npm install -g eas-cli"],
                ["Login to EAS", "eas login"],
                ["Configure project", "eas build:configure"],
                ["Dev build (simulator)", "eas build --profile development --platform ios"],
                ["Preview build (internal)", "eas build --profile preview --platform all"],
                ["Submit to TestFlight", "eas submit --platform ios"],
                ["Update over-the-air", "eas update --branch preview --message 'fix: ...'"],
              ].map(([label, cmd]) => (
                <div key={label} className="flex gap-3">
                  <span className="text-gray-400 w-40 shrink-0">{label}</span>
                  <code className="bg-gray-100 px-2 py-0.5 rounded text-gray-700">{cmd}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
