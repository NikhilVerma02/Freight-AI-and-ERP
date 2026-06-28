"""
Chat/generation provider: Groq (free tier). Model name comes from
app.config.GROQ_CHAT_MODEL (env-driven, never hardcoded elsewhere).
"""
from __future__ import annotations

import logging

from app.config import GROQ_API_KEY, GROQ_CHAT_MODEL

logger = logging.getLogger("erp_app.rag.llm")

_client = None


def _get_client():
    global _client
    if not GROQ_API_KEY:
        return None
    if _client is None:
        from groq import Groq

        _client = Groq(api_key=GROQ_API_KEY)
    return _client


def answer_question(question: str, context_chunks: list[str]) -> str | None:
    """Ask Groq to answer `question` grounded only in `context_chunks`. Returns None on failure."""
    client = _get_client()
    if client is None:
        logger.warning("llm: GROQ_API_KEY not set — cannot answer")
        return None

    context = "\n\n---\n\n".join(context_chunks) if context_chunks else "(no relevant SLA text found)"
    system_prompt = (
        "You are an assistant answering questions about a vendor's Service Level "
        "Agreement (SLA) document. Answer ONLY using the SLA excerpts provided below. "
        "If the answer isn't contained in the excerpts, say you don't have enough "
        "information in the SLA to answer. Be concise."
    )
    user_prompt = f"SLA excerpts:\n{context}\n\nQuestion: {question}"

    try:
        resp = client.chat.completions.create(
            model=GROQ_CHAT_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
        )
        return resp.choices[0].message.content
    except Exception as exc:
        logger.error("llm: Groq chat completion failed: %s", exc)
        return None
