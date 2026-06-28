"""Bidirectional, scoped alerts. Every order/claim create or status-change
writes an alert for the counterparty. `audience` + `target_username`
determine visibility: admin sees everything, vendor/customer see only
alerts where target_username == their own username."""
from __future__ import annotations

from app.services.audit_logs import log_action
from app.store import Collection

_alerts = Collection("alerts.json")


def list_alerts() -> list[dict]:
    return _alerts.list_all()


def list_alerts_for(current_user: dict) -> list[dict]:
    role = current_user.get("role")
    username = current_user.get("username")
    alerts = _alerts.list_all()
    if role == "admin":
        return alerts
    return [a for a in alerts if a.get("target_username") == username]


def get_alert(alert_id: int) -> dict | None:
    return _alerts.get(alert_id)


def create_alert(
    audience: str,
    target_username: str | None,
    type_: str,
    title: str,
    message: str,
    related_id: int | None = None,
    actor: str = "system",
) -> dict:
    record = _alerts.create(
        {
            "audience": audience,
            "target_username": target_username,
            "type": type_,
            "title": title,
            "message": message,
            "related_id": related_id,
            "status": "unread",
        }
    )
    log_action(actor, "create", "alerts", record["id"], f"alert to {target_username or audience}: {title}")
    return record


def mark_read(alert_id: int, current_user: dict, actor: str = "system") -> dict | None:
    alert = _alerts.get(alert_id)
    if not alert:
        return None
    if current_user.get("role") != "admin" and alert.get("target_username") != current_user.get("username"):
        return None
    record = _alerts.update(alert_id, {"status": "read"})
    if record:
        log_action(actor, "update", "alerts", alert_id, "marked read")
    return record


def delete_alert(alert_id: int, actor: str = "system") -> bool:
    ok = _alerts.delete(alert_id)
    if ok:
        log_action(actor, "delete", "alerts", alert_id, "deleted alert")
    return ok
