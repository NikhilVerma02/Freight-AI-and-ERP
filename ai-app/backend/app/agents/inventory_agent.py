"""
Inventory Agent — pure tool/API-grounded retrieval, no LLM call (the risk
logic is deterministic given live ERP state, same pattern as the rest of
this app's non-reasoning agents).

Pulls the customer's own received-stock inventory for the damaged SKU (how
much of it they actually have on hand right now) and the vendor's warehouse
stock for the same SKU (can the vendor actually resupply), and classifies
risk as safe/warning/critical.

NOTE: the ERP does not yet track a per-SKU daily-consumption rate, so this
is a stock-level heuristic rather than a burn-rate projection:
  - critical: the customer has zero usable stock left after the damage, OR
    the vendor's own stock for that SKU is already below ITS reorder
    threshold (so a resupply request may not be fulfillable soon).
  - warning: some units were damaged and the customer still has stock left,
    but it's now reduced.
  - safe: no units were damaged.
"""
from __future__ import annotations

import logging

from app.mcp_client import ErpMcpClient, McpClientError

logger = logging.getLogger("ai_app.agents.inventory")


async def run_inventory(mcp_client: ErpMcpClient, case: dict) -> dict:
    """case is the Context Structuring Agent's output. Returns
    {result: dict|None, raw: dict, status: 'ok'|'failed', error: str|None}."""
    raw: dict = {"customer_inventory": None, "vendor_inventory": None}

    customer_username = case["customer_username"]
    vendor_username = case["vendor_username"]
    sku = case["sku"]
    damaged_qty = case["damaged_qty"]

    try:
        customer_items = await mcp_client.list_customer_inventory(customer_username, vendor_username)
        raw["customer_inventory"] = customer_items
    except McpClientError as exc:
        return {"result": None, "raw": raw, "status": "failed", "error": f"Customer inventory lookup failed: {exc}"}

    try:
        vendor_items = await mcp_client.list_vendor_inventory(vendor_username)
        raw["vendor_inventory"] = vendor_items
    except McpClientError as exc:
        return {"result": None, "raw": raw, "status": "failed", "error": f"Vendor inventory lookup failed: {exc}"}

    customer_item = next((i for i in customer_items if i.get("sku") == sku), None)
    vendor_item = next((i for i in vendor_items if i.get("sku") == sku), None)

    customer_qty_on_hand = customer_item.get("qty_on_hand", 0) if customer_item else 0
    customer_remaining = max(0, customer_qty_on_hand - damaged_qty)

    vendor_qty_on_hand = vendor_item.get("qty_on_hand", 0) if vendor_item else 0
    vendor_reorder_threshold = vendor_item.get("reorder_threshold", 0) if vendor_item else 0
    vendor_below_threshold = vendor_qty_on_hand < vendor_reorder_threshold

    if damaged_qty == 0:
        risk = "safe"
    elif customer_remaining == 0 or vendor_below_threshold:
        risk = "critical"
    else:
        risk = "warning"

    result = {
        "risk": risk,
        "customer_qty_before_damage": customer_qty_on_hand,
        "customer_qty_after_damage": customer_remaining,
        "vendor_qty_on_hand": vendor_qty_on_hand,
        "vendor_reorder_threshold": vendor_reorder_threshold,
        "vendor_below_threshold": vendor_below_threshold,
    }
    return {"result": result, "raw": raw, "status": "ok", "error": None}
