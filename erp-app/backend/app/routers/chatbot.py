"""POST /api/chatbot/ask — role-scoped Q&A assistant covering the logged-in
user's own orders, claims, inventory, and SLA terms. See app/chatbot.py."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app import chatbot, observability
from app.auth import get_current_user

router = APIRouter(prefix="/api/chatbot", tags=["chatbot"])


class ChatRequest(BaseModel):
    question: str


class ChatResponse(BaseModel):
    answer: str


@router.post("/ask", response_model=ChatResponse)
def ask(payload: ChatRequest, current_user: dict = Depends(get_current_user)):
    trace_id = observability.trace_id_for(f"chatbot_{current_user['username']}_{uuid.uuid4().hex}")
    reply = chatbot.answer(payload.question, current_user, trace_id=trace_id)
    return ChatResponse(answer=reply)
