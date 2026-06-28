import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui";
import { LoadingOverlay } from "../components/ui/Spinner";
import { AGENT_COLORS, STAT_HEX } from "../lib/colors";
import { AGENT_META, StepKey } from "../lib/agentFacts";
import { fadeUpItem, staggerContainer } from "../lib/motion";
import type { KpiSummary } from "../lib/types";

function StatTile({ label, value, hex }: { label: string; value: React.ReactNode; hex: string }) {
  return (
    <motion.div variants={fadeUpItem}>
      <Card className="overflow-hidden border-t-2" style={{ borderTopColor: hex }}>
        <CardBody>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
          <div className="mt-1.5 text-2xl font-semibold font-mono" style={{ color: hex }}>
            {value}
          </div>
        </CardBody>
      </Card>
    </motion.div>
  );
}

function agentHex(name: string): string {
  const key = name.replace("_agent", "") as StepKey;
  return AGENT_COLORS[key]?.hex || "#22d3ee";
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
    color: agentHex(name),
  }));
  const successData = agentNames.map((name) => ({
    name: name.replace("_agent", ""),
    success_rate: Math.round(kpi.per_agent[name].success_rate * 100),
    color: agentHex(name),
  }));

  const partialRuns = Math.max(0, kpi.total_runs - kpi.successful_runs - kpi.failed_runs);
  const runStatusData = [
    { name: "completed", value: kpi.successful_runs, color: "#34d399" },
    { name: "partial", value: partialRuns, color: "#fbbf24" },
    { name: "failed", value: kpi.failed_runs, color: "#fb7185" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="text-xl font-semibold text-slate-100">{t("kpi.title")}</h1>
        <p className="mt-1 text-sm text-slate-400">{t("kpi.subtitle")}</p>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-4 md:grid-cols-4"
      >
        <StatTile label={t("kpi.totalRuns")} value={kpi.total_runs} hex={STAT_HEX.blue} />
        <StatTile
          label={t("kpi.successRate")}
          value={kpi.run_success_rate !== null ? `${Math.round(kpi.run_success_rate * 100)}%` : "—"}
          hex={STAT_HEX.emerald}
        />
        <StatTile label={t("kpi.totalClaims")} value={kpi.successful_runs} hex={STAT_HEX.violet} />
        <StatTile label="Log Entries" value={kpi.total_log_entries} hex={STAT_HEX.amber} />
      </motion.div>

      {agentNames.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-slate-500">{t("kpi.noData")}</CardBody>
        </Card>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 lg:grid-cols-3"
        >
          <motion.div variants={fadeUpItem}>
            <Card>
              <CardHeader>
                <CardTitle>Run Outcomes</CardTitle>
              </CardHeader>
              <CardBody style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={runStatusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {runStatusData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          </motion.div>

          <motion.div variants={fadeUpItem}>
            <Card>
              <CardHeader>
                <CardTitle>{t("kpi.avgLatency")}</CardTitle>
              </CardHeader>
              <CardBody style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={latencyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={12} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" }} />
                    <Bar dataKey="avg_latency_ms" radius={[4, 4, 0, 0]}>
                      {latencyData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          </motion.div>

          <motion.div variants={fadeUpItem}>
            <Card>
              <CardHeader>
                <CardTitle>{t("kpi.agentSuccessRate")}</CardTitle>
              </CardHeader>
              <CardBody style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={successData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={12} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0" }} />
                    <Bar dataKey="success_rate" radius={[4, 4, 0, 0]}>
                      {successData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          </motion.div>
        </motion.div>
      )}

      {agentNames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("kpi.perAgent")}</CardTitle>
          </CardHeader>
          <CardBody>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              {agentNames.map((name) => {
                const a = kpi.per_agent[name];
                const key = name.replace("_agent", "") as StepKey;
                const meta = AGENT_META[key];
                const palette = AGENT_COLORS[key];
                return (
                  <motion.div key={name} variants={fadeUpItem}>
                    <div className={`rounded-md border bg-slate-950/40 p-3 ${palette?.ring || "border-slate-800"}`}>
                      <div className="flex items-center gap-2 text-sm font-medium text-slate-200">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${palette?.iconBg || ""}`}>
                          {meta?.icon || "●"}
                        </span>
                        {name}
                      </div>
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
                  </motion.div>
                );
              })}
            </motion.div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
