import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { StatTile, Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import type {
  Order,
  Claim,
  Alert,
  User,
  VendorInventoryItem,
  CustomerVendorLink,
  CustomerInventoryItem,
} from "../lib/types";

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "admin") return <AdminDashboard />;
  if (user.role === "vendor") return <VendorDashboard />;
  return <CustomerDashboard />;
}

function AdminDashboard() {
  const { show } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [o, c, u, a] = await Promise.all([
          api.get<Order[]>("/api/orders"),
          api.get<Claim[]>("/api/claims"),
          api.get<User[]>("/api/users"),
          api.get<Alert[]>("/api/alerts"),
        ]);
        setOrders(o);
        setClaims(c);
        setUsers(u);
        setAlerts(a);
      } catch (err) {
        show("error", err instanceof ApiError ? err.message : "Failed to load dashboard");
      }
    })();
  }, [show]);

  const vendors = users.filter((u) => u.role === "vendor").length;
  const customers = users.filter((u) => u.role === "customer").length;
  const ordersBy = (s: string) => orders.filter((o) => o.status === s).length;
  const claimsBy = (s: string) => claims.filter((c) => c.status === s).length;
  const openAlerts = alerts.filter((a) => a.status === "unread").length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Admin Dashboard" subtitle="Platform-wide overview." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        <StatTile label="Vendors" value={vendors} icon="🏭" />
        <StatTile label="Customers" value={customers} icon="🏢" />
        <StatTile label="Total Orders" value={orders.length} icon="🧾" />
        <StatTile label="Open Alerts" value={openAlerts} icon="🚨" accent="text-amber-600 dark:text-amber-400" iconBg="bg-amber-500/10 text-amber-500" />
        <StatTile label="Orders Requested" value={ordersBy("requested")} icon="⏳" />
        <StatTile label="Orders Delivered" value={ordersBy("delivered")} icon="✅" accent="text-emerald-600 dark:text-emerald-400" iconBg="bg-emerald-500/10 text-emerald-500" />
        <StatTile label="Claims Pending" value={claimsBy("pending")} icon="📋" />
        <StatTile label="Claims Approved" value={claimsBy("approved")} icon="👍" accent="text-emerald-600 dark:text-emerald-400" iconBg="bg-emerald-500/10 text-emerald-500" />
      </div>
    </div>
  );
}

function VendorDashboard() {
  const { user } = useAuth();
  const { show } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [links, setLinks] = useState<CustomerVendorLink[]>([]);
  const [inv, setInv] = useState<VendorInventoryItem[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [o, c, l, i] = await Promise.all([
          api.get<Order[]>("/api/orders"),
          api.get<Claim[]>("/api/claims"),
          api.get<CustomerVendorLink[]>("/api/links"),
          api.get<VendorInventoryItem[]>("/api/vendor_inventory"),
        ]);
        setOrders(o);
        setClaims(c);
        setLinks(l);
        setInv(i);
      } catch (err) {
        show("error", err instanceof ApiError ? err.message : "Failed to load dashboard");
      }
    })();
  }, [show]);

  const pendingOrders = orders.filter((o) => o.status === "requested").length;
  const pendingClaims = claims.filter((c) => c.status === "pending").length;
  const myCustomers = new Set(links.map((l) => l.customer_username)).size;
  const lowStock = inv.filter((i) => i.qty_on_hand <= i.reorder_threshold).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`Welcome, ${user?.display_name}`} subtitle="Your vendor operations at a glance." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Pending Orders" value={pendingOrders} icon="⏳" accent="text-amber-600 dark:text-amber-400" iconBg="bg-amber-500/10 text-amber-500" />
        <StatTile label="Pending Claims" value={pendingClaims} icon="📋" accent="text-amber-600 dark:text-amber-400" iconBg="bg-amber-500/10 text-amber-500" />
        <StatTile label="My Customers" value={myCustomers} icon="🏢" />
        <StatTile label="Low Stock Items" value={lowStock} icon="📦" accent={lowStock ? "text-red-600 dark:text-red-400" : undefined} iconBg="bg-red-500/10 text-red-500" />
      </div>
    </div>
  );
}

function CustomerDashboard() {
  const { user } = useAuth();
  const { show } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [links, setLinks] = useState<CustomerVendorLink[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [inv, setInv] = useState<CustomerInventoryItem[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [o, c, l, a, i] = await Promise.all([
          api.get<Order[]>("/api/orders"),
          api.get<Claim[]>("/api/claims"),
          api.get<CustomerVendorLink[]>("/api/links"),
          api.get<Alert[]>("/api/alerts"),
          api.get<CustomerInventoryItem[]>("/api/customer_inventory"),
        ]);
        setOrders(o);
        setClaims(c);
        setLinks(l);
        setAlerts(a);
        setInv(i);
      } catch (err) {
        show("error", err instanceof ApiError ? err.message : "Failed to load dashboard");
      }
    })();
  }, [show]);

  const ordersBy = (s: string) => orders.filter((o) => o.status === s).length;
  const claimsBy = (s: string) => claims.filter((c) => c.status === s).length;
  const vendors = new Set(links.map((l) => l.vendor_username)).size;
  const recentAlerts = [...alerts]
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`Welcome, ${user?.display_name}`} subtitle="Your orders, claims and vendors." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Orders Requested" value={ordersBy("requested")} icon="⏳" />
        <StatTile label="Orders Delivered" value={ordersBy("delivered")} icon="✅" accent="text-emerald-600 dark:text-emerald-400" iconBg="bg-emerald-500/10 text-emerald-500" />
        <StatTile label="Claims Pending" value={claimsBy("pending")} icon="📋" />
        <StatTile label="Vendors" value={vendors} icon="🏭" />
        <StatTile label="Items in Inventory" value={inv.length} icon="📦" />
        <StatTile label="Claims Approved" value={claimsBy("approved")} icon="👍" accent="text-emerald-600 dark:text-emerald-400" iconBg="bg-emerald-500/10 text-emerald-500" />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Recent Alerts</h2>
        {recentAlerts.length === 0 ? (
          <p className="text-sm text-slate-400">No alerts yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {recentAlerts.map((a) => (
              <Card key={a.id} className="p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{a.title}</span>
                  {a.status === "unread" && <Badge tone="blue" dot>new</Badge>}
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{a.message}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
