"""
POST /api/ingest/run — multipart: optional video file + optional
manual_transcript text + optional language. Runs the full agent pipeline.
GET /api/ingest/runs[, /{run_id}] — list/inspect past runs.
"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.agents.orchestrator import run_pipeline
from app.auth import require_role
from app.llm_client import llm_client
from app.logging_store import get_run, list_logs, list_runs
from app.mcp_client import get_erp_mcp_client

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

TEMP_UPLOADS_DIR = Path(__file__).parent.parent.parent / "data" / "temp_uploads"


@router.post("/run")
async def ingest_run(
    video: UploadFile | None = File(default=None),
    manual_transcript: str | None = Form(default=None),
    language: str = Form(default="en"),
    current_user: dict = Depends(require_role("admin", "vendor", "customer")),
):
    if not video and not manual_transcript:
        raise HTTPException(status_code=400, detail="Provide either a video file or manual_transcript.")

    video_path = None
    if video is not None:
        TEMP_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        suffix = Path(video.filename or "upload").suffix or ".mp4"
        video_path = str(TEMP_UPLOADS_DIR / f"upload_{uuid.uuid4().hex[:10]}{suffix}")
        content = await video.read()
        with open(video_path, "wb") as f:
            f.write(content)

    try:
        mcp_client = get_erp_mcp_client()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"ERP MCP client unavailable: {exc}")

    result = await run_pipeline(mcp_client, llm_client, video_path, manual_transcript, language)
    return result


@router.get("/runs")
async def get_runs(current_user: dict = Depends(require_role("admin", "vendor", "customer"))):
    return list_runs()


@router.get("/runs/{run_id}")
async def get_run_detail(run_id: str, current_user: dict = Depends(require_role("admin", "vendor", "customer"))):
    run = get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    logs = list_logs(run_id=run_id)
    return {"run": run, "steps": logs}
