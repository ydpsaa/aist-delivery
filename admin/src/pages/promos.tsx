/**
 * Admin Promo Codes Management
 */
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tag, Plus, RefreshCw, Power, Trash2, X } from "lucide-react";
import { getAuthToken } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

const API = (path: string) => `/api${path}`;

async function apiFetch(path: string, opts?: RequestInit) {
  const token = getAuthToken();
  const res = await fetch(API(path), {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...opts?.headers },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

type DiscountType = "fixed" | "percent" | "first_order";
type ServiceScope = "flash" | "cargo" | "bfm" | "all";

interface PromoRules {
  discountType: DiscountType;
  discountValue: number;
  maxUses: number | null;
  validFrom: string | null;
  validUntil: string | null;
  appliesTo: ServiceScope[];
  firstOrderOnly: boolean;
  minOrderValue: number | null;
}

interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  rules: PromoRules;
  usedCount: number;
  isActive: boolean;
  createdAt: string;
}

const EMPTY_RULES: PromoRules = {
  discountType: "fixed",
  discountValue: 50,
  maxUses: null,
  validFrom: null,
  validUntil: null,
  appliesTo: ["all"],
  firstOrderOnly: false,
  minOrderValue: null,
};

function PromoModal({ open, onClose, onSave }: {
  open: boolean; onClose: () => void; onSave: (code: string, desc: string, rules: PromoRules) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [desc, setDesc] = useState("");
  const [rules, setRules] = useState<PromoRules>(EMPTY_RULES);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!code.trim()) return;
    setSaving(true);
    try { await onSave(code, desc, rules); } finally { setSaving(false); }
  };

  if (!open) return null;

  const toggleService = (s: ServiceScope) => {
    if (s === "all") { setRules({ ...rules, appliesTo: ["all"] }); return; }
    const cur = rules.appliesTo.filter((x) => x !== "all");
    if (cur.includes(s)) {
      setRules({ ...rules, appliesTo: cur.filter((x) => x !== s) || ["all"] });
    } else {
      setRules({ ...rules, appliesTo: [...cur, s] });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold">Create Promo Code</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-sm font-medium">Code *</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. FIRSTDELIVERY50"
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm font-mono uppercase bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Internal note"
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Discount type</label>
              <select value={rules.discountType} onChange={(e) => setRules({ ...rules, discountType: e.target.value as DiscountType })}
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="fixed">Fixed amount (CZK)</option>
                <option value="percent">Percentage (%)</option>
                <option value="first_order">First order (fixed)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Value</label>
              <input type="number" value={rules.discountValue} onChange={(e) => setRules({ ...rules, discountValue: Number(e.target.value) })}
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Applies to</label>
            <div className="flex gap-2 flex-wrap mt-2">
              {(["all","flash","cargo","bfm"] as ServiceScope[]).map((s) => (
                <button key={s} onClick={() => toggleService(s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${rules.appliesTo.includes(s) ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}>
                  {s === "all" ? "All services" : s === "bfm" ? "Buy For Me" : s === "flash" ? "Flash Express" : "Cargo Window"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Valid from</label>
              <input type="date" value={rules.validFrom ?? ""} onChange={(e) => setRules({ ...rules, validFrom: e.target.value || null })}
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Valid until</label>
              <input type="date" value={rules.validUntil ?? ""} onChange={(e) => setRules({ ...rules, validUntil: e.target.value || null })}
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Max uses (empty = unlimited)</label>
              <input type="number" value={rules.maxUses ?? ""} onChange={(e) => setRules({ ...rules, maxUses: e.target.value ? Number(e.target.value) : null })}
                placeholder="Unlimited"
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Min order value (CZK)</label>
              <input type="number" value={rules.minOrderValue ?? ""} onChange={(e) => setRules({ ...rules, minOrderValue: e.target.value ? Number(e.target.value) : null })}
                placeholder="No minimum"
                className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="firstOnly" checked={rules.firstOrderOnly} onChange={(e) => setRules({ ...rules, firstOrderOnly: e.target.checked })} className="h-4 w-4" />
            <label htmlFor="firstOnly" className="text-sm">First order only</label>
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t">
          <button onClick={onClose} className="flex-1 border rounded-md px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving || !code.trim()}
            className="flex-1 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors">
            {saving ? <RefreshCw className="h-4 w-4 animate-spin mx-auto" /> : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Promos() {
  const { toast } = useToast();
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const { promos: p } = await apiFetch("/admin/promos"); setPromos(p); }
    catch { toast({ title: "Failed to load promos", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (code: string, description: string, rules: PromoRules) => {
    await apiFetch("/admin/promos", { method: "POST", body: JSON.stringify({ code, description, rules }) });
    toast({ title: `Promo code ${code} created` });
    setShowModal(false);
    load();
  };

  const toggle = async (p: PromoCode) => {
    await apiFetch(`/admin/promos/${p.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !p.isActive }) });
    setPromos((prev) => prev.map((x) => x.id === p.id ? { ...x, isActive: !x.isActive } : x));
  };

  const remove = async (p: PromoCode) => {
    if (!confirm(`Delete promo code ${p.code}?`)) return;
    await apiFetch(`/admin/promos/${p.id}`, { method: "DELETE" });
    setPromos((prev) => prev.filter((x) => x.id !== p.id));
    toast({ title: `${p.code} deleted` });
  };

  const formatDiscount = (r: PromoRules) => {
    if (r.discountType === "percent") return `${r.discountValue}% off`;
    if (r.discountType === "first_order") return `−${r.discountValue} CZK (1st order)`;
    return `−${r.discountValue} CZK`;
  };

  const formatServices = (r: PromoRules) =>
    r.appliesTo.includes("all") ? "All" : r.appliesTo.map((s) => s === "bfm" ? "BFM" : s.charAt(0).toUpperCase() + s.slice(1)).join(", ");

  return (
    <div className="space-y-6">
      <PromoModal open={showModal} onClose={() => setShowModal(false)} onSave={handleCreate} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Promo Codes</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage discount codes and voucher campaigns.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-md border hover:bg-accent transition-colors">
            <RefreshCw className="h-4 w-4" />Refresh
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" />New Code
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{promos.length}</div><div className="text-sm text-muted-foreground">Total codes</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-emerald-600">{promos.filter(p => p.isActive).length}</div><div className="text-sm text-muted-foreground">Active</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{promos.reduce((s, p) => s + p.usedCount, 0)}</div><div className="text-sm text-muted-foreground">Total uses</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Tag className="h-4 w-4" />All Promo Codes</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : promos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tag className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p>No promo codes yet. Create your first one!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Validity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-mono font-bold text-sm tracking-wider">{p.code}</div>
                      {p.description && <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>}
                    </TableCell>
                    <TableCell><span className="font-medium text-sm">{formatDiscount(p.rules)}</span></TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{formatServices(p.rules)}</Badge></TableCell>
                    <TableCell>
                      <span className="text-sm">{p.usedCount}</span>
                      {p.rules.maxUses && <span className="text-muted-foreground text-xs"> / {p.rules.maxUses}</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.rules.validFrom ? new Date(p.rules.validFrom).toLocaleDateString() : "Any"}{" → "}
                      {p.rules.validUntil ? new Date(p.rules.validUntil).toLocaleDateString() : "Any"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={p.isActive ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-gray-100 text-gray-500"}>
                        {p.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => toggle(p)} title={p.isActive ? "Deactivate" : "Activate"}
                          className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground">
                          <Power className={`h-4 w-4 ${p.isActive ? "text-emerald-600" : ""}`} />
                        </button>
                        <button onClick={() => remove(p)} title="Delete"
                          className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
