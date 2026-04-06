/**
 * Dispatcher — Live Operations Dashboard
 *
 * Real-time operational overview for dispatchers and admins.
 * Shows live order feed and courier status without manual refresh.
 *
 * Data is bootstrapped from the REST API and kept up-to-date via
 * WebSocket events. Each event surgically updates only the affected
 * row — there is no full page refetch on each event.
 */
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Truck, Package, Clock, CheckCircle, Wifi, WifiOff, Radio, User } from "lucide-react";
import { useAdminLive, type LiveOrder, type LiveCourier, type CourierLocation } from "@/hooks/useAdminLive";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

const ORDER_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  searching:      { label: "Searching",   cls: "bg-amber-500/15 text-amber-600 border-amber-500/20" },
  assigned:       { label: "Assigned",    cls: "bg-blue-500/15 text-blue-600 border-blue-500/20" },
  courier_arrived:{ label: "At Pickup",   cls: "bg-indigo-500/15 text-indigo-600 border-indigo-500/20" },
  picked_up:      { label: "In Transit",  cls: "bg-violet-500/15 text-violet-600 border-violet-500/20" },
  delivered:      { label: "Delivered",   cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20" },
  cancelled:      { label: "Cancelled",   cls: "bg-rose-500/15 text-rose-600 border-rose-500/20" },
};

function OrderStatusBadge({ status }: { status: string }) {
  const cfg = ORDER_STATUS_CONFIG[status] ?? { label: status, cls: "bg-gray-100 text-gray-800" };
  return (
    <Badge variant="outline" className={`font-medium whitespace-nowrap text-xs ${cfg.cls}`}>
      {cfg.label}
    </Badge>
  );
}

const COURIER_STATUS_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  online:  { label: "Online",  cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20", dot: "bg-emerald-500" },
  busy:    { label: "Busy",    cls: "bg-blue-500/15 text-blue-600 border-blue-500/20",         dot: "bg-blue-500" },
  offline: { label: "Offline", cls: "bg-gray-100 text-gray-500 border-gray-200",               dot: "bg-gray-400" },
};

function CourierStatusBadge({ status }: { status: string }) {
  const cfg = COURIER_STATUS_CONFIG[status] ?? COURIER_STATUS_CONFIG.offline;
  return (
    <Badge variant="outline" className={`font-medium whitespace-nowrap text-xs gap-1.5 ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </Badge>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const MAP: Record<string, { label: string; cls: string }> = {
    flash:  { label: "⚡ Flash",  cls: "bg-amber-100 text-amber-700" },
    window: { label: "🕐 Window", cls: "bg-blue-50 text-blue-700" },
    buy:    { label: "🛍️ Buy",    cls: "bg-purple-50 text-purple-700" },
    cargo:  { label: "📦 Cargo",  cls: "bg-orange-50 text-orange-700" },
  };
  const cfg = MAP[category] ?? { label: category, cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// WS connection indicator
// ---------------------------------------------------------------------------

function ConnectionIndicator({ state }: { state: string }) {
  const isConnected = state === "connected";
  const isConnecting = state === "connecting";

  if (isConnected) {
    return (
      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        LIVE
      </div>
    );
  }

  if (isConnecting) {
    return (
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
        <Radio className="h-3 w-3 animate-pulse" />
        Connecting…
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <WifiOff className="h-3 w-3" />
      Offline
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  sub?: string;
  highlight?: boolean;
  pulse?: boolean;
}

function StatCard({ title, value, icon: Icon, sub, highlight, pulse }: StatCardProps) {
  return (
    <Card className={`shadow-sm overflow-hidden ${highlight ? "border-primary/30 ring-1 ring-primary/20" : "border-border/50"}`}>
      <CardContent className="p-5">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-bold tracking-tight">{value}</p>
              {pulse && value > 0 && (
                <span className="mb-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
              )}
            </div>
          </div>
          <div className={`p-2 rounded-lg ${highlight ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        {sub && <p className="mt-3 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Time formatter
// ---------------------------------------------------------------------------

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

// ---------------------------------------------------------------------------
// Orders table
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES = new Set(["searching", "assigned", "courier_arrived", "picked_up"]);

function OrdersTable({ orders }: { orders: LiveOrder[] }) {
  const active = orders.filter(o => ACTIVE_STATUSES.has(o.status));
  const recent = orders.filter(o => !ACTIVE_STATUSES.has(o.status)).slice(0, 15);
  const display = [...active, ...recent];

  if (display.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">No orders yet</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border/40">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="w-20">ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Route</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Age</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {display.map(order => (
            <TableRow
              key={order.id}
              className={`transition-colors ${ACTIVE_STATUSES.has(order.status) ? "hover:bg-primary/5" : "hover:bg-muted/30"}`}
            >
              <TableCell className="font-mono text-[11px] text-muted-foreground">{order.id.slice(0, 8)}</TableCell>
              <TableCell><OrderStatusBadge status={order.status} /></TableCell>
              <TableCell><CategoryBadge category={order.category} /></TableCell>
              <TableCell className="max-w-[220px]">
                <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                  <span className="truncate font-medium text-foreground">
                    {order.pickupAddress?.label || order.pickupAddress?.address || "—"}
                  </span>
                  <span className="shrink-0">→</span>
                  <span className="truncate">
                    {order.deliveryAddress?.label || order.deliveryAddress?.address || "—"}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right font-medium text-sm">{order.priceCzk} Kč</TableCell>
              <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                {timeAgo(order.updatedAt ?? order.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Couriers table
// ---------------------------------------------------------------------------

function CouriersTable({ couriers, orders, courierLocations }: {
  couriers: LiveCourier[];
  orders: LiveOrder[];
  courierLocations: Map<string, CourierLocation>;
}) {
  // Build courier → active order lookup
  const courierOrderMap = new Map<string, LiveOrder>();
  for (const o of orders) {
    if (o.courierId && ACTIVE_STATUSES.has(o.status)) {
      courierOrderMap.set(o.courierId, o);
    }
  }

  const sorted = [...couriers].sort((a, b) => {
    const rankA = a.onlineStatus === "online" ? 0 : a.onlineStatus === "busy" ? 1 : 2;
    const rankB = b.onlineStatus === "online" ? 0 : b.onlineStatus === "busy" ? 1 : 2;
    return rankA - rankB;
  });

  if (sorted.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">No couriers registered</div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map(courier => {
        const activeOrder = courierOrderMap.get(courier.id);
        const loc = courierLocations.get(courier.id);
        const locAge = loc ? Math.floor((Date.now() - new Date(loc.updatedAt).getTime()) / 1000) : null;
        const isLocFresh = locAge !== null && locAge < 60;

        return (
          <div
            key={courier.id}
            className={`p-3 rounded-lg border transition-colors
              ${courier.onlineStatus !== "offline"
                ? "bg-card border-border/50 hover:bg-muted/20"
                : "bg-muted/30 border-border/30 opacity-60"}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold
                  ${courier.onlineStatus !== "offline" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {courier.name?.charAt(0).toUpperCase() ?? <User className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-none truncate">{courier.name ?? "Unknown"}</p>
                  {courier.vehicleType && (
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                      {courier.vehicleType}{courier.licensePlate ? ` · ${courier.licensePlate}` : ""}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3 shrink-0">
                {activeOrder && (
                  <span className="text-xs text-blue-600 font-medium bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md whitespace-nowrap">
                    #{activeOrder.id.slice(0, 6)} · {ORDER_STATUS_CONFIG[activeOrder.status]?.label ?? activeOrder.status}
                  </span>
                )}
                <CourierStatusBadge status={courier.onlineStatus} />
              </div>
            </div>
            {isLocFresh && loc && (
              <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="font-mono">
                  {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                </span>
                {loc.speed != null && loc.speed > 0 && (
                  <span className="text-muted-foreground ml-1">
                    · {Math.round(loc.speed * 3.6)} km/h
                  </span>
                )}
                <span className="text-muted-foreground ml-auto">{locAge}s ago</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function Dispatcher() {
  const { wsState, orders, couriers, courierLocations, stats, lastEvent } = useAdminLive();

  const isBootstrapping = orders.length === 0 && couriers.length === 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Live Dispatch</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Real-time view of orders and couriers. Updates automatically.
          </p>
        </div>
        <div className="flex items-center gap-3 mt-1">
          {lastEvent && (
            <p className="text-xs text-muted-foreground hidden sm:block">
              Last event: <span className="font-medium">{lastEvent.type.replace(/_/g, " ")}</span>
              {" "}{timeAgo(lastEvent.at)}
            </p>
          )}
          <ConnectionIndicator state={wsState} />
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Online Couriers"
          value={stats.onlineCouriers}
          icon={Truck}
          sub={`${couriers.length} total registered`}
          highlight={stats.onlineCouriers > 0}
          pulse={stats.onlineCouriers > 0}
        />
        <StatCard
          title="Waiting for Courier"
          value={stats.waitingOrders}
          icon={Clock}
          sub="Searching for assignment"
          highlight={stats.waitingOrders > 0}
          pulse={stats.waitingOrders > 0}
        />
        <StatCard
          title="Active Deliveries"
          value={stats.activeDeliveries}
          icon={Package}
          sub="In progress right now"
          highlight={stats.activeDeliveries > 0}
        />
        <StatCard
          title="Delivered Today"
          value={stats.deliveredToday}
          icon={CheckCircle}
          sub={stats.cancelledTotal > 0 ? `${stats.cancelledTotal} cancelled` : ""}
        />
      </div>

      {/* Main content: orders + couriers */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Orders — 2/3 width */}
        <Card className="xl:col-span-2 shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Live Orders</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Active orders first · newest last</p>
              </div>
              <Badge variant="outline" className="text-xs font-mono">{orders.length} total</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isBootstrapping ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <OrdersTable orders={orders} />
            )}
          </CardContent>
        </Card>

        {/* Couriers — 1/3 width */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Couriers</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Online / Busy first</p>
              </div>
              <Badge variant="outline" className="text-xs font-mono">{stats.onlineCouriers} online</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {isBootstrapping ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            ) : (
              <CouriersTable couriers={couriers} orders={orders} courierLocations={courierLocations} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
