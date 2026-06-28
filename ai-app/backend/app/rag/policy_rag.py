"""
Document RAG for vendor SLA text — RAG Type 1 of 2 in this app.

Flow: fetch a vendor's SLA text via mcp_client.get_vendor_sla_text (the ERP
is the source of truth for the cached extracted text), chunk it, embed each
chunk via llm_client.embed, and upsert into a per-vendor vector_store
collection (cached — if the collection is already populated for that
vendor we skip re-embedding on subsequent calls). A query string is then
embedded and the top-k most relevant clauses are retrieved.

RAG Type 2 ("tool/API-grounded retrieval") lives in app/mcp_client.py:
agents pull live ERP state (inventory, purchase orders, audit logs)
directly via typed MCP tool calls — no embeddings involved there.
"""
from __future__ import annotations

import logging

from app.llm_client import LLMClient
from app.mcp_client import ErpMcpClient, McpClientError
from app.rag import vector_store
from app.rag.chunking import chunk_text

logger = logging.getLogger("ai_app.rag.policy_rag")


def _collection_name(vendor_id: int) -> str:
    return f"vendor_sla_{vendor_id}"


async def ensure_vendor_sla_indexed(mcp_client: ErpMcpClient, llm_client: LLMClient, vendor_id: int) -> dict:
    """Ensure the vendor's SLA text is chunked+embedded+upserted. Cache: skip if already populated.

    Returns a small status dict for logging: {indexed: bool, chunk_count: int, cached: bool, error: str|None}
    """
    collection_name = _collection_name(vendor_id)
    existing_count = vector_store.collection_count(collection_name)
    if existing_count > 0:
        return {"indexed": True, "chunk_count": existing_count, "cached": True, "error": None}

    try:
        sla_text = await mcp_client.get_vendor_sla_text(vendor_id)
    except McpClientError as exc:
        return {"indexed": False, "chunk_count": 0, "cached": False, "error": f"MCP fetch failed: {exc}"}

    if not sla_text:
        return {"indexed": False, "chunk_count": 0, "cached": False, "error": "No SLA text found for vendor"}

    chunks = chunk_text(sla_text, chunk_size=800, overlap=100)
    if not chunks:
        return {"indexed": False, "chunk_count": 0, "cached": False, "error": "SLA text produced no chunks"}

    embed_result = llm_client.embed(chunks)
    if embed_result["status"] != "ok":
        return {"indexed": False, "chunk_count": 0, "cached": False, "error": f"Embedding failed: {embed_result['error']}"}

    embeddings = embed_result["content"]
    metadatas = [{"vendor_id": vendor_id, "chunk_index": i} for i in range(len(chunks))]
    vector_store.upsert_collection(collection_name, chunks, embeddings, metadatas)
    return {"indexed": True, "chunk_count": len(chunks), "cached": False, "error": None}


async def retrieve_relevant_clauses(
    mcp_client: ErpMcpClient,
    llm_client: LLMClient,
    vendor_id: int,
    query: str,
    top_k: int = 4,
) -> dict:
    """Ensure indexing, then embed `query` and return the top-k SLA clauses for vendor_id.

    Returns {clauses: list[str], metadatas: list[dict], indexing_status: dict, error: str|None}
    """
    indexing_status = await ensure_vendor_sla_indexed(mcp_client, llm_client, vendor_id)
    if not indexing_status["indexed"]:
        return {"clauses": [], "metadatas": [], "indexing_status": indexing_status, "error": indexing_status["error"]}

    query_embed_result = llm_client.embed([query])
    if query_embed_result["status"] != "ok":
        return {
            "clauses": [],
            "metadatas": [],
            "indexing_status": indexing_status,
            "error": f"Query embedding failed: {query_embed_result['error']}",
        }

    query_embedding = query_embed_result["content"][0]
    collection_name = _collection_name(vendor_id)
    results = vector_store.query(collection_name, query_embedding, top_k=top_k)
    return {
        "clauses": results.get("documents", []),
        "metadatas": results.get("metadatas", []),
        "indexing_status": indexing_status,
        "error": None,
    }
