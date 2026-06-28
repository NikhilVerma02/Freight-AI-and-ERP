"""
GET /api/claims, GET /api/orders — read-only listings backing the AI
portal's "Claim Request" / "Order Request" tabs: every claim/order the
agent pipeline has filed/placed for the current user, full status history
included (unlike /api/ingest/orders, which is the case-intake SKU picker
and deliberately filters to delivered-only orders).

Role-scoped: customer sees their own; vendor sees the ones against them.
There's no "list everything" ERP tool (no admin-wide use case for this yet),
so admin gets a clear 501 rather than a silently empty list.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_role
from app.mcp_client import McpClientError, get_erp_mcp_client

router = APIRouter(prefix="/api", tags=["records"])


@router.get("/claims")
async def list_claims(current_user: dict = Depends(require_role("admin", "vendor", "customer"))):
    mcp_client = get_erp_mcp_client()
    role = current_user["role"]
    try:
        if role == "customer":
            return await mcp_client.list_customer_claims(current_user["username"])
        if role == "vendor":
            return await mcp_client.list_vendor_claims(current_user["username"])
        raise HTTPException(status_code=501, detail="Admin-wide claim listing isn't available yet")
    except McpClientError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/orders")
async def list_orders(current_user: dict = Depends(require_role("admin", "vendor", "customer"))):
    mcp_client = get_erp_mcp_client()
    role = current_user["role"]
    try:
        if role == "customer":
            return await mcp_client.list_customer_orders(current_user["username"])
        if role == "vendor":
            return await mcp_client.list_vendor_orders(current_user["username"])
        raise HTTPException(status_code=501, detail="Admin-wide order listing isn't available yet")
    except McpClientError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
