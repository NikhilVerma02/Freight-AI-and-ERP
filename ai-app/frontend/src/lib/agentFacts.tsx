import React from "react";
import type { TFunction } from "i18next";
import { Badge } from "../components/ui";

export const STEP_KEYS = ["inspector", "context", "policy", "inventory", "reorder", "claim", "governance"] as const;
export type StepKey = typeof STEP_KEYS[number];

export interface Fact {
  label: string;
  value: React.ReactNode;
}

interface AgentMeta {
  icon: string;
  titleKey: string;
  subtitleKey: string;
  emptyKey: string;
}

export const AGENT_META: Record<StepKey, AgentMeta> = {
  inspector: { icon: "🔍", titleKey: "detail.inspectorTitle", subtitleKey: "detail.inspectorSubtitle", emptyKey: "detail.notRun" },
  context: { icon: "🧩", titleKey: "detail.contextTitle", subtitleKey: "detail.contextSubtitle", emptyKey: "detail.notRun" },
  policy: { icon: "📜", titleKey: "detail.policyTitle", subtitleKey: "detail.policySubtitle", emptyKey: "detail.notRun" },
  inventory: { icon: "📦", titleKey: "detail.inventoryTitle", subtitleKey: "detail.inventorySubtitle", emptyKey: "detail.notRun" },
  reorder: { icon: "🔁", titleKey: "detail.reorderTitle", subtitleKey: "detail.reorderSubtitle", emptyKey: "detail.reorderSkipped" },
  claim: { icon: "🧾", titleKey: "detail.claimTitle", subtitleKey: "detail.claimSubtitle", emptyKey: "detail.claimSkipped" },
  governance: { icon: "🛡️", titleKey: "detail.governanceTitle", subtitleKey: "detail.governanceSubtitle", emptyKey: "detail.notRun" },
};

function truncate(text: string | null | undefined, max = 140): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function yesNoBadge(t: TFunction, value: boolean) {
  return <Badge tone={value ? "ok" : "neutral"}>{value ? t("common.yes") : t("common.no")}</Badge>;
}

function riskBadge(risk: string) {
  const tone = risk === "critical" ? "failed" : risk === "warning" ? "running" : risk === "safe" ? "ok" : "neutral";
  return <Badge tone={tone}>{risk}</Badge>;
}

/** Every agent reports its own confidence (0-100) — see app/agents/confidence.py. Genuine LLM
 * judgment calls (Inspector/Policy) self-report it; deterministic/tool-grounded agents
 * (Inventory) report a fixed 100; agents whose decision just executes an upstream judgment
 * (Reorder/Claim) inherit it; Context derives its own from concrete reconciliation red flags;
 * Governance averages the three genuine judgments into one overall figure. */
function confidenceBadge(value: number | null | undefined) {
  if (value === null || value === undefined) return <span className="text-slate-500">—</span>;
  const tone = value >= 80 ? "ok" : value >= 50 ? "running" : "failed";
  return <Badge tone={tone}>{value}%</Badge>;
}

/** data is the agent's "clean" output payload — InspectorExtracted, CaseObject, PolicyResult,
 * InventoryResult, the order/claim record (or null), or GovernanceSummary. Same shape whether
 * it came live from a just-finished run or from a persisted agent_logs.json entry. */
export function buildFacts(key: StepKey, data: any, t: TFunction): Fact[] {
  if (!data) return [];
  if (data.skipped) {
    return [{ label: t("detail.skippedReason"), value: data.reason ?? t("detail.skippedGeneric") }];
  }
  switch (key) {
    case "inspector":
      return [
        { label: t("detail.damageType"), value: data.damage_type ?? "—" },
        { label: t("detail.damagedQty"), value: data.damaged_qty ?? "—" },
        ...(data.po_number ? [{ label: t("detail.poNumber"), value: data.po_number }] : []),
        { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
      ];
    case "context":
      return [
        { label: t("detail.damageType"), value: data.damage_type ?? "—" },
        { label: t("detail.damagedQty"), value: `${data.damaged_qty ?? "—"} / ${data.ordered_qty ?? "—"}` },
        { label: t("detail.caseSummary"), value: truncate(data.case_summary) },
        ...(data.po_number_mismatch
          ? [{ label: t("detail.needsReview"), value: <Badge tone="failed">{t("common.yes")}</Badge> }]
          : []),
        { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
      ];
    case "policy":
      return [
        { label: t("detail.eligibleForClaim"), value: yesNoBadge(t, Boolean(data.eligible_for_claim)) },
        { label: t("detail.liable"), value: String(data.liable ?? "—") },
        { label: t("detail.justification"), value: truncate(data.justification) },
        { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
      ];
    case "inventory":
      return [
        { label: t("detail.risk"), value: riskBadge(String(data.risk ?? "unknown")) },
        { label: t("detail.customerQtyAfter"), value: data.customer_qty_after_damage ?? "—" },
        ...(data.vendor_below_threshold
          ? [{ label: t("detail.vendorBelowThreshold"), value: <Badge tone="running">{t("common.yes")}</Badge> }]
          : []),
        { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
      ];
    case "reorder":
      return [
        { label: t("detail.reorderOrderNumber"), value: data.order_number ?? "—" },
        ...(typeof data.reorder_note === "string" ? [{ label: t("detail.narrative"), value: truncate(data.reorder_note) }] : []),
        { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
      ];
    case "claim":
      return [
        { label: t("detail.erpClaimId"), value: data.claim_number ?? data.id ?? "—" },
        ...(typeof data.claim_text === "string" ? [{ label: t("detail.narrative"), value: truncate(data.claim_text) }] : []),
        { label: t("detail.confidence"), value: confidenceBadge(data.confidence) },
      ];
    case "governance":
      return [
        { label: t("detail.governanceNarrative"), value: truncate(data.narrative, 220) },
        { label: t("detail.claimFiled"), value: yesNoBadge(t, Boolean(data.claim_filed)) },
        { label: t("detail.reorderPlaced"), value: yesNoBadge(t, Boolean(data.reorder_placed)) },
        { label: t("detail.risk"), value: riskBadge(String(data.inventory_risk ?? "unknown")) },
        { label: t("detail.overallConfidence"), value: confidenceBadge(data.overall_confidence) },
      ];
    default:
      return [];
  }
}
