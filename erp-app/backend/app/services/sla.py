"""Vendor SLA documents — one record per upload, each targeted at the
customer(s) the vendor selects. Documents only exist once a vendor uploads
one via app/routers/vendors.py; nothing here is pre-seeded."""
from __future__ import annotations

from pathlib import Path

from pypdf import PdfReader

from app.rag import sla_rag
from app.services import links as links_svc
from app.services.audit_logs import log_action
from app.store import DATA_DIR, Collection, now_iso

SLA_DIR = DATA_DIR / "sla_documents"

_sla = Collection("vendor_sla.json")


def extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    return "\n\n".join(page.extract_text() or "" for page in reader.pages)


def list_slas() -> list[dict]:
    return _sla.list_all()


def get_sla_by_id(sla_id: int) -> dict | None:
    return _sla.get(sla_id)


def list_slas_for_vendor(vendor_username: str) -> list[dict]:
    return [s for s in _sla.list_all() if s.get("vendor_username") == vendor_username]


def list_slas_for(current_user: dict) -> list[dict]:
    role = current_user.get("role")
    username = current_user.get("username")
    all_slas = _sla.list_all()
    if role == "admin":
        return all_slas
    if role == "vendor":
        return [s for s in all_slas if s.get("vendor_username") == username]
    if role == "customer":
        linked_vendors = set(links_svc.vendors_for_customer(username))
        return [
            s
            for s in all_slas
            if s.get("vendor_username") in linked_vendors and username in (s.get("customer_usernames") or [])
        ]
    return []


def can_access_sla(sla: dict, current_user: dict) -> bool:
    role = current_user.get("role")
    username = current_user.get("username")
    if role == "admin":
        return True
    if role == "vendor":
        return sla.get("vendor_username") == username
    if role == "customer":
        return username in (sla.get("customer_usernames") or []) and links_svc.is_linked(username, sla.get("vendor_username"))
    return False


def upsert_sla(
    vendor_username: str,
    filename: str,
    text: str,
    liability_summary: str,
    customer_usernames: list[str],
    actor: str = "system",
) -> dict:
    record = _sla.create(
        {
            "vendor_username": vendor_username,
            "customer_usernames": customer_usernames,
            "sla_document_filename": filename,
            "sla_text_cache": text,
            "liability_summary": liability_summary,
            "uploaded_at": now_iso(),
        }
    )
    log_action(
        actor,
        "upsert",
        "vendor_sla",
        record["id"],
        f"SLA uploaded for {vendor_username} -> {customer_usernames} ({filename})",
    )
    index_status = sla_rag.index_sla(record["id"], vendor_username, text)
    if not index_status["indexed"]:
        log_action(actor, "rag_index_failed", "vendor_sla", record["id"], index_status.get("error") or "unknown error")
    return record


def get_sla_text(sla_id: int) -> str | None:
    record = _sla.get(sla_id)
    return record.get("sla_text_cache") if record else None


def delete_sla(sla_id: int, actor: str = "system") -> bool:
    record = _sla.get(sla_id)
    if not record:
        return False
    filename = record.get("sla_document_filename")
    if filename:
        path = SLA_DIR / filename
        if path.exists():
            path.unlink()
    deleted = _sla.delete(sla_id)
    if deleted:
        sla_rag.delete_sla_index(sla_id)
        log_action(actor, "delete", "vendor_sla", sla_id, f"SLA deleted for {record.get('vendor_username')}")
    return deleted
