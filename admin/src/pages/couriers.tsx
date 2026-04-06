import React, { useState } from "react";
import {
  useGetAdminCouriers,
  useUpdateCourierProfile,
  getGetAdminCouriersQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Truck, Navigation, CheckCircle2, XCircle, Clock, Edit2, RefreshCw, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export function Couriers() {
  const { data, isLoading, error, refetch, isFetching } = useGetAdminCouriers();
  const [editingCourier, setEditingCourier] = useState<any>(null);

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fleet Management</h1>
          <p className="text-muted-foreground mt-1">Monitor active couriers and manage vehicle profiles.</p>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
        <div className="bg-card border rounded-lg p-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Total Fleet</p>
            <p className="text-2xl font-bold">{data?.couriers.length ?? 0}</p>
          </div>
          <div className="p-2 bg-primary/10 rounded-md text-primary"><Truck className="h-5 w-5" /></div>
        </div>
        <div className="bg-card border rounded-lg p-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Online Now</p>
            <p className="text-2xl font-bold">{data?.couriers.filter(c => c.onlineStatus === 'online').length ?? 0}</p>
          </div>
          <div className="p-2 bg-emerald-500/10 rounded-md text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div>
        </div>
        <div className="bg-card border rounded-lg p-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Busy / On Delivery</p>
            <p className="text-2xl font-bold">{data?.couriers.filter(c => c.onlineStatus === 'busy').length ?? 0}</p>
          </div>
          <div className="p-2 bg-amber-500/10 rounded-md text-amber-600"><Clock className="h-5 w-5" /></div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">Failed to load couriers</p>
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
                <TableHead>Courier</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-10 w-[200px]" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[150px]" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[120px]" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : !error && data?.couriers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Navigation className="h-8 w-8 text-muted-foreground/50" />
                      <p>No couriers in the system yet</p>
                      <p className="text-xs">Promote a user to courier role from the Users page.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data?.couriers.map((courier) => (
                  <TableRow key={courier.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {courier.name?.charAt(0).toUpperCase() || courier.email?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">{courier.name || "Unknown"}</span>
                          <span className="text-xs text-muted-foreground font-mono">{courier.id.slice(0, 8)}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm truncate max-w-[200px]">{courier.email || "No email"}</span>
                        <span className="text-xs text-muted-foreground">{courier.phone || "No phone"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm capitalize font-medium">{courier.vehicleType || "Not set"}</span>
                        {courier.vehiclePlate && (
                          <Badge variant="outline" className="font-mono text-[10px] w-fit mt-1 px-1.5 py-0">
                            {courier.vehiclePlate}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={courier.onlineStatus || "offline"} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setEditingCourier(courier)} title="Edit profile">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {data && (
          <div className="border-t px-4 py-2 bg-muted/20 text-xs text-muted-foreground">
            {data.couriers.length} {data.couriers.length === 1 ? "courier" : "couriers"} in fleet
          </div>
        )}
      </div>

      <EditCourierModal
        courier={editingCourier}
        open={!!editingCourier}
        onOpenChange={(open) => !open && setEditingCourier(null)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'online') return (
    <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border-emerald-500/20">
      <CheckCircle2 className="mr-1 h-3 w-3" /> Online
    </Badge>
  );
  if (status === 'busy') return (
    <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 border-amber-500/20">
      <Clock className="mr-1 h-3 w-3" /> Busy
    </Badge>
  );
  return (
    <Badge className="bg-zinc-500/15 text-zinc-500 hover:bg-zinc-500/25 border-zinc-500/20">
      <XCircle className="mr-1 h-3 w-3" /> Offline
    </Badge>
  );
}

function EditCourierModal({ courier, open, onOpenChange }: {
  courier: any;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [vehicleType, setVehicleType] = useState<string>("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [onlineStatus, setOnlineStatus] = useState<string>("");

  React.useEffect(() => {
    if (courier) {
      setVehicleType(courier.vehicleType || "bike");
      setVehiclePlate(courier.vehiclePlate || "");
      setOnlineStatus(courier.onlineStatus || "offline");
    }
  }, [courier]);

  const updateMutation = useUpdateCourierProfile({
    mutation: {
      onSuccess: () => {
        toast({ title: "Profile updated", description: "Courier profile saved successfully." });
        queryClient.invalidateQueries({ queryKey: getGetAdminCouriersQueryKey() });
        onOpenChange(false);
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: (err as any)?.data?.error || "Could not save the courier profile."
        });
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courier) return;
    updateMutation.mutate({
      userId: courier.id,
      data: { vehicleType, vehiclePlate: vehiclePlate || undefined, onlineStatus }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Courier Profile</DialogTitle>
            <DialogDescription>
              Update operational details for <strong>{courier?.name || courier?.email}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Online Status</Label>
              <Select value={onlineStatus} onValueChange={setOnlineStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online (Available)</SelectItem>
                  <SelectItem value="busy">Busy (On Delivery)</SelectItem>
                  <SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Vehicle Type</Label>
              <Select value={vehicleType} onValueChange={setVehicleType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bike">Bicycle</SelectItem>
                  <SelectItem value="scooter">Scooter / Moped</SelectItem>
                  <SelectItem value="car">Car</SelectItem>
                  <SelectItem value="van">Van / Cargo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>License Plate <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
                placeholder="e.g. 1A2 3456"
                className="font-mono"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={updateMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              ) : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
