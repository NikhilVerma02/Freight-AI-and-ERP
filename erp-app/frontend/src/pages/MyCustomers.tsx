import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import type { MyCustomer } from "../lib/types";

export default function MyCustomers() {
  const { user } = useAuth();
  const { show } = useToast();
  const [customers, setCustomers] = useState<MyCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const data = await api.get<MyCustomer[]>(`/api/vendors/${user.username}/customers`);
        setCustomers(data);
      } catch (err) {
        show("error", err instanceof ApiError ? err.message : "Failed to load customers");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, show]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">My Customers</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Customers linked to you, with their order and claim activity.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : customers.length === 0 ? (
        <p className="text-sm text-slate-400">No linked customers yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {customers.map((c) => (
            <Card key={c.username} className="flex flex-col gap-2 p-4">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {c.display_name}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                @{c.username}
                {c.company_name ? ` · ${c.company_name}` : ""}
              </span>
              <div className="mt-1 flex gap-2">
                <Badge tone="blue">{c.order_count} orders</Badge>
                <Badge tone="purple">{c.claim_count} claims</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
