import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

import { Login } from "@/pages/login";
import { Dashboard } from "@/pages/dashboard";
import { Dispatcher } from "@/pages/dispatcher";
import { Users } from "@/pages/users";
import { Couriers } from "@/pages/couriers";
import { Orders } from "@/pages/orders";
import { Pricing } from "@/pages/pricing";
import { Promos } from "@/pages/promos";
import RefundsPage from "@/pages/refunds";
import CouponsAdminPage from "@/pages/coupons-admin";
import InvoicesAdminPage from "@/pages/invoices-admin";
import PayoutsAdminPage from "@/pages/payouts-admin";
import SystemAdminPage from "@/pages/system-admin";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base="/admin">
          <Switch>
            <Route path="/login" component={Login} />
            <Route path="/">
              <Redirect to="/dispatcher" />
            </Route>
            <Route path="/dashboard">
              {() => <Layout><Dashboard /></Layout>}
            </Route>
            <Route path="/dispatcher">
              {() => <Layout><Dispatcher /></Layout>}
            </Route>
            <Route path="/users">
              {() => <Layout><Users /></Layout>}
            </Route>
            <Route path="/couriers">
              {() => <Layout><Couriers /></Layout>}
            </Route>
            <Route path="/orders">
              {() => <Layout><Orders /></Layout>}
            </Route>
            <Route path="/orders/:id">
              {() => <Layout><Orders /></Layout>}
            </Route>
            <Route path="/pricing">
              {() => <Layout><Pricing /></Layout>}
            </Route>
            <Route path="/promos">
              {() => <Layout><Promos /></Layout>}
            </Route>
            <Route path="/refunds">
              {() => <Layout><RefundsPage /></Layout>}
            </Route>
            <Route path="/coupons-admin">
              {() => <Layout><CouponsAdminPage /></Layout>}
            </Route>
            <Route path="/invoices-admin">
              {() => <Layout><InvoicesAdminPage /></Layout>}
            </Route>
            <Route path="/payouts-admin">
              {() => <Layout><PayoutsAdminPage /></Layout>}
            </Route>
            <Route path="/system-admin">
              {() => <Layout><SystemAdminPage /></Layout>}
            </Route>
            <Route component={NotFound} />
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
