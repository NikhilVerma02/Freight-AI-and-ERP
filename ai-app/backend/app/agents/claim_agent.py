"""
Claim agent — drafts a claim narrative + structured payload via the `agent`
model, submits it to the ERP via mcp_client.create_claim, and (if the
inventory agent flagged manufacturing_halt_risk) also raises an alert via
mcp_client.create_alert. Optionally translates the narrative if
language != "en".
"""
from __future__ import annotations

import logging

from app.llm_client import LLMClient
from app.mcp_client import ErpMcpClient, McpClientError

logger = logging.getLogger("ai_app.agents.claim")

DRAFT_SYSTEM_PROMPT = (
    "You are a freight claims drafting assistant. Given case facts (PO, vendor, damage type, "
    "quantity, liability determination), draft a claim. Respond with ONLY a JSON object with "
    "these exact keys: po_number (string), vendor_id (integer), damage_type (string), "
    "damaged_qty (integer), liable (true, false, or \"partial\" — pass through what you were given), "
    "claim_amount_estimate (number, your best-effort USD estimate; use 0 if not liable), "
    "narrative (string, 3-5 sentences, professional claims-narrative tone). No prose, no markdown fences."
)


async def run_claim(
    mcp_client: ErpMcpClient,
    llm_client: LLMClient,
    po_number: str | None,
    vendor_id: int | None,
    damage_type: str,
    damaged_qty: int | None,
    liability: dict | None,
    manufacturing_halt_risk: bool,
    inventory_result: dict | None,
    language: str = "en",
) -> dict:
    """Returns {claim: dict|None, alert: dict|None, raw: dict, status, error}."""
    raw: dict = {"draft": None, "create_claim": None, "create_alert": None, "translate": None}

    from app.agents.intake_agent import _safe_json_parse

    liable_value = liability.get("liable") if liability else "unknown"
    draft_prompt = (
        f"PO: {po_number}\nVendor ID: {vendor_id}\nDamage type: {damage_type}\n"
        f"Damaged quantity: {damaged_qty}\nLiability determination: {liable_value}\n"
        f"Justification: {liability.get('justification') if liability else 'N/A'}\n\n"
        "Draft the claim per the instructions."
    )
    draft_result = llm_client.chat(
        "agent",
        [{"role": "system", "content": DRAFT_SYSTEM_PROMPT}, {"role": "user", "content": draft_prompt}],
        temperature=0.3,
    )
    raw["draft"] = draft_result

    if draft_result["status"] != "ok":
        return {"claim": None, "alert": None, "raw": raw, "status": "failed", "error": f"Claim drafting LLM call failed: {draft_result.get('error')}"}

    payload = _safe_json_parse(draft_result["content"])
    if payload is None:
        return {"claim": None, "alert": None, "raw": raw, "status": "failed", "error": f"Could not parse claim JSON from model output: {draft_result['content']!r}"}

    # Fill in/normalize fields the model might have gotten wrong, from ground truth we already have.
    payload["po_number"] = po_number or payload.get("po_number")
    payload["vendor_id"] = vendor_id if vendor_id is not None else payload.get("vendor_id")
    payload["damaged_qty"] = damaged_qty if damaged_qty is not None else payload.get("damaged_qty")
    payload["liable"] = liable_value

    if language and language != "en":
        narrative = payload.get("narrative", "")
        translate_result = llm_client.chat(
            "translate",
            [
                {"role": "system", "content": f"Translate the following claim narrative into language code '{language}'. Respond with ONLY the translated text."},
                {"role": "user", "content": narrative},
            ],
            temperature=0,
        )
        raw["translate"] = translate_result
        if translate_result["status"] == "ok" and translate_result["content"]:
            payload["narrative"] = translate_result["content"]
        else:
            logger.warning("Translation failed, keeping English narrative: %s", translate_result.get("error"))

    try:
        claim_record = await mcp_client.create_claim(payload)
        raw["create_claim"] = claim_record
    except McpClientError as exc:
        return {"claim": None, "alert": None, "raw": raw, "status": "failed", "error": f"create_claim MCP call failed: {exc}"}

    alert_record = None
    if manufacturing_halt_risk:
        alert_payload = {
            "type": "manufacturing_halt_risk",
            "po_number": po_number,
            "vendor_id": vendor_id,
            "sku": (inventory_result or {}).get("affected_sku"),
            "current_qty": (inventory_result or {}).get("current_qty"),
            "reorder_threshold": (inventory_result or {}).get("reorder_threshold"),
            "shortfall_qty": (inventory_result or {}).get("shortfall_qty"),
            "message": (
                f"Manufacturing-critical SKU {(inventory_result or {}).get('affected_sku')} projected to fall "
                f"below reorder threshold after damage on {po_number}."
            ),
            "related_claim_id": claim_record.get("id") if claim_record else None,
        }
        try:
            alert_record = await mcp_client.create_alert(alert_payload)
            raw["create_alert"] = alert_record
        except McpClientError as exc:
            # Claim already succeeded; log the alert failure but don't fail the whole step.
            logger.error("create_alert MCP call failed: %s", exc)
            raw["create_alert"] = {"error": str(exc)}

    return {"claim": claim_record, "alert": alert_record, "raw": raw, "status": "ok", "error": None}
