import { useEffect, useState } from "react";

const API = "/api";

type RefundStatus = "pending" | "approved" | "rejected" | "executed" | "failed";
type RefundReason =
  | "flash_delay_minor" | "flash_delay_major" | "cargo_window_missed"
  | "customer_cancel_before" | "customer_cancel_after" | "bfm_cancel_video"
  | "damage_claim" | "admin_goodwill" | "duplicate_charge" | "other";

interface Refund {
  id: string;
  orderId: string;
  customerId: string;
  refundType: string;
  status: RefundStatus;
  reason: RefundReason;
  trigger: string;
  amountCzk: number;
  couponAmountCzk?: number;
  autoApproved: boolean;
  notes?: string;
  processedAt?: string;
  createdAt: string;
}

const STATUS_COLORS: Record<RefundStatus, string> = {
  pending:  "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
  executed: "bg-green-100 text-green-800",
  failed:   "bg-gray-100 text-gray-800",
};

const REASON_LABELS: Record<string, string> = {
  flash_delay_minor:      "Flash delay <60 min",
  flash_delay_major:      "Flash delay >60 min",
  cargo_window_missed:    "Cargo window missed",
  customer_cancel_before: "Cancel before departure",
  customer_cancel_after:  "Cancel after departure",
  bfm_cancel_video:       "BFM cancel (video step)",
  damage_claim:           "Damage claim",
  admin_goodwill:         "Admin goodwill",
  duplicate_charge:       "Duplicate charge",
  other:                  "Other",
};

interface CreateRefundForm {
  orderId: string;
  reason: RefundReason;
  amountCzk: string;
  notes: string;
}

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateRefundForm>({ orderId: "", reason: "admin_goodwill", amountCzk: "", notes: "" });

  const token = localStorage.getItem("admin_token") ?? "";
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function fetchRefunds() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/admin/refunds`, { headers });
      const data = await r.json();
      setRefunds(data.refunds ?? []);
    } catch {
      setError("Failed to load refunds");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRefunds(); }, []);

  async function handleApprove(id: string) {
    setActionLoading(id);
    await fetch(`${API}/admin/refunds/${id}/approve`, { method: "PATCH", headers });
    await fetchRefunds();
    setActionLoading(null);
  }

  async function handleReject(id: string) {
    setActionLoading(id);
    await fetch(`${API}/admin/refunds/${id}/reject`, { method: "PATCH", headers, body: JSON.stringify({ notes: "Rejected by admin" }) });
    await fetchRefunds();
    setActionLoading(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch(`${API}/admin/refunds`, {
      method: "POST",
      headers,
      body: JSON.stringify({ orderId: form.orderId, reason: form.reason, amountCzk: Number(form.amountCzk), notes: form.notes }),
    });
    if (r.ok) {
      setShowCreate(false);
      setForm({ orderId: "", reason: "admin_goodwill", amountCzk: "", notes: "" });
      fetchRefunds();
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Refunds</h1>
          <p className="text-sm text-gray-500 mt-1">Refund decisions and SLA breach compensations</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="bg-[#1762FF] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          + Manual Refund
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Create Manual Refund</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order ID</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.orderId} onChange={e => setForm(f => ({ ...f, orderId: e.target.value }))} required placeholder="uuid" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value as RefundReason }))}>
                  {Object.entries(REASON_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (CZK)</label>
                <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.amountCzk} onChange={e => setForm(f => ({ ...f, amountCzk: e.target.value }))} min={0} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setShowCreate(false)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button type="submit" className="flex-1 bg-[#1762FF] text-white py-2 rounded-lg text-sm font-medium">Create Refund</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 py-12 text-center">Loading...</div>
      ) : error ? (
        <div className="text-red-500 py-6 text-center">{error}</div>
      ) : refunds.length === 0 ? (
        <div className="text-gray-400 py-12 text-center">No refunds yet</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Status","Reason","Type","Amount","Trigger","Auto","Order","Created","Actions"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {refunds.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-[160px]">{REASON_LABELS[r.reason] ?? r.reason}</td>
                  <td className="px-4 py-3 text-gray-500">{r.refundType}</td>
                  <td className="px-4 py-3 font-medium">{r.amountCzk} CZK{r.couponAmountCzk ? ` (+${r.couponAmountCzk} coupon)` : ""}</td>
                  <td className="px-4 py-3 text-gray-500">{r.trigger}</td>
                  <td className="px-4 py-3">{r.autoApproved ? <span className="text-green-600">✓</span> : <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{r.orderId.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(r.createdAt).toLocaleDateString("cs-CZ")}</td>
                  <td className="px-4 py-3">
                    {r.status === "pending" && (
                      <div className="flex gap-2">
                        <button onClick={() => handleApprove(r.id)} disabled={actionLoading === r.id} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded hover:bg-green-100">Approve</button>
                        <button onClick={() => handleReject(r.id)} disabled={actionLoading === r.id} className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded hover:bg-red-100">Reject</button>
                      </div>
                    )}
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
