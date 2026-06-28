"""
Inventory agent — pure tool/API-grounded retrieval (no LLM call needed
here, the logic is deterministic given live ERP state). Pulls the PO and
current inventory via mcp_client, matches the damaged item's SKU, and
computes shortfall + manufacturing-halt risk.
"""
from __future__ import annotations

import logging

from app.mcp_client import ErpMcpClient, McpClientError

logger = logging.getLogger("ai_app.agents.inventory")


def _match_sku(po_record: dict, item_type: str) -> str | None:
    """Best-effort match of the extracted item_type string to a PO line-item SKU/name."""
    items = po_record.get("items", []) if po_record else []
    if not items:
        return None
    item_type_lower = (item_type or "").lower()
    for item in items:
        name = (item.get("item_name") or "").lower()
        if item_type_lower and (item_type_lower in name or name in item_type_lower):
            return item.get("sku")
    # Fallback: keyword overlap
    for item in items:
        name = (item.get("item_name") or "").lower()
        if any(word in name for word in item_type_lower.split() if len(word) > 3):
            return item.get("sku")
    # Last resort: first line item
    return items[0].get("sku") if items else None


async def run_inventory(
    mcp_client: ErpMcpClient,
    po_number: str | None,
    item_type: str,
    damaged_qty: int | None,
) -> dict:
    """Returns {result: dict|None, raw: dict, status, error}."""
    raw: dict = {"po_lookup": None, "inventory_list": None}

    if not po_number:
        return {"result": None, "raw": raw, "status": "failed", "error": "No po_number available to look up PO/inventory."}

    try:
        po_record = await mcp_client.get_purchase_order(po_number)
        raw["po_lookup"] = po_record
    except McpClientError as exc:
        return {"result": None, "raw": raw, "status": "failed", "error": f"PO lookup failed: {exc}"}

    if not po_record:
        return {"result": None, "raw": raw, "status": "failed", "error": f"PO '{po_number}' not found in ERP."}

    sku = _match_sku(po_record, item_type)
    if not sku:
        return {"result": None, "raw": raw, "status": "failed", "error": "Could not match damaged item_type to a PO line-item SKU."}

    try:
        inventory_list = await mcp_client.list_inventory()
        raw["inventory_list"] = inventory_list
    except McpClientError as exc:
        return {"result": None, "raw": raw, "status": "failed", "error": f"Inventory listing failed: {exc}"}

    item = next((i for i in inventory_list if i.get("sku") == sku), None)
    if not item:
        return {"result": None, "raw": raw, "status": "failed", "error": f"SKU '{sku}' not found in current inventory."}

    qty_on_hand = item.get("qty_on_hand", 0)
    reorder_threshold = item.get("reorder_threshold", 0)
    manufacturing_critical = item.get("manufacturing_critical", False)
    damaged_qty = damaged_qty or 0

    shortfall_qty = max(0, reorder_threshold - (qty_on_hand - damaged_qty))
    projected_qty = qty_on_hand - damaged_qty
    manufacturing_halt_risk = bool(manufacturing_critical and projected_qty < reorder_threshold)

    result = {
        "shortfall_qty": shortfall_qty,
        "manufacturing_halt_risk": manufacturing_halt_risk,
        "affected_sku": sku,
        "current_qty": qty_on_hand,
        "reorder_threshold": reorder_threshold,
        "projected_qty_after_damage": projected_qty,
        "manufacturing_critical": manufacturing_critical,
    }
    return {"result": result, "raw": raw, "status": "ok", "error": None}
