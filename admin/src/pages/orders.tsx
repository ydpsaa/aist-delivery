import React, { useState } from "react";
import {
  useGetAdminOrders,
  useGetAdminOrder,
  getGetAdminOrderQueryKey
} from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderStatusBadge } from "@/pages/dashboard";
import { MapPin, Filter, X, Clock, CalendarDays, RefreshCw, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useRoute, useLocation } from "wouter";

export function Orders() {
  const [, params] = useRoute("/orders/:id");
  const [, setLocation] = useLocation();
  const selectedOrderId = params?.id;

  const [status, setStatus] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");

  const queryParams = {
    ...(status !== "all" && { status }),
    ...(category !== "all" && { category }),
    limit: 50
  };

  const { data, isLoading, error, refetch, isFetching } = useGetAdminOrders(queryParams);

  const clearFilters = () => {
    setStatus("all");
    setCategory("all");
  };

  const hasActiveFilters = status !== "all" || category !== "all";

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Order Log</h1>
          <p className="text-muted-foreground mt-1">Real-time overview of all delivery operations.</p>
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

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-2 rounded-lg border shadow-sm">
        <div className="flex items-center gap-4 flex-1 w-full overflow-x-auto">
          <div className="flex items-center gap-2 px-2 text-muted-foreground font-medium text-sm shrink-0">
            <Filter className="h-4 w-4" /> Filters:
          </div>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[160px] h-9 shrink-0">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="searching">Searching</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="courier_arrived">Courier Arrived</SelectItem>
              <SelectItem value="picked_up">In Transit</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[140px] h-9 shrink-0">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="flash">Flash (15m)</SelectItem>
              <SelectItem value="window">Window (2h)</SelectItem>
              <SelectItem value="buy">Buy & Deliver</SelectItem>
              <SelectItem value="cargo">Heavy Cargo</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2 text-muted-foreground">
              <X className="h-4 w-4 mr-1" /> Clear filters
            </Button>
          )}
        </div>

        <div className="text-sm font-medium text-muted-foreground px-4 shrink-0">
          {isLoading ? "Loading..." : `${data?.total ?? 0} total · ${data?.orders.length ?? 0} shown`}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">Failed to load orders</p>
            <p className="text-xs text-destructive/80 mt-0.5">
              {(error as any)?.data?.error || (error as any)?.message || "An unexpected error occurred."}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="shrink-0 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}

      <div className="flex-1 bg-card rounded-md border shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-sm">
              <TableRow>
                <TableHead className="w-[100px]">ID</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="max-w-[200px]">Route</TableHead>
                <TableHead>Courier</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-6 w-full max-w-[120px]" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !error && data?.orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <MapPin className="h-8 w-8 text-muted-foreground/50" />
                      <p>{hasActiveFilters ? "No orders match your filters." : "No orders in the system yet."}</p>
                      {hasActiveFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="text-primary">
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data?.orders.map((order) => (
                  <TableRow
                    key={order.id}
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/orders/${order.id}`)}
                  >
                    <TableCell className="font-mono text-xs font-medium text-muted-foreground">{order.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      <span className="text-xs text-muted-foreground block">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize text-[10px] py-0">{order.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-muted-foreground truncate">
                          <div className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                          <span className="truncate">{order.pickupAddress.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-medium truncate">
                          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                          <span className="truncate">{order.deliveryAddress.label}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {order.courierName ? (
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                            {order.courierName.charAt(0)}
                          </div>
                          <span className="truncate max-w-[100px]">{order.courierName}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{order.priceCzk} Kč</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <OrderDetailModal
        id={selectedOrderId}
        open={!!selectedOrderId}
        onOpenChange={(open) => !open && setLocation("/orders")}
      />
    </div>
  );
}

function OrderDetailModal({ id, open, onOpenChange }: {
  id?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data, isLoading, error } = useGetAdminOrder(id ?? "", {
    query: {
      enabled: !!id,
      queryKey: getGetAdminOrderQueryKey(id ?? "")
    }
  });

  const order = data?.order;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden gap-0">
        {isLoading ? (
          <div className="p-8 space-y-4">
            <Skeleton className="h-8 w-[200px]" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : error ? (
          <div className="p-8 flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="font-medium">Failed to load order details</p>
            <p className="text-sm text-muted-foreground">
              {(error as any)?.data?.error || "Could not retrieve this order."}
            </p>
          </div>
        ) : !order ? null : (
          <>
            <DialogHeader className="p-6 bg-muted/30 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-xl flex items-center gap-2">
                    Order Details
                    <span className="text-muted-foreground font-mono text-sm">#{order.id.slice(0, 8)}</span>
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                    <CalendarDays className="h-3 w-3" />
                    {new Date(order.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <OrderStatusBadge status={order.status} />
                  <span className="font-bold text-xl text-primary">{order.priceCzk} Kč</span>
                </div>
              </div>
            </DialogHeader>

            <div className="p-6 overflow-y-auto max-h-[70vh] space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card className="shadow-none border-border/50 bg-muted/10">
                  <CardContent className="p-4">
                    <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Customer</h3>
                    <p className="font-medium">{order.customerName || "Unknown"}</p>
                    <p className="text-sm text-muted-foreground">{order.customerEmail || "No email"}</p>
                  </CardContent>
                </Card>
                <Card className="shadow-none border-border/50 bg-muted/10">
                  <CardContent className="p-4">
                    <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Courier</h3>
                    {order.courierId ? (
                      <>
                        <p className="font-medium">{order.courierName || "Unknown Courier"}</p>
                        <p className="text-sm text-muted-foreground">{order.courierEmail || "No email"}</p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground italic flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" /> Waiting for assignment
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="relative border rounded-lg overflow-hidden">
                <div className="absolute left-[27px] top-[40px] bottom-[40px] w-px bg-border z-0" />

                <div className="p-4 flex gap-4 relative z-10 bg-card hover:bg-muted/20 transition-colors">
                  <div className="mt-1 h-6 w-6 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0 shadow-sm border border-blue-500/20">
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                  </div>
                  <div>
                    <Badge variant="outline" className="mb-1 text-[10px] font-semibold text-blue-600 border-blue-500/20 bg-blue-500/5">Pickup</Badge>
                    <p className="font-medium">{order.pickupAddress.address}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {order.pickupAddress.contactName} · {order.pickupAddress.contactPhone}
                    </p>
                  </div>
                </div>

                <div className="border-t" />

                <div className="p-4 flex gap-4 relative z-10 bg-card hover:bg-muted/20 transition-colors">
                  <div className="mt-1 h-6 w-6 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 shadow-sm border border-emerald-500/20">
                    <MapPin className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <Badge variant="outline" className="mb-1 text-[10px] font-semibold text-emerald-600 border-emerald-500/20 bg-emerald-500/5">Dropoff</Badge>
                    <p className="font-medium">{order.deliveryAddress.address}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {order.deliveryAddress.contactName} · {order.deliveryAddress.contactPhone}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/30 p-3 rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">Category</p>
                  <p className="font-medium capitalize">{order.category}</p>
                </div>
                <div className="bg-muted/30 p-3 rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">Distance</p>
                  <p className="font-medium">{order.distanceKm ? `${order.distanceKm} km` : "—"}</p>
                </div>
                <div className="bg-muted/30 p-3 rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">Est. Time</p>
                  <p className="font-medium">{order.estimatedMinutes ? `${order.estimatedMinutes} min` : "—"}</p>
                </div>
              </div>

              {order.description && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Notes</h4>
                  <div className="bg-muted/30 p-3 rounded-md text-sm border border-border/50">
                    {order.description}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-6 text-xs text-muted-foreground pt-2 border-t border-border/40">
                <span>Created: {new Date(order.createdAt).toLocaleString()}</span>
                <span>Updated: {new Date(order.updatedAt).toLocaleString()}</span>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
