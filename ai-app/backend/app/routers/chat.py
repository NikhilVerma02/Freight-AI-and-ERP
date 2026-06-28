"""
POST /api/chat — conversational bot. The `chat` model is given a small
toolset that wraps mcp_client methods as OpenAI function-calling tools, so
it can decide to call e.g. get_purchase_order or search_audit_logs to
answer questions like "what's the status of PO 5543" with live ERP data
grounding its answer (tool/API-grounded retrieval — same RAG type used by
the agents, reused here for the chat surface).

Session history persisted to data/chat_sessions.json, keyed by session_id.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import require_role
from app.llm_client import llm_client
from app.mcp_client import McpClientError, get_erp_mcp_client

logger = logging.getLogger("ai_app.routers.chat")
router = APIRouter(prefix="/api/chat", tags=["chat"])

DATA_DIR = Path(__file__).parent.parent.parent / "data"
SESSIONS_PATH = DATA_DIR / "chat_sessions.json"

_lock = threading.Lock()

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_purchase_order",
            "description": "Fetch a purchase order by its PO number, e.g. 'PO-5543'.",
            "parameters": {
                "type": "object",
                "properties": {"po_number": {"type": "string"}},
                "required": ["po_number"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_inventory",
            "description": "List all inventory items currently tracked in the ERP.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_vendor_sla_text",
            "description": "Return the cached extracted SLA text for a given vendor id.",
            "parameters": {
                "type": "object",
                "properties": {"vendor_id": {"type": "integer"}},
                "required": ["vendor_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_audit_logs",
            "description": "Search audit logs by free-text query over action/module/actor/details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "limit": {"type": "integer", "default": 50},
                },
            },
        },
    },
]

SYSTEM_PROMPT = (
    "You are the Freight AI assistant. Answer questions about purchase orders, inventory, "
    "vendors, and audit history using the available tools to ground your answers in live ERP "
    "data. Always call a tool rather than guessing when the question concerns specific PO/"
    "inventory/vendor/audit data. Be concise."
)


class ChatRequest(BaseModel):
    session_id: str | None = None
    message: str
    language: str = "en"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_sessions() -> dict:
    with _lock:
        if not SESSIONS_PATH.exists():
            return {}
        with open(SESSIONS_PATH, "r", encoding="utf-8") as f:
            content = f.read().strip()
            return json.loads(content) if content else {}


def _write_sessions(data: dict) -> None:
    with _lock:
        SESSIONS_PATH.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(dir=str(SESSIONS_PATH.parent), prefix=".chat_sessions.", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, default=str)
            os.replace(tmp_path, SESSIONS_PATH)
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass


async def _execute_tool(name: str, arguments: dict) -> dict | list | str | None:
    mcp_client = get_erp_mcp_client()
    try:
        if name == "get_purchase_order":
            return await mcp_client.get_purchase_order(arguments.get("po_number"))
        if name == "list_inventory":
            return await mcp_client.list_inventory()
        if name == "get_vendor_sla_text":
            return await mcp_client.get_vendor_sla_text(arguments.get("vendor_id"))
        if name == "search_audit_logs":
            return await mcp_client.search_audit_logs(arguments.get("query"), arguments.get("limit", 50))
        return {"error": f"Unknown tool '{name}'"}
    except McpClientError as exc:
        return {"error": str(exc)}


@router.post("")
async def chat(payload: ChatRequest, current_user: dict = Depends(require_role("admin", "vendor", "customer"))):
    sessions = _read_sessions()
    session_id = payload.session_id or f"chat_{uuid.uuid4().hex[:12]}"
    history = sessions.get(session_id, {"created_at": _now_iso(), "messages": []})

    history["messages"].append({"role": "user", "content": payload.message, "timestamp": _now_iso()})

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in history["messages"][-20:]:
        messages.append({"role": m["role"], "content": m["content"]})

    # Tool-calling loop. llm_client.chat()'s normalized envelope only exposes final text
    # content (no raw message/tool_calls), so the loop talks to the OpenAI SDK directly via
    # _run_tool_loop() to access tool_calls, then executes ERP tool calls through mcp_client.
    used_tools: list[dict] = []
    final_content = await _run_tool_loop(messages, used_tools)

    if payload.language and payload.language != "en":
        translate_result = llm_client.chat(
            "translate",
            [
                {"role": "system", "content": f"Translate the following into language code '{payload.language}'. Respond with ONLY the translated text."},
                {"role": "user", "content": final_content},
            ],
            temperature=0,
        )
        if translate_result["status"] == "ok" and translate_result["content"]:
            final_content = translate_result["content"]

    history["messages"].append({"role": "assistant", "content": final_content, "timestamp": _now_iso(), "tools_used": used_tools})
    sessions[session_id] = history
    _write_sessions(sessions)

    return {"session_id": session_id, "reply": final_content, "tools_used": used_tools}


async def _run_tool_loop(messages: list[dict], used_tools: list[dict] | None = None) -> str:
    """Direct OpenAI-SDK tool-calling loop (bypasses llm_client's normalized envelope,
    which only returns final text content — tool_calls need the raw message object)."""
    if llm_client._client is None:
        return "(LLM gateway not configured — cannot run chat tool loop. Set API_ENDPOINT/API_KEY.)"

    from app.config.models import get_model

    model = get_model("chat")
    convo = list(messages)
    for _ in range(4):
        try:
            resp = llm_client._client.chat.completions.create(model=model, messages=convo, tools=TOOLS, tool_choice="auto")
        except Exception as exc:
            logger.error("chat tool loop LLM call failed: %s", exc)
            return f"(LLM gateway error: {exc})"

        msg = resp.choices[0].message
        if not getattr(msg, "tool_calls", None):
            return msg.content or ""

        convo.append({"role": "assistant", "content": msg.content, "tool_calls": [tc.model_dump() for tc in msg.tool_calls]})
        for tc in msg.tool_calls:
            try:
                args = json.loads(tc.function.arguments) if tc.function.arguments else {}
            except json.JSONDecodeError:
                args = {}
            tool_result = await _execute_tool(tc.function.name, args)
            if used_tools is not None:
                used_tools.append({"name": tc.function.name, "arguments": args})
            convo.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(tool_result, default=str),
                }
            )
    return "(Reached max tool-call iterations without a final answer.)"


@router.get("/{session_id}")
async def get_session(session_id: str, current_user: dict = Depends(require_role("admin", "vendor", "customer"))):
    sessions = _read_sessions()
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session_id": session_id, **session}
