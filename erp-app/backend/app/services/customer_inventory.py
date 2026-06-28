from __future__ import annotations

from app.services.audit_logs import log_action
from app.store import Collection

_inv = Collection("customer_inventory.json")


def list_inventory(customer_username: str | None = None) -> list[dict]:
    items = _inv.list_all()
    if customer_username is not None:
        items = [i for i in items if i.get("customer_username") == customer_username]
    return items


def get_item(item_id: int) -> dict | None:
    return _inv.get(item_id)


def get_by_sku(customer_username: str, vendor_username: str, sku: str) -> dict | None:
    for i in _inv.list_all():
        if (
            i.get("customer_username") == customer_username
            and i.get("vendor_username") == vendor_username
            and i.get("sku") == sku
        ):
            return i
    return None


def add_qty(customer_username: str, vendor_username: str, sku: str, item_name: str, qty: int, actor: str = "system") -> dict:
    """Increment (or create) the customer's holding for a sku from a given vendor."""
    existing = get_by_sku(customer_username, vendor_username, sku)
    if existing:
        new_qty = existing.get("qty_on_hand", 0) + qty
        record = _inv.update(existing["id"], {"qty_on_hand": new_qty})
        log_action(actor, "update_qty", "customer_inventory", existing["id"], f"+{qty} -> {new_qty} for {customer_username}/{sku}")
        return record
    record = _inv.create(
        {
            "customer_username": customer_username,
            "vendor_username": vendor_username,
            "sku": sku,
            "item_name": item_name,
            "qty_on_hand": qty,
        }
    )
    log_action(actor, "create", "customer_inventory", record["id"], f"created {sku} qty={qty} for {customer_username}")
    return record


def reduce_qty(customer_username: str, vendor_username: str, sku: str, qty: int, actor: str = "system") -> dict | None:
    """Write off damaged qty (e.g. on claim approval). Clamps at 0."""
    existing = get_by_sku(customer_username, vendor_username, sku)
    if not existing:
        return None
    new_qty = max(0, existing.get("qty_on_hand", 0) - qty)
    record = _inv.update(existing["id"], {"qty_on_hand": new_qty})
    log_action(actor, "update_qty", "customer_inventory", existing["id"], f"-{qty} -> {new_qty} for {customer_username}/{sku}")
    return record


def delete_item(item_id: int, actor: str = "system") -> bool:
    ok = _inv.delete(item_id)
    if ok:
        log_action(actor, "delete", "customer_inventory", item_id, "deleted item")
    return ok
