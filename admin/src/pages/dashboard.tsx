import React from "react";
import { useGetAdminDashboard } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Truck, Package, Clock, Activity, ShieldCheck, MapPin, RefreshCw, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

export function Dashboard() {
  const { data: stats, isLoading, error, refetch, isFetching } = useGetAdminDashboard({
    query: { refetchInterval: 30000 }
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !stats) {
    const errMsg = (error as any)?.data?.error || (error as any)?.message || "Could not reach the API server.";
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
        <div className="h-14 w-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-destructive">Failed to load dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">{errMsg}</p>
        </div>
        <Button onClick={() => refetch()} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Status</h1>
          <p className="text-muted-foreground mt-1">Live operational overview of the AIST delivery network.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2 text-muted-foreground"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Orders"
          value={stats.activeOrders}
          icon={Activity}
          trend={`${stats.searchingOrders} searching`}
          highlight
        />
        <StatCard
          title="Online Couriers"
          value={stats.onlineCouriers}
          icon={Truck}
          trend={`Out of ${stats.totalCouriers} total`}
        />
        <StatCard
          title="Total Orders"
          value={stats.totalOrders}
          icon={Package}
          trend={`${stats.deliveredOrders} delivered`}
        />
        <StatCard
          title="Total Users"
          value={stats.totalUsers}
          icon={Users}
          trend={`${stats.totalCustomers} customers, ${stats.totalAdmins} admins`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 shadow-sm border-border/50">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Live Orders</CardTitle>
              <p className="text-sm text-muted-foreground">Most recently updated deliveries</p>
            </div>
            <Link href="/orders" className="text-sm font-medium text-primary hover:underline">
              View All
            </Link>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border border-border/40">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.recentOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No orders yet
                      </TableCell>
                    </TableRow>
                  ) : stats.recentOrders.map(order => (
                    <TableRow key={order.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-muted-foreground">{order.id.slice(0, 8)}</TableCell>
                      <TableCell><OrderStatusBadge status={order.status} /></TableCell>
                      <TableCell className="capitalize">{order.category}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{order.pickupAddress.label} → {order.deliveryAddress.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{order.priceCzk} Kč</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Recent Users</CardTitle>
            <p className="text-sm text-muted-foreground">New signups</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentUsers.length === 0 ? (
                <p className="text-sm text-center py-4 text-muted-foreground">No users yet</p>
              ) : stats.recentUsers.map(user => (
                <div key={user.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                      {user.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-none">{user.name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground mt-1 truncate max-w-[120px]">{user.email}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize text-[10px] px-1.5 py-0.5">{user.role}</Badge>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-4 border-t border-border/40">
              <Link href="/users" className="text-sm font-medium text-primary hover:underline block text-center w-full">
                Manage Directory
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, trend, highlight = false }: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={`shadow-sm overflow-hidden ${highlight ? 'border-primary/30 ring-1 ring-primary/20' : 'border-border/50'}`}>
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
          </div>
          <div className={`p-2.5 rounded-lg ${highlight ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {trend && (
          <div className="mt-4 flex items-center text-xs text-muted-foreground">
            {highlight ? <Clock className="mr-1 h-3 w-3" /> : <ShieldCheck className="mr-1 h-3 w-3" />}
            {trend}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string, classes: string }> = {
    searching: { label: "Searching", classes: "bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 border-amber-500/20" },
    assigned: { label: "Assigned", classes: "bg-blue-500/15 text-blue-600 hover:bg-blue-500/25 border-blue-500/20" },
    courier_arrived: { label: "Arrived", classes: "bg-indigo-500/15 text-indigo-600 hover:bg-indigo-500/25 border-indigo-500/20" },
    picked_up: { label: "In Transit", classes: "bg-violet-500/15 text-violet-600 hover:bg-violet-500/25 border-violet-500/20" },
    delivered: { label: "Delivered", classes: "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border-emerald-500/20" },
    cancelled: { label: "Cancelled", classes: "bg-rose-500/15 text-rose-600 hover:bg-rose-500/25 border-rose-500/20" },
  };

  const config = map[status] || { label: status, classes: "bg-gray-100 text-gray-800" };

  return (
    <Badge variant="outline" className={`font-medium whitespace-nowrap ${config.classes}`}>
      {config.label}
    </Badge>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-5 w-72" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="col-span-1 lg:col-span-2 h-[400px] w-full rounded-xl" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    </div>
  );
}
