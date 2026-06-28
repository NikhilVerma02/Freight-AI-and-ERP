"""Audit log service. Append-only — every other service calls log_action()."""
from __future__ import annotations

from app.store import Collection, now_iso

_audit = Collection("audit_logs.json")


def list_audit_logs() -> list[dict]:
    return _audit.list_all()


def get_audit_log(log_id: int) -> dict | None:
    return _audit.get(log_id)


def search_audit_logs(query: str | None = None, limit: int = 50) -> list[dict]:
    logs = _audit.list_all()
    if query:
        q = query.lower()
        logs = [
            l for l in logs
            if q in str(l.get("action", "")).lower()
            or q in str(l.get("module", "")).lower()
            or q in str(l.get("actor", "")).lower()
            or q in str(l.get("details", "")).lower()
        ]
    logs = sorted(logs, key=lambda l: l.get("timestamp", ""), reverse=True)
    return logs[:limit]


def log_action(actor: str, action: str, module: str, record_id: int | None, details: str) -> dict:
    """Append an audit log entry. actor = username or 'ai-agent'."""
    return _audit.append_raw(
        {
            "timestamp": now_iso(),
            "actor": actor,
            "action": action,
            "module": module,
            "record_id": record_id,
            "details": details,
        }
    )
