/**
 * Admin Pricing Management
 * Editable pricing config for Flash, Cargo Window, Buy For Me, Zone rules
 */
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Clock, ShoppingBag, MapPin, Save, RefreshCw } from "lucide-react";
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

interface FlashConfig {
  baseFee: number;
  includedKm: number;
  perKmRate: number;
  timeCoefficients: { day: number; evening: number; night: number; weekend: number };
  urgentCoefficient: number;
  urgentThresholdMin: number;
}

interface CargoWindow { id: string; label: string; basePrice: number; startHour: number; endHour: number; }
interface CargoConfig {
  windows: CargoWindow[];
  includedKm: number;
  perKmRate: number;
  sizeSurcharges: { small: number; medium: number; large: number; xl: number };
}
interface BfmConfig {
  serviceFee: number;
  perKmRate: number;
  freeWaitMinutes: number;
  waitRatePerMin: number;
  depositPercent: number;
  depositMinimum: number;
  cashFee: number;
}
interface ZoneConfig {
  outsidePragueRatePerKm: number;
  lowDemandSurchargePercent: number;
  lowDemandEnabled: boolean;
}

function NumField({ label, value, onChange, step = 1, unit = "CZK" }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; unit?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{unit}</p>
      </div>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-28 text-right border rounded-md px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}

export function Pricing() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const [flash, setFlash] = useState<FlashConfig | null>(null);
  const [cargo, setCargo] = useState<CargoConfig | null>(null);
  const [bfm, setBfm] = useState<BfmConfig | null>(null);
  const [zone, setZone] = useState<ZoneConfig | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { configs } = await apiFetch("/admin/pricing");
      for (const row of configs) {
        if (row.serviceType === "flash") setFlash(row.config as FlashConfig);
        if (row.serviceType === "cargo") setCargo(row.config as CargoConfig);
        if (row.serviceType === "bfm")   setBfm(row.config   as BfmConfig);
        if (row.serviceType === "zone")  setZone(row.config  as ZoneConfig);
      }
    } catch {
      toast({ title: "Failed to load pricing", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (type: string, config: unknown) => {
    setSaving(type);
    try {
      await apiFetch(`/admin/pricing/${type}`, { method: "PATCH", body: JSON.stringify({ config }) });
      toast({ title: `${type.toUpperCase()} pricing saved` });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pricing Management</h1>
          <p className="text-muted-foreground text-sm mt-1">All changes take effect immediately — no server restart needed.</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-md border hover:bg-accent transition-colors">
          <RefreshCw className="h-4 w-4" />Refresh
        </button>
      </div>

      {/* Flash Express */}
      {flash && (
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-red-50 flex items-center justify-center"><Zap className="h-5 w-5 text-red-500" /></div>
              <div><CardTitle className="text-base">Flash Express</CardTitle><p className="text-xs text-muted-foreground">Instant delivery pricing</p></div>
            </div>
            <button
              onClick={() => save("flash", flash)}
              disabled={saving === "flash"}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {saving === "flash" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </button>
          </CardHeader>
          <CardContent className="space-y-0">
            <NumField label="Base fee" value={flash.baseFee} onChange={(v) => setFlash({ ...flash, baseFee: v })} />
            <NumField label="Included km" value={flash.includedKm} onChange={(v) => setFlash({ ...flash, includedKm: v })} unit="km" />
            <NumField label="Per km rate" value={flash.perKmRate} onChange={(v) => setFlash({ ...flash, perKmRate: v })} unit="CZK/km" />
            <div className="py-3 border-b">
              <p className="text-sm font-medium mb-3">Time Coefficients</p>
              <div className="grid grid-cols-2 gap-3">
                {(["day","evening","night","weekend"] as const).map((period) => (
                  <div key={period} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16 capitalize">{period}</span>
                    <input type="number" step={0.05} value={flash.timeCoefficients[period]}
                      onChange={(e) => setFlash({ ...flash, timeCoefficients: { ...flash.timeCoefficients, [period]: Number(e.target.value) } })}
                      className="flex-1 border rounded px-2 py-1 text-sm text-right bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <span className="text-xs text-muted-foreground">×</span>
                  </div>
                ))}
              </div>
            </div>
            <NumField label="Urgent coefficient" value={flash.urgentCoefficient} onChange={(v) => setFlash({ ...flash, urgentCoefficient: v })} step={0.05} unit="multiplier" />
            <NumField label="Urgent threshold" value={flash.urgentThresholdMin} onChange={(v) => setFlash({ ...flash, urgentThresholdMin: v })} unit="minutes" />
          </CardContent>
        </Card>
      )}

      {/* Cargo Window */}
      {cargo && (
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center"><Clock className="h-5 w-5 text-blue-500" /></div>
              <div><CardTitle className="text-base">Cargo Window</CardTitle><p className="text-xs text-muted-foreground">Scheduled delivery pricing</p></div>
            </div>
            <button onClick={() => save("cargo", cargo)} disabled={saving === "cargo"}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors">
              {saving === "cargo" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save
            </button>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium mb-3">Delivery Windows</p>
            <div className="space-y-2 mb-4">
              {cargo.windows.map((w, i) => (
                <div key={w.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                  <Badge variant="outline" className="text-xs min-w-fit">{w.label}</Badge>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-muted-foreground">Base price:</span>
                    <input type="number" value={w.basePrice}
                      onChange={(e) => { const ws = [...cargo.windows]; ws[i] = { ...w, basePrice: Number(e.target.value) }; setCargo({ ...cargo, windows: ws }); }}
                      className="w-24 border rounded px-2 py-1 text-sm text-right bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <span className="text-xs text-muted-foreground">CZK</span>
                  </div>
                </div>
              ))}
            </div>
            <NumField label="Included km" value={cargo.includedKm} onChange={(v) => setCargo({ ...cargo, includedKm: v })} unit="km" />
            <NumField label="Per km rate (extra)" value={cargo.perKmRate} onChange={(v) => setCargo({ ...cargo, perKmRate: v })} unit="CZK/km" />
            <p className="text-sm font-medium mt-3 mb-2">Size Surcharges</p>
            {(["small","medium","large","xl"] as const).map((size) => (
              <NumField key={size} label={`Size: ${size}`} value={cargo.sizeSurcharges[size]}
                onChange={(v) => setCargo({ ...cargo, sizeSurcharges: { ...cargo.sizeSurcharges, [size]: v } })} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Buy For Me */}
      {bfm && (
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-purple-50 flex items-center justify-center"><ShoppingBag className="h-5 w-5 text-purple-500" /></div>
              <div><CardTitle className="text-base">Buy For Me</CardTitle><p className="text-xs text-muted-foreground">Shopping delivery pricing</p></div>
            </div>
            <button onClick={() => save("bfm", bfm)} disabled={saving === "bfm"}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors">
              {saving === "bfm" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save
            </button>
          </CardHeader>
          <CardContent>
            <NumField label="Service fee" value={bfm.serviceFee} onChange={(v) => setBfm({ ...bfm, serviceFee: v })} />
            <NumField label="Per km rate" value={bfm.perKmRate} onChange={(v) => setBfm({ ...bfm, perKmRate: v })} unit="CZK/km" />
            <NumField label="Free wait minutes" value={bfm.freeWaitMinutes} onChange={(v) => setBfm({ ...bfm, freeWaitMinutes: v })} unit="min" />
            <NumField label="Wait rate (after free)" value={bfm.waitRatePerMin} onChange={(v) => setBfm({ ...bfm, waitRatePerMin: v })} unit="CZK/min" />
            <NumField label="Deposit %" value={bfm.depositPercent} onChange={(v) => setBfm({ ...bfm, depositPercent: v })} unit="% of item value" />
            <NumField label="Deposit minimum" value={bfm.depositMinimum} onChange={(v) => setBfm({ ...bfm, depositMinimum: v })} />
            <NumField label="Cash payment fee" value={bfm.cashFee} onChange={(v) => setBfm({ ...bfm, cashFee: v })} />
          </CardContent>
        </Card>
      )}

      {/* Zone */}
      {zone && (
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center"><MapPin className="h-5 w-5 text-green-500" /></div>
              <div><CardTitle className="text-base">Zone & Demand</CardTitle><p className="text-xs text-muted-foreground">Geographic and demand surcharges</p></div>
            </div>
            <button onClick={() => save("zone", zone)} disabled={saving === "zone"}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors">
              {saving === "zone" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save
            </button>
          </CardHeader>
          <CardContent>
            <NumField label="Outside Prague surcharge" value={zone.outsidePragueRatePerKm} onChange={(v) => setZone({ ...zone, outsidePragueRatePerKm: v })} unit="CZK/km extra" />
            <NumField label="Low demand surcharge" value={zone.lowDemandSurchargePercent} onChange={(v) => setZone({ ...zone, lowDemandSurchargePercent: v })} unit="%" />
            <div className="flex items-center justify-between py-3">
              <div><p className="text-sm font-medium">Low demand mode active</p><p className="text-xs text-muted-foreground">Applies low-demand surcharge globally</p></div>
              <button
                onClick={() => setZone({ ...zone, lowDemandEnabled: !zone.lowDemandEnabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${zone.lowDemandEnabled ? "bg-primary" : "bg-muted-foreground/30"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${zone.lowDemandEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
