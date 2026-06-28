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
import type { Claim, Order } from "../lib/types";

function statusTone(s: string) {
  if (s === "approved") return "green" as const;
  if (s === "rejected") return "red" as const;
  return "yellow" as const;
}

export default function Claims() {
  const { user } = useAuth();
  const { show } = useToast();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // vendor reject modal
  const [rejectClaim, setRejectClaim] = useState<Claim | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [c, o] = await Promise.all([
        api.get<Claim[]>("/api/claims"),
        api.get<Order[]>("/api/orders"),
      ]);
      setClaims(c);
      setOrders(o);
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to load claims");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function approve(claim: Claim) {
    try {
      await api.put(`/api/claims/${claim.id}/decision`, { status: "approved" });
      show("success", `${claim.claim_number} approved`);
      load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to update claim");
    }
  }

  async function submitReject() {
    if (!rejectClaim) return;
    try {
      await api.put(`/api/claims/${rejectClaim.id}/decision`, {
        status: "rejected",
        decision_reason: rejectReason,
      });
      show("success", `${rejectClaim.claim_number} rejected`);
      setRejectClaim(null);
      setRejectReason("");
      load();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to update claim");
    }
  }

  // customer can only claim against their own delivered orders
  const deliveredOrders = useMemo(
    () => orders.filter((o) => o.status === "delivered"),
    [orders]
  );

  const orderNumberFor = (id: number) =>
    orders.find((o) => o.id === id)?.order_number ?? `#${id}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Claims</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {user?.role === "customer"
              ? "Raise and track claims against delivered orders."
              : user?.role === "vendor"
              ? "Incoming claims — approve or reject."
              : "All claims across the platform."}
          </p>
        </div>
        {user?.role === "customer" && (
          <Button onClick={() => setCreateOpen(true)}>+ New Claim</Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : claims.length === 0 ? (
        <p className="text-sm text-slate-400">No claims yet.</p>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {claims.map((c) => (
            <motion.div key={c.id} variants={fadeUpItem}>
              <Card hoverable className={`flex flex-col gap-2 border-l-4 p-4 ${ENTITY_COLORS.claims.bar}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{c.claim_number}</span>
                  <Badge tone={statusTone(c.status)} dot>
                    {c.status}
                  </Badge>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {c.customer_username} → {c.vendor_username} · {orderNumberFor(c.order_id)}
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {c.damage_type} · {c.sku} · ×{c.damaged_qty}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">{c.claim_text}</p>
                {c.decision_reason && (
                  <p className="text-xs text-red-600 dark:text-red-400">Reason: {c.decision_reason}</p>
                )}
                {c.created_at && (
                  <p className="text-[11px] text-slate-400">{new Date(c.created_at).toLocaleString()}</p>
                )}
                {user?.role === "vendor" && c.status === "pending" && (
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => approve(c)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setRejectClaim(c)}>
                      Reject
                    </Button>
                  </div>
                )}
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {user?.role === "customer" && (
        <NewClaimModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          orders={deliveredOrders}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}

      <Modal
        open={!!rejectClaim}
        onClose={() => setRejectClaim(null)}
        title={`Reject ${rejectClaim?.claim_number ?? ""}`}
      >
        <div className="flex flex-col gap-3">
          <TextArea
            label="Reason"
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Why is this claim rejected?"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejectClaim(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={submitReject}>
              Reject
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function NewClaimModal({
  open,
  onClose,
  orders,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  orders: Order[];
  onCreated: () => void;
}) {
  const { show } = useToast();
  const [orderId, setOrderId] = useState<number | "">("");
  const [sku, setSku] = useState("");
  const [damageType, setDamageType] = useState("");
  const [damagedQty, setDamagedQty] = useState(1);
  const [claimText, setClaimText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedOrder = orders.find((o) => o.id === orderId);

  async function submit() {
    if (!orderId) {
      show("error", "Pick an order");
      return;
    }
    if (!sku || !damageType || !claimText) {
      show("error", "Fill all fields");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/claims", {
        order_id: orderId,
        sku,
        damage_type: damageType,
        damaged_qty: damagedQty,
        claim_text: claimText,
      });
      show("success", "Claim filed");
      setOrderId("");
      setSku("");
      setDamageType("");
      setDamagedQty(1);
      setClaimText("");
      onCreated();
    } catch (err) {
      show("error", err instanceof ApiError ? err.message : "Failed to file claim");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Claim">
      <div className="flex flex-col gap-3">
        <Select
          label="Order (delivered only)"
          value={orderId}
          onChange={(e) => {
            const id = e.target.value ? parseInt(e.target.value, 10) : "";
            setOrderId(id);
            setSku("");
          }}
        >
          <option value="">Select an order…</option>
          {orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.order_number} ({o.vendor_username})
            </option>
          ))}
        </Select>
        {orders.length === 0 && (
          <p className="text-xs text-amber-600">No delivered orders to claim against yet.</p>
        )}

        {selectedOrder && (
          <Select label="SKU" value={sku} onChange={(e) => setSku(e.target.value)}>
            <option value="">Select a SKU…</option>
            {selectedOrder.items.map((it) => (
              <option key={it.sku} value={it.sku}>
                {it.item_name} ({it.sku})
              </option>
            ))}
          </Select>
        )}

        <Input label="Damage type" value={damageType} onChange={(e) => setDamageType(e.target.value)} placeholder="e.g. crushed, water damage" />
        <Input
          label="Damaged qty"
          type="number"
          min={1}
          value={damagedQty}
          onChange={(e) => setDamagedQty(parseInt(e.target.value || "0", 10))}
        />
        <TextArea label="Description" rows={3} value={claimText} onChange={(e) => setClaimText(e.target.value)} />

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Filing…" : "File Claim"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
