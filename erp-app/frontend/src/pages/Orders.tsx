import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Input, Select, TextArea } from "../components/ui/Input";
import { ENTITY_COLORS } from "../lib/colors";
import { fadeUpItem, staggerContainer } from "../lib/motion";
import type { Order, OrderItem, CustomerVendorLink, User } from "../lib/types";

function statusTone(s: string) {
  if (s === "delivered") return "green" as const;
  if (s === "undelivered") return "red" as const;
  return "blue" as const;
}

function OrderCard({
  order,
  children,
}: {
  order: Order;
  children?: React.ReactNode;
}) {
  return (
    <Card hoverable className={`flex flex-col gap-2 border-l-4 p-4 ${ENTITY_COLORS.orders.bar}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-900 dark:text-slate-100">{order.order_number}</span>
        <Badge tone={statusTone(order.status)} dot>
          {order.status}
        </Badge>
      </div>
      <div className="text-xs text-slate-500 dark:text-slate-400">
        {order.customer_username} → {order.vendor_username}
      </div>
      <ul className="mt-1 space-y-1 text-sm text-slate-700 dark:text-slate-300">
        {order.items.map((it, i) => (
          <li key={i} className="flex justify-between">
            <span>
              {it.item_name} <span className="text-slate-400">({it.sku})</span>
            </span>
            <span className="font-medium">×{it.qty}</span>
          </li>
        ))}
      </ul>
      {order.undelivered_reason && (
        <p className="text-xs text-red-600 dark:text-red-400">Reason: {order.undelivered_reason}</p>
      )}
      {(order.requested_at || order.created_at) && (
        <p className="text-[11px] text-slate-400">
          {new Date(order.requested_at || order.created_at!).toLocaleString()}
        </p>
      )}
      {children}
    </Card>
  );
}

export default function Orders() {
  const { user } = useAuth();
  const { show } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // customer-only: linked vendors for picker
  const [links, setLinks] = useState<CustomerVendorLink[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  // vendor-only: undelivered modal
  const [undeliverOrder, setUndeliverOrder] = useState<Order | null>(null);
  const [undeliverReason, setUndeliverReason] = useState("");

  // admin-only: filters
  const [vendorFilter, setVendorFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<Order[]>("/api/orders");
      setOrders(data);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (user?.role === "customer") {
      api.get<CustomerVendorLink[]>("/api/links").then(setLinks).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markDelivered(order: Order) {
    try {
      await api.put(`/api/orders/${order.id}/status`, { status: "delivered" });
      show("success", `${order.order_number} marked delivered`);
      load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to update order");
    }
  }

  async function submitUndelivered() {
    if (!undeliverOrder) return;
    try {
      await api.put(`/api/orders/${undeliverOrder.id}/status`, {
        status: "undelivered",
        undelivered_reason: undeliverReason,
      });
      show("success", `${undeliverOrder.order_number} marked undelivered`);
      setUndeliverOrder(null);
      setUndeliverReason("");
      load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to update order");
    }
  }

  const linkedVendors = useMemo(
    () => Array.from(new Set(links.map((l) => l.vendor_username))),
    [links]
  );

  const adminFiltered = useMemo(() => {
    return orders.filter(
      (o) =>
        (!vendorFilter || o.vendor_username === vendorFilter) &&
        (!customerFilter || o.customer_username === customerFilter)
    );
  }, [orders, vendorFilter, customerFilter]);

  const allVendors = useMemo(
    () => Array.from(new Set(orders.map((o) => o.vendor_username))),
    [orders]
  );
  const allCustomers = useMemo(
    () => Array.from(new Set(orders.map((o) => o.customer_username))),
    [orders]
  );

  const visible = user?.role === "admin" ? adminFiltered : orders;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Orders</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {user?.role === "customer"
              ? "Place and track your orders."
              : user?.role === "vendor"
              ? "Incoming orders — mark delivered or undelivered."
              : "All orders across the platform."}
          </p>
        </div>
        {user?.role === "customer" && (
          <Button onClick={() => setCreateOpen(true)}>+ New Order</Button>
        )}
      </div>

      {user?.role === "admin" && (
        <div className="flex gap-3">
          <Select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)} label="Vendor">
            <option value="">All vendors</option>
            {allVendors.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
          <Select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} label="Customer">
            <option value="">All customers</option>
            {allCustomers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-400">No orders yet.</p>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {visible.map((o) => (
            <motion.div key={o.id} variants={fadeUpItem}>
              <OrderCard order={o}>
                {user?.role === "vendor" && o.status === "requested" && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => markDelivered(o)}>
                      Delivered
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setUndeliverOrder(o)}>
                      Undelivered
                    </Button>
                  </div>
                )}
              </OrderCard>
            </motion.div>
          ))}
        </motion.div>
      )}

      {user?.role === "customer" && (
        <NewOrderModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          vendors={linkedVendors}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}

      <Modal
        open={!!undeliverOrder}
        onClose={() => setUndeliverOrder(null)}
        title={`Mark ${undeliverOrder?.order_number ?? ""} undelivered`}
      >
        <div className="flex flex-col gap-3">
          <TextArea
            label="Reason"
            rows={3}
            value={undeliverReason}
            onChange={(e) => setUndeliverReason(e.target.value)}
            placeholder="e.g. address unreachable, damaged in transit"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setUndeliverOrder(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={submitUndelivered}>
              Submit
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function NewOrderModal({
  open,
  onClose,
  vendors,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  vendors: string[];
  onCreated: () => void;
}) {
  const { show } = useToast();
  const [vendor, setVendor] = useState("");
  const [items, setItems] = useState<OrderItem[]>([{ sku: "", item_name: "", qty: 1 }]);
  const [submitting, setSubmitting] = useState(false);

  function setItem(idx: number, patch: Partial<OrderItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function submit() {
    if (!vendor) {
      show("error", "Pick a vendor");
      return;
    }
    const cleaned = items.filter((it) => it.sku && it.item_name && it.qty > 0);
    if (cleaned.length === 0) {
      show("error", "Add at least one item");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/orders", { vendor_username: vendor, items: cleaned });
      show("success", "Order created");
      setVendor("");
      setItems([{ sku: "", item_name: "", qty: 1 }]);
      onCreated();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Order">
      <div className="flex flex-col gap-3">
        <Select label="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)}>
          <option value="">Select a vendor…</option>
          {vendors.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
        {vendors.length === 0 && (
          <p className="text-xs text-amber-600">You are not linked to any vendors yet.</p>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Items</span>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <div className="col-span-4">
                <Input
                  placeholder="SKU"
                  value={it.sku}
                  onChange={(e) => setItem(i, { sku: e.target.value })}
                />
              </div>
              <div className="col-span-5">
                <Input
                  placeholder="Item name"
                  value={it.item_name}
                  onChange={(e) => setItem(i, { item_name: e.target.value })}
                />
              </div>
              <div className="col-span-3">
                <Input
                  type="number"
                  min={1}
                  placeholder="Qty"
                  value={it.qty}
                  onChange={(e) => setItem(i, { qty: parseInt(e.target.value || "0", 10) })}
                />
              </div>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setItems((p) => [...p, { sku: "", item_name: "", qty: 1 }])}
          >
            + Add item
          </Button>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Creating…" : "Create Order"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
