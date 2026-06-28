"""customer_vendor_links.json — admin-managed relationship table; source of
truth for "who can order/claim from whom" and "vendor's customer list."""
from __future__ import annotations

from app.services.audit_logs import log_action
from app.store import Collection, now_iso

_links = Collection("customer_vendor_links.json")


def list_links() -> list[dict]:
    return _links.list_all()


def get_link(link_id: int) -> dict | None:
    return _links.get(link_id)


def is_linked(customer_username: str, vendor_username: str) -> bool:
    return any(
        l.get("customer_username") == customer_username and l.get("vendor_username") == vendor_username
        for l in _links.list_all()
    )


def get_link_by_pair(customer_username: str, vendor_username: str) -> dict | None:
    return next(
        (
            l
            for l in _links.list_all()
            if l.get("customer_username") == customer_username and l.get("vendor_username") == vendor_username
        ),
        None,
    )


def vendors_for_customer(customer_username: str) -> list[str]:
    return [l["vendor_username"] for l in _links.list_all() if l.get("customer_username") == customer_username]


def customers_for_vendor(vendor_username: str) -> list[str]:
    return [l["customer_username"] for l in _links.list_all() if l.get("vendor_username") == vendor_username]


def create_link(customer_username: str, vendor_username: str, actor: str = "system") -> dict:
    if is_linked(customer_username, vendor_username):
        existing = next(
            l for l in _links.list_all()
            if l.get("customer_username") == customer_username and l.get("vendor_username") == vendor_username
        )
        return existing
    record = _links.create(
        {
            "customer_username": customer_username,
            "vendor_username": vendor_username,
            "linked_at": now_iso(),
        }
    )
    log_action(actor, "create", "customer_vendor_links", record["id"], f"linked {customer_username} <-> {vendor_username}")
    return record


def set_links_for_customer(customer_username: str, vendor_usernames: list[str], actor: str = "system") -> list[dict]:
    """Replace all links for a customer with the given vendor set."""
    current = [l for l in _links.list_all() if l.get("customer_username") == customer_username]
    for l in current:
        if l.get("vendor_username") not in vendor_usernames:
            _links.delete(l["id"])
            log_action(actor, "delete", "customer_vendor_links", l["id"], f"unlinked {customer_username} <-> {l.get('vendor_username')}")
    results = []
    for vendor_username in vendor_usernames:
        results.append(create_link(customer_username, vendor_username, actor=actor))
    return results


def delete_link(link_id: int, actor: str = "system") -> bool:
    ok = _links.delete(link_id)
    if ok:
        log_action(actor, "delete", "customer_vendor_links", link_id, "deleted link")
    return ok
