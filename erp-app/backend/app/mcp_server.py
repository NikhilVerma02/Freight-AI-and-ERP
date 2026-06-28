"""
MCP server exposing ERP tools over streamable-HTTP, mounted at /mcp on the
same FastAPI app (port 8001). Every tool calls the SAME service-layer
function used by the REST routers — no duplicated business logic.

NOTE on fastmcp API surface: this targets fastmcp 2.x, where `FastMCP` is
instantiated directly (no separate "low-level server" wrapper needed) and
`mcp.http_app()` returns a Starlette/ASGI app suitable for mounting via
`app.mount("/mcp", mcp_asgi_app)` on a FastAPI instance. If the installed
fastmcp version differs and `http_app()` is unavailable, the fallback is
`mcp.streamable_http_app()` (older naming) — both produce an ASGI app with
the same mounting semantics. See app/main.py for the actual mount call.

SCHEMA NOTE (RBAC migration): tool contracts changed to match the new
admin/vendor/customer schema. See report for the full list of breaking
changes that a future ai-app pass will need to account for.
"""
from __future__ import annotations

from fastmcp import FastMCP

from app.services import alerts as alerts_svc
from app.services import audit_logs as audit_svc
from app.services import claims as claims_svc
from app.services import orders as orders_svc
from app.services import sla as sla_svc
from app.services import vendor_inventory as vendor_inv_svc

mcp = FastMCP("freight-erp")


@mcp.tool()
def list_vendor_inventory(vendor_username: str | None = None) -> list[dict]:
    """List vendor inventory items, optionally filtered to one vendor's stock."""
    return vendor_inv_svc.list_inventory(vendor_username)


@mcp.tool()
def get_order(order_number: str) -> dict | None:
    """Fetch an order by its human-readable order number, e.g. 'ORD-0001'."""
    for o in orders_svc.list_orders():
        if o.get("order_number") == order_number:
            return o
    return None


@mcp.tool()
def update_vendor_inventory_qty(vendor_username: str, sku: str, delta: int, reason: str) -> dict | None:
    """Adjust on-hand quantity for a vendor's SKU by delta (positive or negative). Audit-logged as ai-agent."""
    item = vendor_inv_svc.get_by_sku(vendor_username, sku)
    if not item:
        return None
    new_qty = max(0, item.get("qty_on_hand", 0) + delta)
    record = vendor_inv_svc.update_item(item["id"], {"qty_on_hand": new_qty}, actor="ai-agent")
    audit_svc.log_action("ai-agent", "update_qty", "vendor_inventory", item["id"], f"sku={sku} delta={delta} reason={reason} new_qty={new_qty}")
    return record


@mcp.tool()
def get_vendor_sla_text(vendor_username: str) -> str | None:
    """Return the cached extracted SLA text for a given vendor username."""
    return sla_svc.get_sla_text(vendor_username)


@mcp.tool()
def create_claim(customer_username: str, order_id: int, sku: str, damage_type: str, damaged_qty: int, claim_text: str) -> dict:
    """Create a new claim against a customer's own order. Audit-logged as ai-agent.
    Raises if order is not found or does not belong to customer_username."""
    return claims_svc.create_claim(
        customer_username=customer_username,
        order_id=order_id,
        sku=sku,
        damage_type=damage_type,
        damaged_qty=damaged_qty,
        claim_text=claim_text,
        actor="ai-agent",
    )


@mcp.tool()
def create_alert(audience: str, target_username: str | None, type: str, title: str, message: str, related_id: int | None = None) -> dict:
    """Create a new alert record (status='unread'). audience: admin|vendor|customer. Audit-logged as ai-agent."""
    return alerts_svc.create_alert(
        audience=audience,
        target_username=target_username,
        type_=type,
        title=title,
        message=message,
        related_id=related_id,
        actor="ai-agent",
    )


@mcp.tool()
def search_audit_logs(query: str | None = None, limit: int = 50) -> list[dict]:
    """Search audit logs by free-text query over action/module/actor/details."""
    return audit_svc.search_audit_logs(query, limit)
