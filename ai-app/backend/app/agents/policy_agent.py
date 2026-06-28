"""
Policy agent — resolves the vendor from the PO (tool/API-grounded RAG via
mcp_client.get_purchase_order), retrieves relevant SLA clauses for the
damage context (document RAG via policy_rag), then asks the REASONING
model to judge liability.
"""
from __future__ import annotations

import logging

from app.llm_client import LLMClient
from app.mcp_client import ErpMcpClient, McpClientError
from app.rag import policy_rag

logger = logging.getLogger("ai_app.agents.policy")

REASONING_SYSTEM_PROMPT = (
    "You are a freight claims liability analyst. Given vendor SLA clauses and a damage case "
    "description, determine carrier liability. Respond with ONLY a JSON object with these exact "
    "keys: liable (one of: true, false, \"partial\"), justification (string, cite specific clause "
    "language), cited_clauses (array of short strings quoting/paraphrasing the clauses you relied on). "
    "No prose, no markdown fences."
)


async def run_policy(
    mcp_client: ErpMcpClient,
    llm_client: LLMClient,
    po_number: str | None,
    vendor_id: int | None,
    damage_type: str,
    item_type: str,
    damaged_qty: int | None,
) -> dict:
    """Returns {result: dict|None, vendor_id: int|None, raw: dict, status, error}."""
    raw: dict = {"po_lookup": None, "retrieval": None, "reasoning": None}

    resolved_vendor_id = vendor_id
    po_record = None
    if resolved_vendor_id is None and po_number:
        try:
            po_record = await mcp_client.get_purchase_order(po_number)
            raw["po_lookup"] = po_record
            if po_record:
                resolved_vendor_id = po_record.get("vendor_id")
        except McpClientError as exc:
            return {"result": None, "vendor_id": None, "raw": raw, "status": "failed", "error": f"PO lookup failed: {exc}"}

    if resolved_vendor_id is None:
        return {
            "result": None,
            "vendor_id": None,
            "raw": raw,
            "status": "failed",
            "error": "Could not resolve vendor_id (no vendor_id given and PO lookup yielded none).",
        }

    query = f"Is the carrier liable for {damage_type} damage to {item_type}" + (
        f" (qty: {damaged_qty})" if damaged_qty else ""
    ) + "? What are the exclusions and liability caps?"

    try:
        retrieval = await policy_rag.retrieve_relevant_clauses(mcp_client, llm_client, resolved_vendor_id, query, top_k=4)
    except Exception as exc:
        logger.error("Policy RAG retrieval raised: %s", exc)
        return {"result": None, "vendor_id": resolved_vendor_id, "raw": raw, "status": "failed", "error": f"RAG retrieval failed: {exc}"}

    raw["retrieval"] = retrieval
    if retrieval.get("error"):
        return {"result": None, "vendor_id": resolved_vendor_id, "raw": raw, "status": "failed", "error": retrieval["error"]}

    clauses_text = "\n\n".join(f"- {c}" for c in retrieval["clauses"]) or "(no clauses retrieved)"
    reasoning_prompt = (
        f"Damage case: {damage_type} damage to {item_type}"
        + (f", quantity affected: {damaged_qty}." if damaged_qty else ".")
        + f"\n\nRelevant SLA clauses retrieved for this vendor:\n{clauses_text}\n\n"
        "Determine liability per the instructions."
    )
    reasoning_result = llm_client.chat(
        "reasoning",
        [{"role": "system", "content": REASONING_SYSTEM_PROMPT}, {"role": "user", "content": reasoning_prompt}],
        temperature=0,
    )
    raw["reasoning"] = reasoning_result

    if reasoning_result["status"] != "ok":
        return {
            "result": None,
            "vendor_id": resolved_vendor_id,
            "raw": raw,
            "status": "failed",
            "error": f"Reasoning LLM call failed: {reasoning_result.get('error')}",
        }

    from app.agents.intake_agent import _safe_json_parse  # reuse shared JSON-extraction helper

    parsed = _safe_json_parse(reasoning_result["content"])
    if parsed is None:
        return {
            "result": None,
            "vendor_id": resolved_vendor_id,
            "raw": raw,
            "status": "failed",
            "error": f"Could not parse liability JSON from model output: {reasoning_result['content']!r}",
        }

    return {"result": parsed, "vendor_id": resolved_vendor_id, "raw": raw, "status": "ok", "error": None}
