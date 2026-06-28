import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, ApiError } from "../lib/api";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui";
import { LoadingOverlay } from "../components/ui/Spinner";
import type { KpiSummary } from "../lib/types";

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardBody>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
        <div className="mt-1.5 text-2xl font-semibold text-accent-300 font-mono">{value}</div>
      </CardBody>
    </Card>
  );
}

export default function KpiDashboard() {
  const { t } = useTranslation();
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<KpiSummary>("/api/kpi/summary")
      .then(setKpi)
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)));
  }, []);

  if (error) {
    return <div className="text-sm text-rose-400">{error}</div>;
  }
  if (!kpi) return <LoadingOverlay label={t("common.loading")} />;

  const agentNames = Object.keys(kpi.per_agent);
  const latencyData = agentNames.map((name) => ({
    name: name.replace("_agent", ""),
    avg_latency_ms: kpi.per_agent[name].avg_latency_ms,
  }));
  const successData = agentNames.map((name) => ({
    name: name.replace("_agent", ""),
    success_rate: Math.round(kpi.per_agent[name].success_rate * 100),
  }));

  const totalClaims = 0; // not separately exposed by backend; derive via successful_runs as proxy
  const totalAlerts = 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">{t("kpi.title")}</h1>
        <p className="mt-1 text-sm text-slate-400">{t("kpi.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label={t("kpi.totalRuns")} value={kpi.total_runs} />
        <StatTile
          label={t("kpi.successRate")}
          value={kpi.run_success_rate !== null ? `${Math.round(kpi.run_success_rate * 100)}%` : "—"}
        />
        <StatTile label={t("kpi.totalClaims")} value={kpi.successful_runs} />
        <StatTile label="Log Entries" value={kpi.total_log_entries} />
      </div>

      {agentNames.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-slate-500">{t("kpi.noData")}</CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("kpi.avgLatency")}</CardTitle>
            </CardHeader>
            <CardBody style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={latencyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" }} />
                  <Bar dataKey="avg_latency_ms" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("kpi.agentSuccessRate")}</CardTitle>
            </CardHeader>
            <CardBody style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={successData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" }} />
                  <Bar dataKey="success_rate" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
        </div>
      )}

      {agentNames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("kpi.perAgent")}</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {agentNames.map((name) => {
                const a = kpi.per_agent[name];
                return (
                  <div key={name} className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-sm font-medium text-slate-200">{name}</div>
                    <dl className="mt-2 space-y-1 text-xs text-slate-400">
                      <div className="flex justify-between">
                        <dt>{t("kpi.calls")}</dt>
                        <dd className="font-mono text-slate-200">{a.total_calls}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>{t("kpi.agentSuccessRate")}</dt>
                        <dd className="font-mono text-slate-200">{Math.round(a.success_rate * 100)}%</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>{t("kpi.avgLatency")}</dt>
                        <dd className="font-mono text-slate-200">{a.avg_latency_ms}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>{t("kpi.tokenEstimate")}</dt>
                        <dd className="font-mono text-slate-200">{a.total_token_estimate}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
