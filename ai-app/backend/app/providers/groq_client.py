"""
Groq text-reasoning client — used by every text-only agent in the pipeline
(Context Structuring, Policy, Reorder, Claim, Governance). Free-tier, fast.
"""
from __future__ import annotations

import logging
import time

from app import observability
from app.config.agents import GROQ_API_KEY, GROQ_CHAT_MODEL
from app.providers import envelope

logger = logging.getLogger("ai_app.providers.groq")

_client = None


def _get_client():
    global _client
    if not GROQ_API_KEY:
        return None
    if _client is None:
        from groq import Groq

        _client = Groq(api_key=GROQ_API_KEY)
    return _client


def reasoning_chat(
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0,
    trace_id: str | None = None,
    name: str = "groq_reasoning_chat",
) -> dict:
    """Single-turn system+user chat completion. Returns a provider envelope
    whose `content` is the model's raw text response on success.
    trace_id (optional): Langfuse trace to nest this call under — see app/observability.py.
    name: distinguishes this call site in the trace (e.g. "policy_reasoning", "claim_draft")."""
    client = _get_client()
    if client is None:
        return envelope(GROQ_CHAT_MODEL, 0.0, "error", error="Groq client not configured (missing GROQ_API_KEY)")

    generation = observability.start_generation(
        trace_id, name, GROQ_CHAT_MODEL, input={"system": system_prompt, "user": user_prompt}
    )
    start = time.perf_counter()
    try:
        resp = client.chat.completions.create(
            model=GROQ_CHAT_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
        )
        latency_ms = (time.perf_counter() - start) * 1000
        content = resp.choices[0].message.content if resp.choices else None
        usage = getattr(resp, "usage", None)
        prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
        completion_tokens = getattr(usage, "completion_tokens", None) if usage else None
        observability.finish_generation(
            generation, output=content, status="ok", usage={"input": prompt_tokens, "output": completion_tokens}
        )
        return envelope(GROQ_CHAT_MODEL, latency_ms, "ok", content, prompt_tokens, completion_tokens)
    except Exception as exc:
        latency_ms = (time.perf_counter() - start) * 1000
        logger.error("reasoning_chat failed: %s", exc)
        observability.finish_generation(generation, status="error", error=str(exc))
        return envelope(GROQ_CHAT_MODEL, latency_ms, "error", error=str(exc))
