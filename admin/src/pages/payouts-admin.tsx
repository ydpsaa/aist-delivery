import { useEffect, useState } from "react";

const API = "/api";

type PayoutStatus = "draft" | "pending_review" | "approved" | "executed" | "failed";
type CourierType = "fleet" | "osvč";

interface PayoutBatch {
  id: string;
  courierId: string;
  courierType: CourierType;
  status: PayoutStatus;
  payoutMethod: string;
  grossAmountCzk: number;
  platformFeeCzk: number;
  stripeFeeCzk: number;
  taxWithheldCzk: number;
  finalPayoutCzk: number;
  periodStart: string;
  periodEnd: string;
  executedAt?: string;
  meta?: { orderCount?: number; grossRevenue?: number };
  createdAt: string;
}

interface PayoutItem {
  id: string;
  orderId: string;
  orderPriceCzk: number;
  platformFeeCzk: number;
  courierShareCzk: number;
  deliveredAt?: string;
}

const STATUS_COLORS: Record<PayoutStatus, string> = {
  draft:          "bg-gray-100 text-gray-600",
  pending_review: "bg-yellow-100 text-yellow-700",
  approved:       "bg-blue-100 text-blue-700",
  executed:       "bg-green-100 text-green-700",
  failed:         "bg-red-100 text-red-600",
};

interface GenerateForm {
  courierId: string;
  courierType: CourierType;
  periodStart: string;
  periodEnd: string;
  payoutMethod: "bank_transfer" | "stripe_connect" | "cash";
}

function getDefaultWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now);
  start.setDate(diff - 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default function PayoutsAdminPage() {
  const [batches, setBatches] = useState<PayoutBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<PayoutBatch | null>(null);
  const [items, setItems] = useState<PayoutItem[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const week = getDefaultWeekRange();
  const [form, setForm] = useState<GenerateForm>({
    courierId: "", courierType: "fleet",
    periodStart: week.start, periodEnd: week.end, payoutMethod: "bank_transfer",
  });

  const token = localStorage.getItem("admin_token") ?? "";
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function fetchBatches() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/admin/payouts`, { headers });
      const data = await r.json();
      setBatches(data.batches ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchBatches(); }, []);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch(`${API}/admin/payouts/generate`, {
      method: "POST", headers,
      body: JSON.stringify({
        courierId: form.courierId,
        courierType: form.courierType,
        periodStart: new Date(form.periodStart).toISOString(),
        periodEnd: new Date(form.periodEnd + "T23:59:59").toISOString(),
        payoutMethod: form.payoutMethod,
      }),
    });
    if (r.ok) {
      setShowGenerate(false);
      fetchBatches();
    }
  }

  async function handleApprove(id: string) {
    setActionLoading(id);
    await fetch(`${API}/admin/payouts/${id}/approve`, { method: "PATCH", headers });
    await fetchBatches();
    setActionLoading(null);
  }

  async function handleViewItems(batch: PayoutBatch) {
    setSelectedBatch(batch);
    const r = await fetch(`${API}/admin/payouts/${batch.id}/items`, { headers });
    const data = await r.json();
    setItems(data.items ?? []);
  }

  const totalPayout = batches.filter(b => b.status === "executed").reduce((s, b) => s + b.finalPayoutCzk, 0);
  const pendingPayout = batches.filter(b => ["draft","pending_review","approved"].includes(b.status)).reduce((s, b) => s + b.finalPayoutCzk, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Courier Payouts</h1>
          <p className="text-sm text-gray-500 mt-1">Weekly payout batches — Fleet & OSVČ couriers</p>
        </div>
        <button onClick={() => setShowGenerate(true)} className="bg-[#1762FF] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          + Generate Payout
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-900">{batches.length}</div>
          <div className="text-sm text-gray-500">Total batches</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-yellow-600">{pendingPayout.toLocaleString("cs-CZ")} CZK</div>
          <div className="text-sm text-gray-500">Pending payout</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-green-600">{totalPayout.toLocaleString("cs-CZ")} CZK</div>
          <div className="text-sm text-gray-500">Executed payouts</div>
        </div>
      </div>

      {showGenerate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <form onSubmit={handleGenerate} className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Generate Weekly Payout</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Courier ID</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.courierId} onChange={e => setForm(f => ({ ...f, courierId: e.target.value }))} required placeholder="uuid" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Courier type</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.courierType} onChange={e => setForm(f => ({ ...f, courierType: e.target.value as CourierType }))}>
                  <option value="fleet">Fleet (DPP/DPČ)</option>
                  <option value="osvč">OSVČ (B2B)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Period start</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.periodStart} onChange={e => setForm(f => ({ ...f, periodStart: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Period end</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.periodEnd} onChange={e => setForm(f => ({ ...f, periodEnd: e.target.value }))} required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payout method</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.payoutMethod} onChange={e => setForm(f => ({ ...f, payoutMethod: e.target.value as any }))}>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="stripe_connect">Stripe Connect</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setShowGenerate(false)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button type="submit" className="flex-1 bg-[#1762FF] text-white py-2 rounded-lg text-sm font-medium">Generate</button>
            </div>
          </form>
        </div>
      )}

      {selectedBatch && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelectedBatch(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-semibold">Payout Breakdown</h2>
              <button onClick={() => setSelectedBatch(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div><span className="text-gray-500">Courier: </span><span className="font-mono">{selectedBatch.courierId.slice(0, 8)}…</span></div>
              <div><span className="text-gray-500">Type: </span><span className="font-medium">{selectedBatch.courierType.toUpperCase()}</span></div>
              <div><span className="text-gray-500">Period: </span>{new Date(selectedBatch.periodStart).toLocaleDateString("cs-CZ")} — {new Date(selectedBatch.periodEnd).toLocaleDateString("cs-CZ")}</div>
              <div><span className="text-gray-500">Orders: </span><span className="font-bold">{selectedBatch.meta?.orderCount ?? 0}</span></div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Gross revenue</span><span className="font-medium">{selectedBatch.grossAmountCzk} CZK</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Platform fee</span><span className="text-red-500">−{selectedBatch.platformFeeCzk} CZK</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Stripe fee</span><span className="text-red-500">−{selectedBatch.stripeFeeCzk} CZK</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Tax withheld</span><span className="text-orange-500">−{selectedBatch.taxWithheldCzk} CZK</span></div>
              <div className="flex justify-between border-t pt-2 font-bold text-base"><span>Final payout</span><span className="text-green-600">{selectedBatch.finalPayoutCzk} CZK</span></div>
            </div>
            {items.length > 0 && (
              <table className="w-full text-xs">
                <thead><tr className="text-gray-400 border-b">
                  <th className="py-2 text-left">Order</th>
                  <th className="py-2 text-right">Order price</th>
                  <th className="py-2 text-right">Platform fee</th>
                  <th className="py-2 text-right">Courier share</th>
                  <th className="py-2 text-left">Delivered</th>
                </tr></thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-gray-50">
                      <td className="py-1.5 font-mono">{item.orderId.slice(0, 8)}…</td>
                      <td className="py-1.5 text-right">{item.orderPriceCzk}</td>
                      <td className="py-1.5 text-right text-red-500">−{item.platformFeeCzk}</td>
                      <td className="py-1.5 text-right text-green-600 font-medium">{item.courierShareCzk}</td>
                      <td className="py-1.5">{item.deliveredAt ? new Date(item.deliveredAt).toLocaleDateString("cs-CZ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 py-12 text-center">Loading...</div>
      ) : batches.length === 0 ? (
        <div className="text-gray-400 py-12 text-center">No payout batches yet</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Status","Courier","Type","Gross","Final Payout","Tax","Period","Method","Orders","Actions"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batches.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.status]}`}>{b.status}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.courierId.slice(0, 8)}…</td>
                  <td className="px-4 py-3"><span className={`text-xs font-semibold ${b.courierType === "fleet" ? "text-blue-600" : "text-purple-600"}`}>{b.courierType.toUpperCase()}</span></td>
                  <td className="px-4 py-3 text-gray-700">{b.grossAmountCzk} CZK</td>
                  <td className="px-4 py-3 font-semibold text-green-700">{b.finalPayoutCzk} CZK</td>
                  <td className="px-4 py-3 text-orange-600">{b.taxWithheldCzk > 0 ? `${b.taxWithheldCzk} CZK` : "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(b.periodStart).toLocaleDateString("cs-CZ")} – {new Date(b.periodEnd).toLocaleDateString("cs-CZ")}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{b.payoutMethod.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-center text-gray-700">{b.meta?.orderCount ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleViewItems(b)} className="text-xs bg-gray-50 text-gray-700 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100">Details</button>
                      {b.status === "draft" && (
                        <button onClick={() => handleApprove(b.id)} disabled={actionLoading === b.id} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded hover:bg-green-100">Approve</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
