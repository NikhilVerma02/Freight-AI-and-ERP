"""
Context Structuring Agent — cleans/validates the Inspector Agent's raw
extraction and merges it with ground-truth order data (already known from
the upload form, not extracted) into one normalized case object that every
downstream agent (Policy/Inventory/Reorder/Claim/Governance) consumes.

Deterministic validation (qty clamping, damage-type normalization) happens
in code; a single Groq call is used only to produce a clean one-paragraph
case summary for the claim narrative/dashboard — keeping the
business-critical validation out of the LLM's hands.
"""
from __future__ import annotations

import logging

from app import observability
from app.providers import groq_client

logger = logging.getLogger("ai_app.agents.context")

CANONICAL_DAMAGE_TYPES = ["moisture damage", "crushing", "impact", "shortage", "other"]

_DAMAGE_KEYWORDS = {
    "moisture damage": ["water", "moisture", "wet", "damp", "humid", "rain", "flood"],
    "crushing": ["crush", "compress", "flatten", "squash"],
    "impact": ["impact", "drop", "dropped", "collision", "broken", "shatter", "smash", "puncture"],
    "shortage": ["shortage", "missing", "short", "not delivered", "count mismatch"],
}


def _normalize_damage_type(raw_damage_type: str | None) -> str:
    text = (raw_damage_type or "").lower()
    for canonical, keywords in _DAMAGE_KEYWORDS.items():
        if any(k in text for k in keywords):
            return canonical
    return "other"


SUMMARY_SYSTEM_PROMPT = (
    "You write a single concise, professional sentence summarizing a freight damage case for "
    "an internal claims dashboard, given structured case facts. Respond with ONLY that sentence "
    "— no prose, no markdown, no quotes."
)


async def run_context_structuring(
    inspector_extracted: dict,
    order: dict,
    sku: str,
    run_id: str | None = None,
) -> dict:
    """order is the ERP order record (already resolved from order_id chosen on the upload form).
    run_id (optional): threaded down for Langfuse tracing — see app/observability.py.
    Returns {case: dict|None, raw: dict, status: 'ok'|'failed', error: str|None}."""
    raw: dict = {"summary": None}

    item = next((i for i in order.get("items", []) if i.get("sku") == sku), None)
    if item is None:
        return {
            "case": None,
            "raw": raw,
            "status": "failed",
            "error": f"SKU '{sku}' is not a line item on order {order.get('order_number')}.",
        }
    ordered_qty = item.get("qty", 0)

    raw_damaged_qty = inspector_extracted.get("damaged_qty")
    try:
        damaged_qty = int(raw_damaged_qty) if raw_damaged_qty is not None else 0
    except (TypeError, ValueError):
        damaged_qty = 0
    damaged_qty = max(0, damaged_qty)
    qty_was_clamped = damaged_qty > ordered_qty
    if qty_was_clamped:
        damaged_qty = ordered_qty

    damage_type = _normalize_damage_type(inspector_extracted.get("damage_type"))

    # Cross-check only — the order/SKU picked on the upload form (order, sku params above)
    # is always the ground truth used to file the claim. This just flags a likely
    # wrong-order upload if the customer mentioned a different PO/order number on camera.
    stated_po_number = inspector_extracted.get("po_number")
    po_number_mismatch = bool(
        stated_po_number and stated_po_number.strip().lower() != (order.get("order_number") or "").lower()
    )

    case = {
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "customer_username": order.get("customer_username"),
        "vendor_username": order.get("vendor_username"),
        "sku": sku,
        "item_name": item.get("item_name"),
        "ordered_qty": ordered_qty,
        "damaged_qty": damaged_qty,
        "damage_type": damage_type,
        "evidence_notes": inspector_extracted.get("evidence_notes") or "",
        "confidence_notes": inspector_extracted.get("confidence_notes") or "",
        "stated_po_number": stated_po_number,
        "po_number_mismatch": po_number_mismatch,
        "needs_review": damaged_qty == 0 or qty_was_clamped or po_number_mismatch,
        "qty_was_clamped": qty_was_clamped,
    }

    summary_prompt = (
        f"Order {case['order_number']}, item '{case['item_name']}' (SKU {sku}), "
        f"{damaged_qty} of {ordered_qty} units damaged. Damage type: {damage_type}. "
        f"Evidence notes: {case['evidence_notes'] or 'none'}."
    )
    trace_id = observability.trace_id_for(run_id) if run_id else None
    summary_result = groq_client.reasoning_chat(
        SUMMARY_SYSTEM_PROMPT, summary_prompt, temperature=0.2, trace_id=trace_id, name="context_summary"
    )
    raw["summary"] = summary_result
    case["case_summary"] = (
        summary_result["content"]
        if summary_result["status"] == "ok" and summary_result["content"]
        else f"{damaged_qty} unit(s) of {case['item_name']} damaged ({damage_type}) on order {case['order_number']}."
    )

    return {"case": case, "raw": raw, "status": "ok", "error": None}
