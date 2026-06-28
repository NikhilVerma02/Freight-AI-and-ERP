from __future__ import annotations

from app.services import alerts as alerts_svc
from app.services import customer_inventory as cust_inv_svc
from app.services import orders as orders_svc
from app.services.audit_logs import log_action
from app.store import Collection

_claims = Collection("claims.json")


def list_claims() -> list[dict]:
    return _claims.list_all()


def list_claims_for(current_user: dict) -> list[dict]:
    role = current_user.get("role")
    username = current_user.get("username")
    claims = _claims.list_all()
    if role == "admin":
        return claims
    if role == "customer":
        return [c for c in claims if c.get("customer_username") == username]
    if role == "vendor":
        return [c for c in claims if c.get("vendor_username") == username]
    return []


def get_claim(claim_id: int) -> dict | None:
    return _claims.get(claim_id)


def _next_claim_number() -> str:
    claims = _claims.list_all()
    n = len(claims) + 1
    while any(c.get("claim_number") == f"CLM-{n:04d}" for c in claims):
        n += 1
    return f"CLM-{n:04d}"


def create_claim(customer_username: str, order_id: int, sku: str, damage_type: str, damaged_qty: int, claim_text: str, actor: str) -> dict:
    """Customer raises a claim against their own order.
    Raises ValueError('order_not_found') or ValueError('forbidden')."""
    order = orders_svc.get_order(order_id)
    if not order:
        raise ValueError("order_not_found")
    if order.get("customer_username") != customer_username:
        raise ValueError("forbidden")

    record = _claims.create(
        {
            "claim_number": _next_claim_number(),
            "customer_username": customer_username,
            "vendor_username": order["vendor_username"],
            "order_id": order_id,
            "sku": sku,
            "damage_type": damage_type,
            "damaged_qty": damaged_qty,
            "claim_text": claim_text,
            "status": "pending",
            "decision_reason": None,
        }
    )
    log_action(actor, "create", "claims", record["id"], f"claim {record['claim_number']} on order {order_id}")
    alerts_svc.create_alert(
        audience="vendor",
        target_username=order["vendor_username"],
        type_="new_claim",
        title=f"New claim {record['claim_number']}",
        message=f"{customer_username} filed claim {record['claim_number']} on order {order.get('order_number')}.",
        related_id=record["id"],
        actor=actor,
    )
    return record


def decide_claim(claim_id: int, vendor_username: str, status: str, decision_reason: str | None, actor: str) -> dict | None:
    """Vendor (must own the claim) approves/rejects. Raises ValueError('forbidden') if not theirs."""
    claim = _claims.get(claim_id)
    if not claim:
        return None
    if claim.get("vendor_username") != vendor_username:
        raise ValueError("forbidden")

    record = _claims.update(claim_id, {"status": status, "decision_reason": decision_reason})
    log_action(actor, "update", "claims", claim_id, f"decision -> {status}: {decision_reason}")

    if status == "approved":
        cust_inv_svc.reduce_qty(
            customer_username=claim["customer_username"],
            vendor_username=claim["vendor_username"],
            sku=claim["sku"],
            qty=claim.get("damaged_qty", 0),
            actor=actor,
        )

    alerts_svc.create_alert(
        audience="customer",
        target_username=claim["customer_username"],
        type_="claim_status_changed",
        title=f"Claim {record['claim_number']} {status}",
        message=f"Claim {record['claim_number']} was {status}." + (f" Reason: {decision_reason}" if decision_reason else ""),
        related_id=claim_id,
        actor=actor,
    )
    return record


def delete_claim(claim_id: int, actor: str = "system") -> bool:
    ok = _claims.delete(claim_id)
    if ok:
        log_action(actor, "delete", "claims", claim_id, "deleted claim")
    return ok
