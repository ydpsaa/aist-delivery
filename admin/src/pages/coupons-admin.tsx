import { useEffect, useState } from "react";

const API = "/api";

type CouponReason = "cargo_window_missed" | "sla_breach" | "goodwill" | "damage_partial" | "admin_manual" | "refund_fallback" | "first_order_bonus" | "referral";
type ServiceScope = "flash" | "cargo" | "bfm" | "any";

interface Coupon {
  id: string;
  customerId: string;
  sourceOrderId?: string;
  amountCzk: number;
  reason: CouponReason;
  serviceScope: ServiceScope;
  notes?: string;
  validUntil: string;
  isUsed: boolean;
  usedAt?: string;
  isActive: boolean;
  createdAt: string;
}

const REASON_LABELS: Record<string, string> = {
  cargo_window_missed: "Cargo window missed",
  sla_breach:          "SLA breach",
  goodwill:            "Goodwill",
  damage_partial:      "Partial damage comp.",
  admin_manual:        "Admin manual",
  refund_fallback:     "Refund fallback",
  first_order_bonus:   "First order bonus",
  referral:            "Referral",
};

const SCOPE_LABELS: Record<ServiceScope, string> = {
  flash: "Flash Express",
  cargo: "Cargo Window",
  bfm:   "Buy For Me",
  any:   "Any service",
};

interface CreateForm {
  customerId: string;
  amountCzk: string;
  reason: CouponReason;
  serviceScope: ServiceScope;
  validDays: string;
  notes: string;
}

export default function CouponsAdminPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [form, setForm] = useState<CreateForm>({
    customerId: "", amountCzk: "", reason: "admin_manual",
    serviceScope: "any", validDays: "365", notes: "",
  });

  const token = localStorage.getItem("admin_token") ?? "";
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  async function fetchCoupons() {
    setLoading(true);
    try {
      const r = await fetch(`${API}/admin/coupons`, { headers });
      const data = await r.json();
      setCoupons(data.coupons ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchCoupons(); }, []);

  async function handleDeactivate(id: string) {
    setActionLoading(id);
    await fetch(`${API}/admin/coupons/${id}/deactivate`, { method: "PATCH", headers });
    await fetchCoupons();
    setActionLoading(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch(`${API}/admin/coupons`, {
      method: "POST", headers,
      body: JSON.stringify({ customerId: form.customerId, amountCzk: Number(form.amountCzk), reason: form.reason, serviceScope: form.serviceScope, validDays: Number(form.validDays), notes: form.notes }),
    });
    if (r.ok) {
      setShowCreate(false);
      setForm({ customerId: "", amountCzk: "", reason: "admin_manual", serviceScope: "any", validDays: "365", notes: "" });
      fetchCoupons();
    }
  }

  const active = coupons.filter(c => c.isActive && !c.isUsed);
  const inactive = coupons.filter(c => !c.isActive || c.isUsed);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Coupons</h1>
          <p className="text-sm text-gray-500 mt-1">Compensation coupons issued by system or admin</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="bg-[#1762FF] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          + Issue Coupon
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-900">{coupons.length}</div>
          <div className="text-sm text-gray-500">Total issued</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-green-600">{active.length}</div>
          <div className="text-sm text-gray-500">Active</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-2xl font-bold text-gray-400">{inactive.length}</div>
          <div className="text-sm text-gray-500">Used / Expired</div>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Issue Manual Coupon</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer ID</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.customerId} onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))} required placeholder="uuid" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (CZK)</label>
                <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.amountCzk} onChange={e => setForm(f => ({ ...f, amountCzk: e.target.value }))} required min={1} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value as CouponReason }))}>
                  {Object.entries(REASON_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service scope</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.serviceScope} onChange={e => setForm(f => ({ ...f, serviceScope: e.target.value as ServiceScope }))}>
                  {Object.entries(SCOPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valid for (days)</label>
                <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.validDays} onChange={e => setForm(f => ({ ...f, validDays: e.target.value }))} min={1} max={730} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => setShowCreate(false)} className="flex-1 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm">Cancel</button>
              <button type="submit" className="flex-1 bg-[#1762FF] text-white py-2 rounded-lg text-sm font-medium">Issue Coupon</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 py-12 text-center">Loading...</div>
      ) : coupons.length === 0 ? (
        <div className="text-gray-400 py-12 text-center">No coupons issued yet</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Status","Amount","Reason","Scope","Customer","Valid Until","Used","Created","Actions"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {coupons.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {c.isUsed
                      ? <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">Used</span>
                      : c.isActive && new Date(c.validUntil) > new Date()
                        ? <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Active</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-600">Expired</span>
                    }
                  </td>
                  <td className="px-4 py-3 font-semibold text-[#1762FF]">{c.amountCzk} CZK</td>
                  <td className="px-4 py-3 text-gray-700">{REASON_LABELS[c.reason] ?? c.reason}</td>
                  <td className="px-4 py-3 text-gray-500">{SCOPE_LABELS[c.serviceScope] ?? c.serviceScope}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">{c.customerId.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(c.validUntil).toLocaleDateString("cs-CZ")}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.usedAt ? new Date(c.usedAt).toLocaleDateString("cs-CZ") : "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString("cs-CZ")}</td>
                  <td className="px-4 py-3">
                    {c.isActive && !c.isUsed && (
                      <button onClick={() => handleDeactivate(c.id)} disabled={actionLoading === c.id} className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-100">
                        Deactivate
                      </button>
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
