"""
Thin wrapper around the `openai` SDK pointed at the LiteLLM-style gateway
(base_url=API_ENDPOINT, api_key=API_KEY). Every public method times the
call, normalizes a structured result envelope, and NEVER raises — a gateway
failure (bad model name, network error, auth error, etc.) becomes a
structured error result so the rest of the pipeline can log it and continue
demoing cleanly instead of crashing.

This is also the "Model Optimization" story: callers pick a logical role
("agent", "chat", "reasoning", "fast_slm", ...) and this module resolves it
to a concrete model name via app.config.models, and every call's
model/latency/tokens are surfaced for the KPI dashboard.
"""
from __future__ import annotations

import base64
import logging
import os
import time
from typing import Any

from openai import OpenAI

from app.config.models import get_model

logger = logging.getLogger("ai_app.llm_client")


def _envelope(model: str, latency_ms: float, status: str, content: Any = None,
              prompt_tokens: int | None = None, completion_tokens: int | None = None,
              error: str | None = None) -> dict:
    return {
        "model": model,
        "latency_ms": round(latency_ms, 2),
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "status": status,
        "error": error,
        "content": content,
    }


class LLMClient:
    def __init__(self, api_endpoint: str | None = None, api_key: str | None = None):
        self.api_endpoint = api_endpoint or os.environ.get("API_ENDPOINT", "")
        self.api_key = api_key or os.environ.get("API_KEY", "")
        self._client: OpenAI | None = None
        if self.api_endpoint and self.api_key and "your-gateway-endpoint" not in self.api_endpoint:
            try:
                self._client = OpenAI(base_url=self.api_endpoint, api_key=self.api_key)
            except Exception as exc:  # pragma: no cover - defensive
                logger.error("Failed to construct OpenAI client: %s", exc)
                self._client = None
        else:
            logger.warning(
                "LLMClient initialized without a real API_ENDPOINT/API_KEY — "
                "all calls will return structured errors (expected in sandboxes without live credentials)."
            )

    def _unavailable(self, role: str) -> dict:
        model = get_model(role)
        return _envelope(model, 0.0, "error", error="LLM client not configured (missing API_ENDPOINT/API_KEY)")

    # ------------------------------------------------------------------
    def chat(self, role: str, messages: list[dict], **kwargs) -> dict:
        """Chat completion. role is a key into the model table (e.g. 'agent', 'chat', 'reasoning')."""
        model = get_model(role)
        if self._client is None:
            return self._unavailable(role)
        start = time.perf_counter()
        try:
            resp = self._client.chat.completions.create(model=model, messages=messages, **kwargs)
            latency_ms = (time.perf_counter() - start) * 1000
            content = resp.choices[0].message.content if resp.choices else None
            usage = getattr(resp, "usage", None)
            prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
            completion_tokens = getattr(usage, "completion_tokens", None) if usage else None
            return _envelope(model, latency_ms, "ok", content, prompt_tokens, completion_tokens)
        except Exception as exc:
            latency_ms = (time.perf_counter() - start) * 1000
            logger.error("chat() failed for role=%s model=%s: %s", role, model, exc)
            return _envelope(model, latency_ms, "error", error=str(exc))

    # ------------------------------------------------------------------
    def vision(self, role: str, image_b64_list: list[str], prompt: str, **kwargs) -> dict:
        """Multimodal vision call. image_b64_list items may be raw base64 or already-prefixed data URIs."""
        model = get_model(role)
        if self._client is None:
            return self._unavailable(role)
        start = time.perf_counter()
        try:
            content_blocks: list[dict] = [{"type": "text", "text": prompt}]
            for b64 in image_b64_list:
                url = b64 if b64.startswith("data:") else f"data:image/jpeg;base64,{b64}"
                content_blocks.append({"type": "image_url", "image_url": {"url": url}})
            messages = [{"role": "user", "content": content_blocks}]
            resp = self._client.chat.completions.create(model=model, messages=messages, **kwargs)
            latency_ms = (time.perf_counter() - start) * 1000
            content = resp.choices[0].message.content if resp.choices else None
            usage = getattr(resp, "usage", None)
            prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
            completion_tokens = getattr(usage, "completion_tokens", None) if usage else None
            return _envelope(model, latency_ms, "ok", content, prompt_tokens, completion_tokens)
        except Exception as exc:
            latency_ms = (time.perf_counter() - start) * 1000
            logger.error("vision() failed for model=%s: %s", model, exc)
            return _envelope(model, latency_ms, "error", error=str(exc))

    # ------------------------------------------------------------------
    def embed(self, texts: list[str]) -> dict:
        """Batch embedding call. Returns envelope whose content is list[list[float]] on success."""
        model = get_model("embedding")
        if self._client is None:
            return self._unavailable("embedding")
        start = time.perf_counter()
        try:
            resp = self._client.embeddings.create(model=model, input=texts)
            latency_ms = (time.perf_counter() - start) * 1000
            vectors = [item.embedding for item in resp.data]
            usage = getattr(resp, "usage", None)
            prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
            return _envelope(model, latency_ms, "ok", vectors, prompt_tokens, None)
        except Exception as exc:
            latency_ms = (time.perf_counter() - start) * 1000
            logger.error("embed() failed for model=%s: %s", model, exc)
            return _envelope(model, latency_ms, "error", error=str(exc))

    # ------------------------------------------------------------------
    def transcribe(self, audio_file_path: str) -> dict:
        """Audio transcription via the gateway's audio endpoint, model=TRANSCRIBE."""
        model = get_model("transcribe")
        if self._client is None:
            return self._unavailable("transcribe")
        start = time.perf_counter()
        try:
            with open(audio_file_path, "rb") as f:
                resp = self._client.audio.transcriptions.create(model=model, file=f)
            latency_ms = (time.perf_counter() - start) * 1000
            text = getattr(resp, "text", None) or (resp.get("text") if isinstance(resp, dict) else None)
            return _envelope(model, latency_ms, "ok", text)
        except Exception as exc:
            latency_ms = (time.perf_counter() - start) * 1000
            logger.error("transcribe() failed for model=%s: %s", model, exc)
            return _envelope(model, latency_ms, "error", error=str(exc))


def image_path_to_b64(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


# Module-level singleton, constructed lazily so import never fails even
# without env vars set (FastAPI lifespan re-checks/creates as needed).
llm_client = LLMClient()
