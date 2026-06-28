from __future__ import annotations

from app.services import alerts as alerts_svc
from app.services import customer_inventory as cust_inv_svc
from app.services import links as links_svc
from app.services.audit_logs import log_action
from app.store import Collection, now_iso

_orders = Collection("orders.json")


def list_orders() -> list[dict]:
    return _orders.list_all()


def list_orders_for(current_user: dict) -> list[dict]:
    role = current_user.get("role")
    username = current_user.get("username")
    orders = _orders.list_all()
    if role == "admin":
        return orders
    if role == "customer":
        return [o for o in orders if o.get("customer_username") == username]
    if role == "vendor":
        return [o for o in orders if o.get("vendor_username") == username]
    return []


def get_order(order_id: int) -> dict | None:
    return _orders.get(order_id)


def _next_order_number() -> str:
    orders = _orders.list_all()
    n = len(orders) + 1
    while any(o.get("order_number") == f"ORD-{n:04d}" for o in orders):
        n += 1
    return f"ORD-{n:04d}"


def create_order(customer_username: str, vendor_username: str, items: list[dict], actor: str) -> dict:
    """Customer creates an order against a linked vendor. Raises ValueError('not_linked') if not linked."""
    if not links_svc.is_linked(customer_username, vendor_username):
        raise ValueError("not_linked")
    record = _orders.create(
        {
            "order_number": _next_order_number(),
            "customer_username": customer_username,
            "vendor_username": vendor_username,
            "items": items,
            "status": "requested",
            "undelivered_reason": None,
            "requested_at": now_iso(),
        }
    )
    log_action(actor, "create", "orders", record["id"], f"order {record['order_number']} {customer_username} -> {vendor_username}")
    alerts_svc.create_alert(
        audience="vendor",
        target_username=vendor_username,
        type_="new_order",
        title=f"New order {record['order_number']}",
        message=f"{customer_username} placed order {record['order_number']}.",
        related_id=record["id"],
        actor=actor,
    )
    return record


def update_status(order_id: int, vendor_username: str, status: str, undelivered_reason: str | None, actor: str) -> dict | None:
    """Vendor (must own the order) updates status. Returns None if not found.
    Raises ValueError('forbidden') if order belongs to a different vendor."""
    order = _orders.get(order_id)
    if not order:
        return None
    if order.get("vendor_username") != vendor_username:
        raise ValueError("forbidden")
    patch: dict = {"status": status}
    if status == "undelivered":
        patch["undelivered_reason"] = undelivered_reason
    else:
        patch["undelivered_reason"] = None
    record = _orders.update(order_id, patch)
    log_action(actor, "update", "orders", order_id, f"status -> {status}")

    if status == "delivered":
        for item in record.get("items", []):
            cust_inv_svc.add_qty(
                customer_username=record["customer_username"],
                vendor_username=record["vendor_username"],
                sku=item.get("sku"),
                item_name=item.get("item_name"),
                qty=item.get("qty", 0),
                actor=actor,
            )

    alerts_svc.create_alert(
        audience="customer",
        target_username=record["customer_username"],
        type_="order_status_changed",
        title=f"Order {record['order_number']} {status}",
        message=f"Order {record['order_number']} is now {status}." + (f" Reason: {undelivered_reason}" if undelivered_reason else ""),
        related_id=order_id,
        actor=actor,
    )
    return record


def delete_order(order_id: int, actor: str = "system") -> bool:
    ok = _orders.delete(order_id)
    if ok:
        log_action(actor, "delete", "orders", order_id, "deleted order")
    return ok
