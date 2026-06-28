import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import {
  Badge,
  statusToTone,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CardSubtitle,
  CodeBlock,
} from "../components/ui";
import { LoadingOverlay } from "../components/ui/Spinner";
import type { AgentLogEntry, RunDetail } from "../lib/types";

function findStep(steps: AgentLogEntry[], agent: string): AgentLogEntry | undefined {
  return steps.find((s) => s.agent === agent);
}

function StepMeta({ step }: { step: AgentLogEntry | undefined }) {
  const { t } = useTranslation();
  if (!step) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-800 pt-3 text-xs font-mono text-slate-500">
      <span>{t("detail.latency")}: {step.latency_ms ? `${step.latency_ms.toFixed(0)}ms` : "—"}</span>
      <span>{t("detail.model")}: {step.model || "—"}</span>
      <span>
        {t("detail.tokens")}: {step.tokens ? `${(step.tokens.prompt_tokens ?? 0) + (step.tokens.completion_tokens ?? 0)}` : "—"}
      </span>
    </div>
  );
}

export default function CaseDetail() {
  const { t } = useTranslation();
  const { runId } = useParams<{ runId: string }>();
  const [data, setData] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    setData(null);
    setError(null);
    api
      .get<RunDetail>(`/api/ingest/runs/${runId}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)));
  }, [runId]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/history" className="text-sm text-accent-400 hover:underline">← {t("detail.back")}</Link>
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {t("detail.loadError")}: {error}
        </div>
      </div>
    );
  }

  if (!data) return <LoadingOverlay label={t("common.loading")} />;

  const { run, steps } = data;
  const intakeStep = findStep(steps, "intake_agent");
  const policyStep = findStep(steps, "policy_agent");
  const inventoryStep = findStep(steps, "inventory_agent");
  const claimStep = findStep(steps, "claim_agent");

  const intakeOut = intakeStep?.output_summary as Record<string, unknown> | null | undefined;
  const policyOut = policyStep?.output_summary as Record<string, unknown> | null | undefined;
  const inventoryOut = inventoryStep?.output_summary as Record<string, unknown> | null | undefined;
  const claimOut = claimStep?.output_summary as { claim?: Record<string, unknown>; alert?: Record<string, unknown> } | null | undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/history" className="text-sm text-accent-400 hover:underline">← {t("detail.back")}</Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">{t("detail.title")}</h1>
          <p className="mt-1 font-mono text-xs text-slate-500">{run.run_id}</p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-500">{t("detail.overallStatus")}</div>
          <Badge tone={statusToTone(run.status)} className="mt-1">{run.status}</Badge>
        </div>
      </div>

      {/* Intake */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle>{t("detail.intakeTitle")}</CardTitle>
            <CardSubtitle>{t("detail.intakeSubtitle")}</CardSubtitle>
          </div>
          {intakeStep && <Badge tone={statusToTone(intakeStep.status)}>{intakeStep.status}</Badge>}
        </CardHeader>
        <CardBody>
          {intakeOut ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label={t("detail.poNumber")} value={String(intakeOut.po_number ?? "—")} />
              <Field label={t("detail.itemType")} value={String(intakeOut.item_type ?? "—")} />
              <Field label={t("detail.damageType")} value={String(intakeOut.damage_type ?? "—")} />
              <Field label={t("detail.damagedQty")} value={String(intakeOut.damaged_qty ?? "—")} />
              <div className="col-span-2">
                <Field label={t("detail.confidenceNotes")} value={String(intakeOut.confidence_notes ?? "—")} />
              </div>
            </div>
          ) : (
            <EmptyOrError step={intakeStep} />
          )}
          <StepMeta step={intakeStep} />
        </CardBody>
      </Card>

      {/* Policy */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle>{t("detail.policyTitle")}</CardTitle>
            <CardSubtitle>{t("detail.policySubtitle")}</CardSubtitle>
          </div>
          {policyStep && <Badge tone={statusToTone(policyStep.status)}>{policyStep.status}</Badge>}
        </CardHeader>
        <CardBody>
          {policyOut ? (
            <div className="space-y-3 text-sm">
              <Field label={t("detail.liable")} value={String(policyOut.liable ?? "—")} />
              <Field label={t("detail.justification")} value={String(policyOut.justification ?? "—")} />
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  {t("detail.citedClauses")}
                </div>
                <ul className="list-disc space-y-1 pl-5 text-slate-300">
                  {Array.isArray(policyOut.cited_clauses) && policyOut.cited_clauses.length > 0 ? (
                    (policyOut.cited_clauses as string[]).map((c, i) => <li key={i}>{c}</li>)
                  ) : (
                    <li className="list-none text-slate-500">—</li>
                  )}
                </ul>
              </div>
            </div>
          ) : (
            <EmptyOrError step={policyStep} />
          )}
          <StepMeta step={policyStep} />
        </CardBody>
      </Card>

      {/* Inventory */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle>{t("detail.inventoryTitle")}</CardTitle>
            <CardSubtitle>{t("detail.inventorySubtitle")}</CardSubtitle>
          </div>
          {inventoryStep && <Badge tone={statusToTone(inventoryStep.status)}>{inventoryStep.status}</Badge>}
        </CardHeader>
        <CardBody>
          {inventoryOut ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Field label={t("detail.affectedSku")} value={String(inventoryOut.affected_sku ?? "—")} />
              <Field label={t("detail.shortfallQty")} value={String(inventoryOut.shortfall_qty ?? "—")} />
              <Field label={t("detail.currentQty")} value={String(inventoryOut.current_qty ?? "—")} />
              <Field label={t("detail.reorderThreshold")} value={String(inventoryOut.reorder_threshold ?? "—")} />
              <Field label={t("detail.projectedQty")} value={String(inventoryOut.projected_qty_after_damage ?? "—")} />
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  {t("detail.manufacturingHaltRisk")}
                </div>
                <Badge tone={inventoryOut.manufacturing_halt_risk ? "failed" : "ok"}>
                  {inventoryOut.manufacturing_halt_risk ? t("common.yes") : t("common.no")}
                </Badge>
              </div>
            </div>
          ) : (
            <EmptyOrError step={inventoryStep} />
          )}
          <StepMeta step={inventoryStep} />
        </CardBody>
      </Card>

      {/* Claim */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle>{t("detail.claimTitle")}</CardTitle>
            <CardSubtitle>{t("detail.claimSubtitle")}</CardSubtitle>
          </div>
          {claimStep && <Badge tone={statusToTone(claimStep.status)}>{claimStep.status}</Badge>}
        </CardHeader>
        <CardBody>
          {claimOut?.claim ? (
            <div className="space-y-3 text-sm">
              <Field label={t("detail.narrative")} value={String(claimOut.claim.narrative ?? "—")} />
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                  {t("detail.claimPayload")}
                </div>
                <CodeBlock data={claimOut.claim} />
              </div>
              <div className="flex flex-wrap gap-4 pt-1">
                <Field label={t("detail.erpClaimId")} value={String(run.claim_id ?? claimOut.claim.id ?? "—")} />
                <Field
                  label={t("detail.erpAlertId")}
                  value={claimOut.alert ? String(run.alert_id ?? claimOut.alert.id ?? "—") : t("detail.noAlert")}
                />
              </div>
            </div>
          ) : (
            <EmptyOrError step={claimStep} />
          )}
          <StepMeta step={claimStep} />
        </CardBody>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-slate-200">{value}</div>
    </div>
  );
}

function EmptyOrError({ step }: { step: AgentLogEntry | undefined }) {
  const { t } = useTranslation();
  if (step?.error) {
    return (
      <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
        {t("detail.error")}: {step.error}
      </div>
    );
  }
  return <div className="text-sm text-slate-500">{t("detail.notRun")}</div>;
}
