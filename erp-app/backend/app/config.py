"""
Central place for RAG model configuration. Every value is sourced from the
environment (root .env) — nothing below is hardcoded into routers/services.
Swap providers/models by editing .env only.
"""
from __future__ import annotations

import os

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_EMBEDDING_MODEL = os.environ.get("GEMINI_EMBEDDING_MODEL", "models/gemini-embedding-001")

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_CHAT_MODEL = os.environ.get("GROQ_CHAT_MODEL", "llama-3.3-70b-versatile")

SLA_RAG_CHUNK_SIZE = int(os.environ.get("SLA_RAG_CHUNK_SIZE", "800"))
SLA_RAG_CHUNK_OVERLAP = int(os.environ.get("SLA_RAG_CHUNK_OVERLAP", "100"))
SLA_RAG_TOP_K = int(os.environ.get("SLA_RAG_TOP_K", "4"))
