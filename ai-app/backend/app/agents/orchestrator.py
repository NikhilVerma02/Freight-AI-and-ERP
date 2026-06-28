"""
Pipeline orchestrator: intake -> policy -> inventory -> claim, run
sequentially. Each step is logged via logging_store.log_step. Only the
intake agent's failure aborts the whole run (nothing downstream has data
without it); policy/inventory/claim failures are logged and the run
continues so the UI can still show whatever succeeded.
"""
from __future__ import annotations

import logging
import time

from app.agents import claim_agent, inventory_agent, intake_agent, policy_agent
from app.llm_client import LLMClient
from app.logging_store import create_run, finish_run, log_step, new_run_id
from app.mcp_client import ErpMcpClient

logger = logging.getLogger("ai_app.agents.orchestrator")


def _tokens_from_envelope(envelope: dict | None) -> dict | None:
    if not envelope:
        return None
    return {
        "prompt_tokens": envelope.get("prompt_tokens"),
        "completion_tokens": envelope.get("completion_tokens"),
    }


async def run_pipeline(
    mcp_client: ErpMcpClient,
    llm_client: LLMClient,
    video_path: str | None,
    manual_transcript: str | None,
    language: str = "en",
) -> dict:
    run_id = new_run_id()
    case_summary = (manual_transcript or (f"video: {video_path}" if video_path else "no input"))[:200]
    create_run(run_id, case_summary)

    result: dict = {
        "run_id": run_id,
        "status": "running",
        "intake": None,
        "policy": None,
        "inventory": None,
        "claim": None,
    }

    # ---------------- Intake ----------------
    t0 = time.perf_counter()
    try:
        intake_out = await intake_agent.run_intake(llm_client, video_path, manual_transcript)
    except Exception as exc:
        logger.exception("intake_agent raised unexpectedly")
        intake_out = {"extracted": None, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    extract_envelope = (intake_out.get("raw") or {}).get("extract")
    log_step(
        run_id, "intake_agent",
        input_summary={"video_path": video_path, "manual_transcript": bool(manual_transcript)},
        output_summary=intake_out.get("extracted"),
        status=intake_out["status"],
        latency_ms=latency_ms,
        model=extract_envelope.get("model") if extract_envelope else None,
        tokens=_tokens_from_envelope(extract_envelope),
        error=intake_out.get("error"),
    )
    result["intake"] = intake_out

    if intake_out["status"] != "ok":
        result["status"] = "failed"
        finish_run(run_id, "failed")
        return result

    extracted = intake_out["extracted"] or {}
    po_number = extracted.get("po_number")
    item_type = extracted.get("item_type", "")
    damage_type = extracted.get("damage_type", "")
    damaged_qty = extracted.get("damaged_qty")

    overall_status = "completed"

    # ---------------- Policy ----------------
    t0 = time.perf_counter()
    try:
        policy_out = await policy_agent.run_policy(mcp_client, llm_client, po_number, None, damage_type, item_type, damaged_qty)
    except Exception as exc:
        logger.exception("policy_agent raised unexpectedly")
        policy_out = {"result": None, "vendor_id": None, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    reasoning_envelope = (policy_out.get("raw") or {}).get("reasoning")
    log_step(
        run_id, "policy_agent",
        input_summary={"po_number": po_number, "damage_type": damage_type, "item_type": item_type},
        output_summary=policy_out.get("result"),
        status=policy_out["status"],
        latency_ms=latency_ms,
        model=reasoning_envelope.get("model") if reasoning_envelope else None,
        tokens=_tokens_from_envelope(reasoning_envelope),
        error=policy_out.get("error"),
    )
    result["policy"] = policy_out
    if policy_out["status"] != "ok":
        overall_status = "partial"

    # ---------------- Inventory ----------------
    t0 = time.perf_counter()
    try:
        inventory_out = await inventory_agent.run_inventory(mcp_client, po_number, item_type, damaged_qty)
    except Exception as exc:
        logger.exception("inventory_agent raised unexpectedly")
        inventory_out = {"result": None, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    log_step(
        run_id, "inventory_agent",
        input_summary={"po_number": po_number, "item_type": item_type, "damaged_qty": damaged_qty},
        output_summary=inventory_out.get("result"),
        status=inventory_out["status"],
        latency_ms=latency_ms,
        model=None,
        tokens=None,
        error=inventory_out.get("error"),
    )
    result["inventory"] = inventory_out
    if inventory_out["status"] != "ok":
        overall_status = "partial"

    # ---------------- Claim ----------------
    vendor_id = policy_out.get("vendor_id")
    liability = policy_out.get("result")
    manufacturing_halt_risk = bool((inventory_out.get("result") or {}).get("manufacturing_halt_risk"))

    t0 = time.perf_counter()
    try:
        claim_out = await claim_agent.run_claim(
            mcp_client, llm_client, po_number, vendor_id, damage_type, damaged_qty,
            liability, manufacturing_halt_risk, inventory_out.get("result"), language,
        )
    except Exception as exc:
        logger.exception("claim_agent raised unexpectedly")
        claim_out = {"claim": None, "alert": None, "raw": {}, "status": "failed", "error": str(exc)}
    latency_ms = (time.perf_counter() - t0) * 1000

    draft_envelope = (claim_out.get("raw") or {}).get("draft")
    log_step(
        run_id, "claim_agent",
        input_summary={"po_number": po_number, "vendor_id": vendor_id, "manufacturing_halt_risk": manufacturing_halt_risk},
        output_summary={"claim": claim_out.get("claim"), "alert": claim_out.get("alert")},
        status=claim_out["status"],
        latency_ms=latency_ms,
        model=draft_envelope.get("model") if draft_envelope else None,
        tokens=_tokens_from_envelope(draft_envelope),
        error=claim_out.get("error"),
    )
    result["claim"] = claim_out
    if claim_out["status"] != "ok":
        overall_status = "partial"

    result["status"] = overall_status
    claim_id = (claim_out.get("claim") or {}).get("id") if claim_out.get("claim") else None
    alert_id = (claim_out.get("alert") or {}).get("id") if claim_out.get("alert") else None
    finish_run(run_id, overall_status, claim_id=claim_id, alert_id=alert_id)
    return result
