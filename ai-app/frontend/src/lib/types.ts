// Shared TS types mirroring the AI backend's response shapes.
// See ai-app/backend/app/routers/*.py and app/agents/*.py for source of truth.

export interface LlmEnvelope {
  status: "ok" | "error" | string;
  content?: string | null;
  model?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  error?: string | null;
}

export interface IntakeExtracted {
  po_number: string | null;
  item_type: string;
  damage_type: string;
  damaged_qty: number | null;
  confidence_notes: string;
}

export interface IntakeOut {
  extracted: IntakeExtracted | null;
  raw: Record<string, unknown>;
  status: "ok" | "failed";
  error: string | null;
}

export interface PolicyResult {
  liable: boolean | "partial" | string;
  justification: string;
  cited_clauses: string[];
}

export interface PolicyOut {
  result: PolicyResult | null;
  vendor_id: number | null;
  raw: Record<string, unknown>;
  status: "ok" | "failed";
  error: string | null;
}

export interface InventoryResult {
  shortfall_qty: number;
  manufacturing_halt_risk: boolean;
  affected_sku: string;
  current_qty: number;
  reorder_threshold: number;
  projected_qty_after_damage: number;
  manufacturing_critical: boolean;
}

export interface InventoryOut {
  result: InventoryResult | null;
  raw: Record<string, unknown>;
  status: "ok" | "failed";
  error: string | null;
}

export interface ClaimPayload {
  po_number: string;
  vendor_id: number;
  damage_type: string;
  damaged_qty: number;
  liable: boolean | "partial" | string;
  claim_amount_estimate: number;
  narrative: string;
}

export interface ClaimRecord {
  id: number;
  [key: string]: unknown;
}

export interface AlertRecord {
  id: number;
  [key: string]: unknown;
}

export interface ClaimOut {
  claim: ClaimRecord | null;
  alert: AlertRecord | null;
  raw: Record<string, unknown>;
  status: "ok" | "failed";
  error: string | null;
}

export interface PipelineRunResult {
  run_id: string;
  status: "running" | "completed" | "partial" | "failed";
  intake: IntakeOut | null;
  policy: PolicyOut | null;
  inventory: InventoryOut | null;
  claim: ClaimOut | null;
}

export interface AgentRun {
  run_id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "completed" | "partial" | "failed";
  case_summary: string;
  claim_id: number | null;
  alert_id: number | null;
}

export interface AgentLogEntry {
  run_id: string;
  agent: string;
  timestamp: string;
  input_summary: unknown;
  output_summary: unknown;
  status: "ok" | "failed";
  latency_ms: number | null;
  model: string | null;
  tokens: { prompt_tokens?: number | null; completion_tokens?: number | null } | null;
  error: string | null;
}

export interface RunDetail {
  run: AgentRun;
  steps: AgentLogEntry[];
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  tools_used?: { name: string; arguments: Record<string, unknown> }[];
}

export interface ChatResponse {
  session_id: string;
  reply: string;
  tools_used: { name: string; arguments: Record<string, unknown> }[];
}

export interface ChatSession {
  session_id: string;
  created_at: string;
  messages: ChatMessage[];
}

export interface KpiAgentSummary {
  total_calls: number;
  success_count: number;
  failed_count: number;
  success_rate: number;
  avg_latency_ms: number;
  total_token_estimate: number;
}

export interface KpiSummary {
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  run_success_rate: number | null;
  per_agent: Record<string, KpiAgentSummary>;
  total_log_entries: number;
}
