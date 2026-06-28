"""
Embedding provider: Google Gemini (free tier), via the `google-genai` SDK.
Model name comes from app.config.GEMINI_EMBEDDING_MODEL (env-driven, never
hardcoded elsewhere).
"""
from __future__ import annotations

import logging

from app.config import GEMINI_API_KEY, GEMINI_EMBEDDING_MODEL

logger = logging.getLogger("erp_app.rag.embeddings")

_client = None


def _get_client():
    global _client
    if not GEMINI_API_KEY:
        return None
    if _client is None:
        from google import genai

        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def embed_texts(texts: list[str], task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]] | None:
    """Embed a batch of texts with Gemini. Returns None on any failure (caller decides how to degrade)."""
    if not texts:
        return []
    client = _get_client()
    if client is None:
        logger.warning("embeddings: GEMINI_API_KEY not set — cannot embed")
        return None

    from google.genai import types

    try:
        resp = client.models.embed_content(
            model=GEMINI_EMBEDDING_MODEL,
            contents=texts,
            config=types.EmbedContentConfig(task_type=task_type),
        )
        return [e.values for e in resp.embeddings]
    except Exception as exc:
        logger.error("embeddings: Gemini embed_content failed: %s", exc)
        return None


def embed_query(text: str) -> list[float] | None:
    vectors = embed_texts([text], task_type="RETRIEVAL_QUERY")
    return vectors[0] if vectors else None
