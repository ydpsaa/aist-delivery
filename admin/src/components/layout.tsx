import React, { useEffect } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { isAdmin, clearAuthToken } from "@/lib/auth";
import { adminWS } from "@/lib/adminWS";
import {
  LayoutDashboard,
  Users,
  Truck,
  Package,
  LogOut,
  Radio,
  DollarSign,
  Tag,
  RotateCcw,
  Ticket,
  FileText,
  Banknote,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/dispatcher", label: "Live Dispatch", icon: Radio },
  { href: "/dashboard",  label: "Dashboard",    icon: LayoutDashboard },
  { href: "/users",      label: "Users",        icon: Users },
  { href: "/couriers",   label: "Couriers",     icon: Truck },
  { href: "/orders",     label: "Orders",       icon: Package },
  { href: "/pricing",    label: "Pricing",      icon: DollarSign },
  { href: "/promos",     label: "Promo Codes",  icon: Tag },
  { href: "/refunds",    label: "Refunds",      icon: RotateCcw,   group: "finops" },
  { href: "/coupons-admin", label: "Coupons",   icon: Ticket,      group: "finops" },
  { href: "/invoices-admin", label: "Invoices", icon: FileText,    group: "finops" },
  { href: "/payouts-admin",  label: "Payouts",  icon: Banknote,    group: "finops" },
  { href: "/system-admin",   label: "System",   icon: ShieldCheck, group: "system" },
];

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isAdmin()) {
      setLocation("/login");
    }
  }, [location, setLocation]);

  // Start the shared admin WS when the layout mounts (after auth confirmed)
  useEffect(() => {
    if (!isAdmin()) return;
    adminWS.connect();
    return () => {
      // Keep WS alive while navigating between pages;
      // disconnect only when the user logs out (clearAuthToken + setLocation)
    };
  }, []);

  const handleLogout = () => {
    adminWS.disconnect();
    clearAuthToken();
    setLocation("/login");
  };

  if (!isAdmin()) return null;

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground font-sans">
      <aside className="w-64 border-r bg-sidebar text-sidebar-foreground flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <div className="h-8 w-8 rounded-lg overflow-hidden flex-shrink-0 border border-primary/20 bg-primary/10">
              <img src="/aist-logo.png" alt="AIST" className="w-full h-full object-cover" />
            </div>
            <span className="text-primary">AIST</span>
            <span className="text-muted-foreground font-normal text-sm">Dispatch</span>
          </div>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item, idx) => {
            const isActive = location === item.href || location.startsWith(item.href + "/");
            const prevItem = navItems[idx - 1];
            const showFinopsDivider = item.group === "finops" && (!prevItem || prevItem.group !== "finops");
            const showSystemDivider = item.group === "system" && (!prevItem || prevItem.group !== "system");
            return (
              <React.Fragment key={item.href}>
                {showFinopsDivider && (
                  <div className="px-3 pt-3 pb-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">FinOps</div>
                  </div>
                )}
                {showSystemDivider && (
                  <div className="px-3 pt-3 pb-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">System</div>
                  </div>
                )}
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                  {item.href === "/dispatcher" && (
                    <span className={cn(
                      "ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-primary/10 text-primary"
                    )}>
                      LIVE
                    </span>
                  )}
                </Link>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm font-medium text-sidebar-foreground/80 hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-16 flex items-center justify-between px-6 border-b bg-card md:hidden">
          <div className="font-bold text-lg text-primary flex items-center gap-2">
            <div className="h-7 w-7 rounded-md overflow-hidden border border-primary/20 bg-primary/10">
              <img src="/aist-logo.png" alt="AIST" className="w-full h-full object-cover" />
            </div>
            AIST
          </div>
          <button onClick={handleLogout} className="text-muted-foreground hover:text-destructive p-2">
            <LogOut className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-6 md:p-8 bg-muted/30">
          <div className="max-w-7xl mx-auto w-full h-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
