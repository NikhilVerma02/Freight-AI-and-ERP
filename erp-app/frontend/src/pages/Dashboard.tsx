import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { StatTile, Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { ENTITY_COLORS, STATUS_HEX } from "../lib/colors";
import { fadeUpItem, staggerContainer } from "../lib/motion";
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
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
    </motion.div>
  );
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
    >
      {React.Children.map(children, (child) => (
        <motion.div variants={fadeUpItem}>{child}</motion.div>
      ))}
    </motion.div>
  );
}

function breakdown(items: { status: string }[], colorMap: Record<string, string> = STATUS_HEX) {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.status, (counts.get(item.status) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([name, value]) => ({
    name,
    value,
    color: colorMap[name] || "#94a3b8",
  }));
}

function ChartCard({ title, children, kind }: { title: string; children: React.ReactNode; kind: keyof typeof ENTITY_COLORS }) {
  return (
    <motion.div variants={fadeUpItem}>
      <Card className={`border-l-4 ${ENTITY_COLORS[kind].bar} p-4`}>
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
        <div className="h-56">{children}</div>
      </Card>
    </motion.div>
  );
}

function StatusPie({ data }: { data: { name: string; value: number; color: string }[] }) {
  if (data.every((d) => d.value === 0)) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">No data yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function StatusBar({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
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
      <StatGrid>
        <StatTile label="Vendors" value={vendors} icon="🏭" kind="vendors" />
        <StatTile label="Customers" value={customers} icon="🏢" kind="customers" />
        <StatTile label="Total Orders" value={orders.length} icon="🧾" kind="orders" />
        <StatTile label="Open Alerts" value={openAlerts} icon="🚨" kind="alerts" />
        <StatTile label="Orders Requested" value={ordersBy("requested")} icon="⏳" kind="orders" />
        <StatTile label="Orders Delivered" value={ordersBy("delivered")} icon="✅" accent="text-emerald-600 dark:text-emerald-400" iconBg="bg-emerald-500/10 text-emerald-500" />
        <StatTile label="Claims Pending" value={claimsBy("pending")} icon="📋" kind="claims" />
        <StatTile label="Claims Approved" value={claimsBy("approved")} icon="👍" accent="text-emerald-600 dark:text-emerald-400" iconBg="bg-emerald-500/10 text-emerald-500" />
      </StatGrid>

      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Orders by Status" kind="orders">
          <StatusPie data={breakdown(orders)} />
        </ChartCard>
        <ChartCard title="Claims by Status" kind="claims">
          <StatusBar data={breakdown(claims)} />
        </ChartCard>
      </motion.div>
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

  const stockData = inv
    .slice()
    .sort((a, b) => a.qty_on_hand / Math.max(a.reorder_threshold, 1) - b.qty_on_hand / Math.max(b.reorder_threshold, 1))
    .slice(0, 6)
    .map((i) => ({
      name: i.sku,
      value: i.qty_on_hand,
      color: i.qty_on_hand <= i.reorder_threshold ? "#ef4444" : ENTITY_COLORS.inventory.hex,
    }));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={`Welcome, ${user?.display_name}`} subtitle="Your vendor operations at a glance." />
      <StatGrid>
        <StatTile label="Pending Orders" value={pendingOrders} icon="⏳" kind="orders" />
        <StatTile label="Pending Claims" value={pendingClaims} icon="📋" kind="claims" />
        <StatTile label="My Customers" value={myCustomers} icon="🏢" kind="customers" />
        <StatTile
          label="Low Stock Items"
          value={lowStock}
          icon="📦"
          accent={lowStock ? "text-red-600 dark:text-red-400" : undefined}
          iconBg="bg-red-500/10 text-red-500"
        />
      </StatGrid>

      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Orders by Status" kind="orders">
          <StatusPie data={breakdown(orders)} />
        </ChartCard>
        <ChartCard title="Inventory Levels (lowest stock ratio)" kind="inventory">
          <StatusBar data={stockData} />
        </ChartCard>
      </motion.div>
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
      <StatGrid>
        <StatTile label="Orders Requested" value={ordersBy("requested")} icon="⏳" kind="orders" />
        <StatTile label="Orders Delivered" value={ordersBy("delivered")} icon="✅" accent="text-emerald-600 dark:text-emerald-400" iconBg="bg-emerald-500/10 text-emerald-500" />
        <StatTile label="Claims Pending" value={claimsBy("pending")} icon="📋" kind="claims" />
        <StatTile label="Vendors" value={vendors} icon="🏭" kind="vendors" />
        <StatTile label="Items in Inventory" value={inv.length} icon="📦" kind="inventory" />
        <StatTile label="Claims Approved" value={claimsBy("approved")} icon="👍" accent="text-emerald-600 dark:text-emerald-400" iconBg="bg-emerald-500/10 text-emerald-500" />
      </StatGrid>

      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Orders by Status" kind="orders">
          <StatusPie data={breakdown(orders)} />
        </ChartCard>
        <ChartCard title="Claims by Status" kind="claims">
          <StatusBar data={breakdown(claims)} />
        </ChartCard>
      </motion.div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Recent Alerts</h2>
        {recentAlerts.length === 0 ? (
          <p className="text-sm text-slate-400">No alerts yet.</p>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
          >
            {recentAlerts.map((a) => (
              <motion.div key={a.id} variants={fadeUpItem}>
                <Card className={`border-l-4 ${ENTITY_COLORS.alerts.bar} p-3.5`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{a.title}</span>
                    {a.status === "unread" && <Badge tone="blue" dot>new</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{a.message}</p>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
