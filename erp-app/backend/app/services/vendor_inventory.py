from __future__ import annotations

from app.services.audit_logs import log_action
from app.store import Collection

_inv = Collection("vendor_inventory.json")


def list_inventory(vendor_username: str | None = None) -> list[dict]:
    items = _inv.list_all()
    if vendor_username is not None:
        items = [i for i in items if i.get("vendor_username") == vendor_username]
    return items


def get_item(item_id: int) -> dict | None:
    return _inv.get(item_id)


def get_by_sku(vendor_username: str, sku: str) -> dict | None:
    for i in _inv.list_all():
        if i.get("vendor_username") == vendor_username and i.get("sku") == sku:
            return i
    return None


def create_item(payload: dict, actor: str = "system") -> dict:
    record = _inv.create(payload)
    log_action(actor, "create", "vendor_inventory", record["id"], f"created item {record.get('sku')} for {record.get('vendor_username')}")
    return record


def update_item(item_id: int, patch: dict, actor: str = "system") -> dict | None:
    record = _inv.update(item_id, patch)
    if record:
        log_action(actor, "update", "vendor_inventory", item_id, f"updated item {record.get('sku')}: {patch}")
    return record


def delete_item(item_id: int, actor: str = "system") -> bool:
    ok = _inv.delete(item_id)
    if ok:
        log_action(actor, "delete", "vendor_inventory", item_id, "deleted item")
    return ok
