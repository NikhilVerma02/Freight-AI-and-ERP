"""GET /api/observability/api-logs — admin-only view of the local API-call log
(see app/middleware.py). Mirrors the existing search_audit_logs pattern."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.auth import require_role
from app.middleware import list_api_logs

router = APIRouter(prefix="/api/observability", tags=["observability"])


@router.get("/api-logs")
def get_api_logs(limit: int = Query(default=100, le=500), current_user: dict = Depends(require_role("admin"))):
    return list_api_logs(limit=limit)
