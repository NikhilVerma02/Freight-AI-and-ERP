"""
Claim Agent — drafts a claim narrative via Groq and files it with the ERP
(create_claim MCP tool) only if the Policy Agent determined the customer is
eligible. create_claim already raises a "new_claim" alert to the vendor
server-side (see erp-app/backend/app/services/claims.py) — no separate
alert call needed here.

Skip condition: Policy Agent says eligible_for_claim=false. Inventory/
Reorder/Governance still run regardless — the damaged stock still needs
tracking/replacing even without a claim.
"""
from __future__ import annotations

import logging

from app import observability
from app.mcp_client import ErpMcpClient, McpClientError
from app.providers import groq_client

logger = logging.getLogger("ai_app.agents.claim")

DRAFT_SYSTEM_PROMPT = (
    "You are a freight claims drafting assistant. Given case facts and a liability "
    "determination, draft a professional claim narrative (3-5 sentences). Respond with ONLY "
    "the narrative text — no prose framing, no markdown, no quotes."
)


async def run_claim(mcp_client: ErpMcpClient, case: dict, policy_result: dict | None, run_id: str | None = None) -> dict:
    """case is the Context Structuring Agent's output; policy_result is the Policy Agent's
    {liable, eligible_for_claim, justification, confidence} dict. run_id (optional): threaded
    down for Langfuse tracing — see app/observability.py.
    Returns {claim: dict|None, skipped: bool, skip_reason: str|None, raw: dict,
    status: 'ok'|'failed', error: str|None}."""
    raw: dict = {"draft": None, "create_claim": None}

    if not policy_result or not policy_result.get("eligible_for_claim"):
        return {
            "claim": None,
            "skipped": True,
            "skip_reason": "Not eligible for a claim per the Policy Agent's determination.",
            "raw": raw, "status": "ok", "error": None,
        }

    draft_prompt = (
        f"Order: {case['order_number']}\nItem: {case['item_name']} (SKU {case['sku']})\n"
        f"Damage type: {case['damage_type']}\nDamaged quantity: {case['damaged_qty']} of {case['ordered_qty']}\n"
        f"Liability determination: {policy_result.get('liable')}\n"
        f"Justification: {policy_result.get('justification')}\n\n"
        "Draft the claim narrative per the instructions."
    )
    trace_id = observability.trace_id_for(run_id) if run_id else None
    draft_result = groq_client.reasoning_chat(
        DRAFT_SYSTEM_PROMPT, draft_prompt, temperature=0.3, trace_id=trace_id, name="claim_draft"
    )
    raw["draft"] = draft_result

    if draft_result["status"] != "ok" or not draft_result["content"]:
        return {
            "claim": None,
            "skipped": False,
            "skip_reason": None,
            "raw": raw,
            "status": "failed",
            "error": f"Claim drafting failed: {draft_result.get('error')}",
        }

    narrative = draft_result["content"].strip()
    try:
        claim_record = await mcp_client.create_claim(
            customer_username=case["customer_username"],
            order_id=case["order_id"],
            sku=case["sku"],
            damage_type=case["damage_type"],
            damaged_qty=case["damaged_qty"],
            claim_text=narrative,
        )
        raw["create_claim"] = claim_record
    except McpClientError as exc:
        return {
            "claim": None, "skipped": False, "skip_reason": None, "raw": raw,
            "status": "failed", "error": f"create_claim MCP call failed: {exc}",
        }

    # The file/skip decision is a deterministic rule over Policy's judgment — confidence is
    # inherited from there rather than independently re-judged here.
    claim_record["confidence"] = policy_result.get("confidence", 100)
    return {"claim": claim_record, "skipped": False, "skip_reason": None, "raw": raw, "status": "ok", "error": None}
