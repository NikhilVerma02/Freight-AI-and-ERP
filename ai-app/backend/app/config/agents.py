"""
Model configuration for the claims pipeline agents (Inspector/Context/
Policy/Inventory/Reorder/Claim/Governance). Every value is sourced from the
environment (root .env) — nothing below is hardcoded into the agents.

Split: Gemini handles multimodal extraction (Inspector Agent — video/image/
audio understanding); Groq handles all text-only reasoning (Context,
Policy, Reorder, Claim, Governance agents). Both are free-tier providers
already configured for the SLA RAG feature in erp-app; reused here so there
is one GEMINI_API_KEY/GROQ_API_KEY pair for the whole project.
"""
from __future__ import annotations

import os

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MULTIMODAL_MODEL = os.environ.get("GEMINI_MULTIMODAL_MODEL", "gemini-flash-latest")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_CHAT_MODEL = os.environ.get("GROQ_CHAT_MODEL", "llama-3.3-70b-versatile")

# Observability — Langfuse Cloud free tier. Blank keys = tracing fully disabled
# (see app/observability.py — every call site no-ops gracefully).
LANGFUSE_PUBLIC_KEY = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
LANGFUSE_SECRET_KEY = os.environ.get("LANGFUSE_SECRET_KEY", "")
LANGFUSE_HOST = os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com")
