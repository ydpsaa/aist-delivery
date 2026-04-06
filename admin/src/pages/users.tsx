import React, { useState } from "react";
import {
  useGetAdminUsers,
  useUpdateUserRole,
  getGetAdminUsersQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, UserCog, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export function Users() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [role, setRole] = useState<string>("all");

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryParams = {
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(role !== "all" && { role })
  };

  const { data, isLoading, error, refetch, isFetching } = useGetAdminUsers(queryParams);

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Directory</h1>
          <p className="text-muted-foreground mt-1">Manage platform users, roles, and access levels.</p>
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

      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            className="pl-9 w-full bg-card"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="bg-card">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="customer">Customers</SelectItem>
              <SelectItem value="courier">Couriers</SelectItem>
              <SelectItem value="admin">Administrators</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">Failed to load users</p>
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
                <TableHead>User Details</TableHead>
                <TableHead>Contact Info</TableHead>
                <TableHead>Registration</TableHead>
                <TableHead className="w-[200px]">System Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-10 w-[200px]" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[150px]" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-[100px]" /></TableCell>
                    <TableCell><Skeleton className="h-10 w-[150px]" /></TableCell>
                  </TableRow>
                ))
              ) : !error && data?.users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <UserCog className="h-8 w-8 text-muted-foreground/50" />
                      <p>No users found matching your criteria</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data?.users.map((user) => (
                  <TableRow key={user.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {user.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">{user.name || "Unknown"}</span>
                          <span className="text-xs text-muted-foreground font-mono">{user.id.slice(0, 8)}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm truncate max-w-[200px]">{user.email || "No email"}</span>
                        <span className="text-xs text-muted-foreground">{user.phone || "No phone"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Unknown"}
                    </TableCell>
                    <TableCell>
                      <RoleSelect userId={user.id} currentRole={user.role} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {data && (
          <div className="border-t px-4 py-2 bg-muted/20 text-xs text-muted-foreground">
            {data.users.length} {data.users.length === 1 ? "user" : "users"} shown
          </div>
        )}
      </div>
    </div>
  );
}

function RoleSelect({ userId, currentRole }: { userId: string; currentRole: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);

  const updateMutation = useUpdateUserRole({
    mutation: {
      onMutate: () => setUpdating(true),
      onSuccess: () => {
        toast({ title: "Role updated", description: "The user's role was changed successfully." });
        // Invalidate all user queries regardless of current filters
        queryClient.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() });
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Update failed",
          description: (err as any)?.data?.error || "An error occurred while changing the role."
        });
      },
      onSettled: () => setUpdating(false)
    }
  });

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'border-rose-500/20 text-rose-600 bg-rose-500/10';
      case 'courier': return 'border-amber-500/20 text-amber-600 bg-amber-500/10';
      default: return 'border-blue-500/20 text-blue-600 bg-blue-500/10';
    }
  };

  return (
    <Select
      value={currentRole}
      onValueChange={(val) => updateMutation.mutate({ id: userId, data: { role: val as "admin" | "courier" | "customer" } })}
      disabled={updating}
    >
      <SelectTrigger className={`w-[140px] h-8 text-xs font-semibold uppercase tracking-wider ${getRoleColor(currentRole)}`}>
        {updating ? (
          <div className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Saving...</div>
        ) : (
          <SelectValue placeholder="Select role" />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="customer">Customer</SelectItem>
        <SelectItem value="courier">Courier</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
      </SelectContent>
    </Select>
  );
}
