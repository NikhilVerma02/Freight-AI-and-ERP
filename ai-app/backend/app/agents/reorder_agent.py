"""
Reorder Agent — auto-creates a real replacement-stock order with the vendor
for the damaged quantity (no approval step: confirmed product decision is
that this should show up immediately in both portals' Orders pages, same
as a normal order). Skipped entirely if no units were actually damaged.
"""
from __future__ import annotations

import logging

from app import observability
from app.mcp_client import ErpMcpClient, McpClientError
from app.providers import groq_client

logger = logging.getLogger("ai_app.agents.reorder")

NOTE_SYSTEM_PROMPT = (
    "You write a single short, professional note (max one sentence) explaining why a "
    "replacement-stock order was auto-generated for a customer, given the damage case facts. "
    "Respond with ONLY that sentence — no prose, no markdown, no quotes."
)


async def run_reorder(mcp_client: ErpMcpClient, case: dict, inventory_result: dict | None, run_id: str | None = None) -> dict:
    """case is the Context Structuring Agent's output. run_id (optional): threaded down for
    Langfuse tracing — see app/observability.py.
    Returns {order: dict|None, skipped: bool, raw: dict, status: 'ok'|'failed', error: str|None}."""
    raw: dict = {"note": None, "create_order": None}

    damaged_qty = case["damaged_qty"]
    if damaged_qty <= 0:
        return {"order": None, "skipped": True, "raw": raw, "status": "ok", "error": None}

    note_prompt = (
        f"{damaged_qty} unit(s) of '{case['item_name']}' were damaged ({case['damage_type']}) on order "
        f"{case['order_number']}. Inventory risk after damage: {(inventory_result or {}).get('risk', 'unknown')}."
    )
    trace_id = observability.trace_id_for(run_id) if run_id else None
    note_result = groq_client.reasoning_chat(NOTE_SYSTEM_PROMPT, note_prompt, temperature=0.2, trace_id=trace_id, name="reorder_note")
    raw["note"] = note_result
    note = (
        note_result["content"]
        if note_result["status"] == "ok" and note_result["content"]
        else f"Auto-generated to replace {damaged_qty} damaged unit(s) of {case['item_name']}."
    )

    items = [{"sku": case["sku"], "item_name": case["item_name"], "qty": damaged_qty}]
    try:
        order_record = await mcp_client.create_order(case["customer_username"], case["vendor_username"], items)
        raw["create_order"] = order_record
    except McpClientError as exc:
        return {"order": None, "skipped": False, "raw": raw, "status": "failed", "error": f"create_order MCP call failed: {exc}"}

    # The decision to reorder is a deterministic rule (damaged_qty > 0), grounded in the
    # Context Agent's own reconciled facts — so its confidence is inherited rather than
    # independently re-judged here.
    order_record["confidence"] = case.get("confidence", 100)
    return {"order": {**order_record, "reorder_note": note}, "skipped": False, "raw": raw, "status": "ok", "error": None}
