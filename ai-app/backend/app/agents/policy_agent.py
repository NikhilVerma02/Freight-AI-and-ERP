"""
Policy Agent — asks the ERP's own SLA RAG (ask_vendor_sla MCP tool, backed
by erp-app/backend/app/rag/sla_rag.py: Gemini embeddings + Groq answer over
the actual SLA document the vendor shared with this customer) whether this
case is eligible for a claim and/or who's liable, then runs a Groq
reasoning pass over that answer + the case facts to produce a structured
verdict.

IMPORTANT: "claim eligibility" and "liability" are kept as two independent
judgments, not "eligible only if liable". Some SLAs are written as a
liability/fault framework (covered vs. excluded damage types, liability
caps); others — like a "Claims SLA – Eligibility for Suspected Transit
Damage" — are written as a procedural evidentiary threshold for whether a
claim should even proceed to review, with fault/liability determined later
by a separate process. Hard-wiring eligible_for_claim = liable would make
the second kind of SLA always look like a denial, which is wrong: the SLA
itself may explicitly say "proceed to claim review" without yet
determining fault. Each is judged from what the SLA answer actually says.
"""
from __future__ import annotations

import logging

from app import observability
from app.agents.json_utils import safe_json_parse
from app.mcp_client import ErpMcpClient, McpClientError
from app.providers import groq_client

logger = logging.getLogger("ai_app.agents.policy")

REASONING_SYSTEM_PROMPT = (
    "You are a freight claims analyst. Given an SLA excerpt-grounded answer and a damage case "
    "description, make two INDEPENDENT judgments — do not assume one implies the other:\n"
    "1. eligible_for_claim: should this case proceed to/be accepted for claim review, per "
    "whatever criteria the SLA actually uses? Some SLAs grant eligibility as a procedural "
    "evidentiary threshold (e.g. 'visible external damage creates a reasonable possibility of "
    "content damage, proceed to review') WITHOUT yet deciding fault — if the SLA's answer "
    "describes exactly this kind of criteria being met, eligible_for_claim is true even if "
    "liability/fault hasn't been determined yet.\n"
    "2. liable: the carrier/vendor's fault determination, ONLY if the SLA answer actually makes "
    "one. Use true/false/\"partial\" if it does. If the SLA defers fault to a later "
    "investigation (as eligibility-threshold SLAs often do) or simply doesn't address fault at "
    "all, use \"pending\" rather than guessing false.\n"
    "Judge by damage cause/category and the evidentiary criteria described — never by whether "
    "the SLA happens to mention the specific product name or SKU, which it generally won't. "
    "Respond with ONLY a JSON object with these exact keys: eligible_for_claim (boolean), liable "
    "(one of: true, false, \"partial\", \"pending\"), justification (string, cite the SLA "
    "answer). No prose, no markdown fences."
)


async def run_policy(mcp_client: ErpMcpClient, case: dict, run_id: str | None = None) -> dict:
    """case is the Context Structuring Agent's output. run_id (optional): forwarded to the
    erp-app SLA RAG call over MCP so it nests under this SAME Langfuse trace despite running
    in a different process — see app/observability.py.
    Returns {result: dict|None, raw: dict, status: 'ok'|'failed', error: str|None}."""
    raw: dict = {"sla_rag": None, "reasoning": None}

    vendor_username = case["vendor_username"]
    customer_username = case["customer_username"]
    # Includes the actual evidence/confidence notes (not just the damage category) because some
    # SLAs are written as an evidentiary-threshold test over exactly this kind of inspection
    # note, not as a liability/exclusions table — asking only about "liability and exclusions"
    # would miss that framing entirely (confirmed: it caused a real false-decline).
    question = (
        f"A shipment has {case['damage_type']} damage, {case['damaged_qty']} unit(s) affected. "
        f"Evidence notes: {case['evidence_notes'] or '(none provided)'}. "
        f"Confidence notes: {case['confidence_notes'] or '(none provided)'}. "
        "Per this SLA's criteria, is this case eligible for a damage claim review? Separately, "
        "what does the SLA say (if anything) about liability, exclusions, or liability caps for "
        "this type of damage?"
    )

    try:
        sla_answer = await mcp_client.ask_vendor_sla(vendor_username, customer_username, question, run_id=run_id)
    except McpClientError as exc:
        return {"result": None, "raw": raw, "status": "failed", "error": f"SLA RAG call failed: {exc}"}

    raw["sla_rag"] = sla_answer
    if sla_answer.get("error") or not sla_answer.get("answer"):
        # No SLA on file / RAG failure — fail closed (not eligible) rather than guessing.
        result = {
            "eligible_for_claim": False,
            "liable": "pending",
            "justification": sla_answer.get("error") or "No SLA answer was returned for this vendor/customer pair.",
        }
        return {"result": result, "raw": raw, "status": "ok", "error": None}

    reasoning_prompt = (
        f"Damage cause: {case['damage_type']}, {case['damaged_qty']} of {case['ordered_qty']} units affected.\n"
        f"Evidence notes: {case['evidence_notes'] or '(none)'}\n"
        f"Confidence notes: {case['confidence_notes'] or '(none)'}\n\n"
        f"SLA-grounded answer:\n{sla_answer['answer']}\n\n"
        "Make the two independent judgments per the instructions."
    )
    trace_id = observability.trace_id_for(run_id) if run_id else None
    reasoning_result = groq_client.reasoning_chat(
        REASONING_SYSTEM_PROMPT, reasoning_prompt, temperature=0, trace_id=trace_id, name="policy_reasoning"
    )
    raw["reasoning"] = reasoning_result

    if reasoning_result["status"] != "ok":
        return {
            "result": None,
            "raw": raw,
            "status": "failed",
            "error": f"Reasoning call failed: {reasoning_result.get('error')}",
        }

    parsed = safe_json_parse(reasoning_result["content"])
    if parsed is None:
        return {
            "result": None,
            "raw": raw,
            "status": "failed",
            "error": f"Could not parse verdict JSON from model output: {reasoning_result['content']!r}",
        }

    return {"result": parsed, "raw": raw, "status": "ok", "error": None}
