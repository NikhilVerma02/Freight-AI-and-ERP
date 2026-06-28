"""
MCP client for talking to the ERP's streamable-HTTP MCP server (mounted at
ERP_MCP_URL, default http://127.0.0.1:8001/mcp/). Opens one persistent
ClientSession at FastAPI startup (see app/main.py lifespan) and exposes a
typed async wrapper method per ERP tool for the agents to call.

This is the "tool/API-grounded RAG" surface of the app: agents pull live
ERP state (inventory, purchase orders, SLA text, audit logs) through these
typed calls instead of embeddings — no vector store involved for this data.
The embedding-based RAG type lives in app/rag/ (SLA document chunks only).
"""
from __future__ import annotations

import json
import logging
from contextlib import AsyncExitStack
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

logger = logging.getLogger("ai_app.mcp_client")


class McpClientError(Exception):
    """Raised when the MCP connection or a tool call fails. Caught per-agent by the orchestrator."""


def _unwrap_result(result: Any) -> Any:
    """Unwrap a CallToolResult into a plain Python value.

    Prefers `structuredContent` (fastmcp populates this for dict/list
    returns); falls back to parsing the first TextContent block as JSON,
    then to its raw text.
    """
    if getattr(result, "isError", False):
        text = ""
        for block in getattr(result, "content", []) or []:
            text += getattr(block, "text", "") or ""
        raise McpClientError(f"MCP tool call returned an error: {text or result}")

    structured = getattr(result, "structuredContent", None)
    if structured is not None:
        # fastmcp wraps bare list/scalar returns as {"result": ...}
        if isinstance(structured, dict) and set(structured.keys()) == {"result"}:
            return structured["result"]
        return structured

    content = getattr(result, "content", None) or []
    if content:
        first = content[0]
        text = getattr(first, "text", None)
        if text is not None:
            try:
                return json.loads(text)
            except (json.JSONDecodeError, TypeError):
                return text
    return None


class ErpMcpClient:
    """Persistent MCP client session against the ERP's /mcp endpoint."""

    def __init__(self, url: str):
        self.url = url
        self._stack: AsyncExitStack | None = None
        self.session: ClientSession | None = None

    async def connect(self) -> None:
        if self.session is not None:
            return
        self._stack = AsyncExitStack()
        try:
            read_stream, write_stream, _get_session_id = await self._stack.enter_async_context(
                streamablehttp_client(self.url)
            )
            session = await self._stack.enter_async_context(ClientSession(read_stream, write_stream))
            await session.initialize()
            self.session = session
            logger.info("Connected to ERP MCP server at %s", self.url)
        except Exception as exc:
            await self._stack.aclose()
            self._stack = None
            self.session = None
            logger.error("Failed to connect to ERP MCP server at %s: %s", self.url, exc)
            raise McpClientError(f"Could not connect to ERP MCP server at {self.url}: {exc}") from exc

    async def close(self) -> None:
        if self._stack is not None:
            await self._stack.aclose()
        self._stack = None
        self.session = None

    async def _call(self, name: str, arguments: dict | None = None) -> Any:
        if self.session is None:
            raise McpClientError("MCP session is not connected. Call connect() first (or check startup logs).")
        try:
            result = await self.session.call_tool(name, arguments or {})
            return _unwrap_result(result)
        except McpClientError:
            raise
        except Exception as exc:
            logger.error("MCP tool call '%s' failed: %s", name, exc)
            raise McpClientError(f"MCP tool call '{name}' failed: {exc}") from exc

    # ------------------------------------------------------------------
    # Typed wrappers, one per ERP MCP tool.
    # ------------------------------------------------------------------
    async def list_inventory(self) -> list[dict]:
        return await self._call("list_inventory")

    async def get_purchase_order(self, po_number: str) -> dict | None:
        return await self._call("get_purchase_order", {"po_number": po_number})

    async def update_inventory_qty(self, sku: str, delta: int, reason: str) -> dict | None:
        return await self._call("update_inventory_qty", {"sku": sku, "delta": delta, "reason": reason})

    async def get_vendor_sla_text(self, vendor_id: int) -> str | None:
        return await self._call("get_vendor_sla_text", {"vendor_id": vendor_id})

    async def create_claim(self, payload: dict) -> dict:
        return await self._call("create_claim", {"payload": payload})

    async def create_alert(self, payload: dict) -> dict:
        return await self._call("create_alert", {"payload": payload})

    async def search_audit_logs(self, query: str | None = None, limit: int = 50) -> list[dict]:
        return await self._call("search_audit_logs", {"query": query, "limit": limit})


# Module-level holder — connected/closed via FastAPI lifespan in app/main.py.
# A mutable dict (rather than a bare module-level variable) so other modules
# can observe updates made via set_erp_mcp_client() without needing `global`.
_holder: dict[str, ErpMcpClient | None] = {"client": None}


def set_erp_mcp_client(client: ErpMcpClient | None) -> None:
    _holder["client"] = client


def get_erp_mcp_client() -> ErpMcpClient:
    client = _holder["client"]
    if client is None:
        raise McpClientError("ERP MCP client has not been initialized yet (startup not complete).")
    return client
