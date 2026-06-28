"""
POST /api/ingest/run — multipart: vendor/order are picked explicitly on the
upload form (order_id, sku) plus one optional media file (video OR image —
voice input is handled client-side via the browser's speech-to-text and
folded into manual_transcript, so there's no separate audio upload) and/or
a manual_transcript override. Streams the Inspector -> Context -> Policy ->
Inventory -> Reorder -> Claim -> Governance agent pipeline as
Server-Sent Events (one event the instant each agent starts, another the
instant it finishes) so the UI can show live "executing" -> "done" state
per agent instead of waiting for the whole run and faking a staggered
reveal afterwards.

GET /api/ingest/runs[, /{run_id}] — list/inspect past runs.
GET /api/ingest/vendors|customers|orders — pickers for the upload form,
scoped to the caller's own role (customer picks from their linked vendors;
vendor picks from their linked customers; admin can pass either).
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from app.agents.orchestrator import run_pipeline_stream
from app.auth import require_role
from app.logging_store import get_run, list_logs, list_runs
from app.mcp_client import McpClientError, get_erp_mcp_client

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

_MIME_BY_EXTENSION = {
    ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".avi": "video/x-msvideo",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
}


def _guess_mime_type(upload: UploadFile, fallback: str) -> str:
    if upload.content_type and upload.content_type != "application/octet-stream":
        return upload.content_type
    name = (upload.filename or "").lower()
    for ext, mime in _MIME_BY_EXTENSION.items():
        if name.endswith(ext):
            return mime
    return fallback


@router.post("/run")
async def ingest_run(
    order_id: int = Form(...),
    sku: str = Form(...),
    media: UploadFile | None = File(default=None),
    manual_transcript: str | None = Form(default=None),
    current_user: dict = Depends(require_role("admin", "vendor", "customer")),
):
    if not media and not manual_transcript:
        raise HTTPException(status_code=400, detail="Provide a video/image file and/or a description.")

    try:
        mcp_client = get_erp_mcp_client()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"ERP MCP client unavailable: {exc}")

    try:
        order = await mcp_client.get_order_by_id(order_id)
    except McpClientError as exc:
        raise HTTPException(status_code=503, detail=f"Order lookup failed: {exc}")
    if not order:
        raise HTTPException(status_code=404, detail=f"Order {order_id} not found")
    if current_user["role"] == "customer" and order.get("customer_username") != current_user["username"]:
        raise HTTPException(status_code=403, detail="This order does not belong to you")
    if current_user["role"] == "vendor" and order.get("vendor_username") != current_user["username"]:
        raise HTTPException(status_code=403, detail="This order is not one of yours")

    files: list[dict] = []
    if media is not None:
        data = await media.read()
        if data:
            files.append({"data": data, "mime_type": _guess_mime_type(media, "image/jpeg")})

    async def event_stream():
        async for event in run_pipeline_stream(
            mcp_client, order_id, sku, files, manual_transcript,
            actor_username=current_user["username"], actor_role=current_user["role"],
        ):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/vendors")
async def list_vendor_options(current_user: dict = Depends(require_role("admin", "vendor", "customer"))):
    if current_user["role"] != "customer":
        raise HTTPException(status_code=403, detail="Only customers pick a vendor here")
    mcp_client = get_erp_mcp_client()
    try:
        return await mcp_client.list_vendors_for_customer(current_user["username"])
    except McpClientError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/customers")
async def list_customer_options(current_user: dict = Depends(require_role("admin", "vendor", "customer"))):
    if current_user["role"] != "vendor":
        raise HTTPException(status_code=403, detail="Only vendors pick a customer here")
    mcp_client = get_erp_mcp_client()
    try:
        return await mcp_client.list_customers_for_vendor(current_user["username"])
    except McpClientError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/orders")
async def list_order_options(
    vendor_username: str | None = Query(default=None),
    customer_username: str | None = Query(default=None),
    current_user: dict = Depends(require_role("admin", "vendor", "customer")),
):
    """Only delivered orders are eligible for a damage claim — undelivered/requested orders
    haven't reached the customer yet, so there's nothing to inspect for damage."""
    mcp_client = get_erp_mcp_client()
    role = current_user["role"]
    try:
        if role == "customer":
            orders = await mcp_client.list_customer_orders(current_user["username"], vendor_username)
        elif role == "vendor":
            orders = await mcp_client.list_vendor_orders(current_user["username"])
            if customer_username:
                orders = [o for o in orders if o.get("customer_username") == customer_username]
        else:
            # admin
            if customer_username:
                orders = await mcp_client.list_customer_orders(customer_username, vendor_username)
            elif vendor_username:
                orders = await mcp_client.list_vendor_orders(vendor_username)
            else:
                raise HTTPException(status_code=400, detail="Provide vendor_username and/or customer_username")
        return [o for o in orders if o.get("status") == "delivered"]
    except McpClientError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/runs")
async def get_runs(current_user: dict = Depends(require_role("admin", "vendor", "customer"))):
    if current_user["role"] == "admin":
        return list_runs()
    return list_runs(actor_username=current_user["username"])


@router.get("/runs/{run_id}")
async def get_run_detail(run_id: str, current_user: dict = Depends(require_role("admin", "vendor", "customer"))):
    run = get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    if current_user["role"] != "admin" and run.get("actor_username") != current_user["username"]:
        raise HTTPException(status_code=403, detail="Not permitted")
    logs = list_logs(run_id=run_id)
    return {"run": run, "steps": logs}
