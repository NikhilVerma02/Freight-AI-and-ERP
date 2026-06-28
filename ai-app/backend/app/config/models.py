"""
Model role table — maps a logical role used throughout the codebase
(llm_client.chat(role="agent", ...), etc.) to a concrete model name on the
LLM gateway. Every entry is override-able via an environment variable of the
same name, e.g. set MODEL_VISION=some-other-model to swap the vision model
without touching code.
"""
from __future__ import annotations

import os

_DEFAULTS = {
    "VISION": "azure/genailab-maas-gpt-4o",
    "TRANSCRIBE": "azure/genailab-maas-whisper",
    "EMBEDDING": "azure/genailab-maas-text-embedding-3-large",
    "REASONING": "azure_ai/genailab-maas-DeepSeek-R1",
    "AGENT": "azure/genailab-maas-gpt-4.1-mini",
    "FAST_SLM": "azure/genailab-maas-gpt-4.1-nano",
    "CHAT": "azure/genailab-maas-gpt-4.1",
    "TRANSLATE": "azure/genailab-maas-gpt-4.1-nano",
}

MODELS: dict[str, str] = {key: os.environ.get(f"MODEL_{key}", default) for key, default in _DEFAULTS.items()}


def get_model(role: str) -> str:
    """Resolve a logical role (case-insensitive, e.g. 'agent', 'reasoning') to a model name."""
    key = role.upper()
    if key not in MODELS:
        raise KeyError(f"Unknown model role '{role}'. Known roles: {list(MODELS.keys())}")
    return MODELS[key]
