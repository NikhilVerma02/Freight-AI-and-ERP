import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useToast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { AskSlaBox } from "../components/AskSlaBox";
import type { VendorSla } from "../lib/types";

export default function SlaView() {
  const { show } = useToast();
  const [slas, setSlas] = useState<VendorSla[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<VendorSla[]>("/api/vendors/sla");
        setSlas(data);
      } catch (err) {
        show("error", err instanceof ApiError ? err.message : "Failed to load SLAs");
      } finally {
        setLoading(false);
      }
    })();
  }, [show]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Vendor SLAs</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Liability summaries for vendors you work with.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : slas.length === 0 ? (
        <p className="text-sm text-slate-400">No SLAs available.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {slas.map((s) => {
            const open = expanded === s.id;
            return (
              <Card key={s.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {s.vendor_username}
                  </span>
                  {s.uploaded_at && (
                    <span className="text-[11px] text-slate-400">
                      {new Date(s.uploaded_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Liability summary
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300">{s.liability_summary}</p>
                <button
                  onClick={() => setExpanded(open ? null : s.id)}
                  className="self-start text-xs font-medium text-accent"
                >
                  {open ? "Hide full text" : "View full text"}
                </button>
                {open && (
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-navy-900 dark:text-slate-300">
                    {s.sla_text_cache}
                  </pre>
                )}
                <AskSlaBox slaId={s.id} />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
