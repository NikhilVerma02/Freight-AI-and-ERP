"""
Role-scoped portal chatbot: answers questions about the logged-in user's OWN
orders, claims, inventory, and SLA terms. Every question re-fetches that
user's data fresh from the existing service layer (no caching — datasets are
small/demo-sized) and is grounded in it via Groq, the same free-tier model
already used for SLA Q&A (see app/rag/llm.py).

Multilingual: no translation step needed — the system prompt instructs the
model to reply in whatever language the question was asked in, and
Llama-3.3-70b already handles this well across English/Hindi/etc.
"""
from __future__ import annotations

import json
import logging

from app.rag import vector_store
from app.rag.embeddings import embed_query
from app.rag.llm import chat
from app.services import claims as claims_svc
from app.services import customer_inventory as customer_inv_svc
from app.services import orders as orders_svc
from app.services import sla as sla_svc
from app.services import vendor_inventory as vendor_inv_svc

logger = logging.getLogger("erp_app.chatbot")

MAX_ITEMS = 25  # cap each list so the prompt stays small — demo datasets are tiny anyway
SLA_TOP_K = 4

ROLE_DESCRIPTIONS = {
    "admin": "an administrator who can see all vendors, customers, orders, and claims",
    "vendor": "a vendor, seeing only their own orders, claims, inventory, and uploaded SLA",
    "customer": "a customer, seeing only their own orders, claims, inventory, and the SLAs of vendors they're linked to",
}

SYSTEM_PROMPT_TEMPLATE = """You are the assistant built into a freight ERP portal, answering questions for \
the currently logged-in user "{username}", who is {role_description}. Answer ONLY using the data snapshot \
and SLA excerpts below — this is everything this user is allowed to see, scoped by their role. Never invent \
data, and never reveal information that isn't in the snapshot. If something isn't covered by the data, say \
so plainly rather than guessing.

Be concise and conversational, like a helpful colleague, not a report generator. Always reply in the same \
language the question was asked in (the user may write in English, Hindi, or another language — match it).

User's data snapshot (JSON):
{snapshot}

Relevant SLA excerpts for this question (if any):
{sla_excerpts}
"""


def _compact_orders(orders: list[dict]) -> list[dict]:
    return [
        {
            "order_number": o.get("order_number"),
            "vendor": o.get("vendor_username"),
            "customer": o.get("customer_username"),
            "status": o.get("status"),
            "items": o.get("items"),
            "requested_at": o.get("requested_at") or o.get("created_at"),
            "undelivered_reason": o.get("undelivered_reason"),
        }
        for o in orders[:MAX_ITEMS]
    ]


def _compact_claims(claims: list[dict]) -> list[dict]:
    return [
        {
            "claim_number": c.get("claim_number"),
            "vendor": c.get("vendor_username"),
            "customer": c.get("customer_username"),
            "order_id": c.get("order_id"),
            "sku": c.get("sku"),
            "damage_type": c.get("damage_type"),
            "damaged_qty": c.get("damaged_qty"),
            "status": c.get("status"),
            "decision_reason": c.get("decision_reason"),
            "created_at": c.get("created_at"),
        }
        for c in claims[:MAX_ITEMS]
    ]


def _compact_inventory(items: list[dict]) -> list[dict]:
    keep_keys = {
        "sku",
        "item_name",
        "qty_on_hand",
        "reorder_threshold",
        "manufacturing_critical",
        "vendor_username",
        "customer_username",
    }
    return [{k: v for k, v in item.items() if k in keep_keys} for item in items[:MAX_ITEMS]]


def _gather_context(current_user: dict) -> dict:
    role = current_user["role"]
    username = current_user["username"]

    orders = orders_svc.list_orders_for(current_user)
    claims = claims_svc.list_claims_for(current_user)
    slas = sla_svc.list_slas_for(current_user)

    inventory: list[dict] = []
    if role == "vendor":
        inventory = vendor_inv_svc.list_inventory(vendor_username=username)
    elif role == "customer":
        inventory = customer_inv_svc.list_inventory(customer_username=username)
    # admin has no single vendor/customer scope for inventory — orders/claims/SLA already
    # give a full system-wide picture without an unbounded inventory dump.

    return {
        "role": role,
        "username": username,
        "order_count": len(orders),
        "claim_count": len(claims),
        "orders": _compact_orders(orders),
        "claims": _compact_claims(claims),
        "inventory": _compact_inventory(inventory),
        "slas": [
            {
                "sla_id": s["id"],
                "vendor": s.get("vendor_username"),
                "filename": s.get("sla_document_filename"),
                "liability_summary": s.get("liability_summary"),
            }
            for s in slas
        ],
    }


def _retrieve_sla_chunks(slas: list[dict], question: str, trace_id: str | None) -> list[str]:
    """Semantic search across every SLA this user can access, merged — grounds SLA-specific
    answers in the actual document text rather than just the cached one-line summary."""
    if not slas:
        return []
    query_embedding = embed_query(question, trace_id=trace_id)
    if query_embedding is None:
        return []
    chunks: list[str] = []
    for sla in slas:
        collection_name = f"sla_{sla['sla_id']}"
        if vector_store.collection_count(collection_name) == 0:
            continue
        results = vector_store.query(collection_name, query_embedding, top_k=SLA_TOP_K)
        chunks.extend(results.get("documents", []))
    return chunks


def answer(question: str, current_user: dict, trace_id: str | None = None) -> str:
    context = _gather_context(current_user)
    sla_chunks = _retrieve_sla_chunks(context["slas"], question, trace_id)

    snapshot = {
        "order_count": context["order_count"],
        "claim_count": context["claim_count"],
        "orders": context["orders"],
        "claims": context["claims"],
        "inventory": context["inventory"],
        "slas": [{"vendor": s["vendor"], "summary": s["liability_summary"]} for s in context["slas"]],
    }

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        username=context["username"],
        role_description=ROLE_DESCRIPTIONS.get(context["role"], context["role"]),
        snapshot=json.dumps(snapshot, default=str),
        sla_excerpts="\n\n---\n\n".join(sla_chunks) if sla_chunks else "(none retrieved for this question)",
    )

    reply = chat(system_prompt, question, name="groq_chatbot", temperature=0.3, trace_id=trace_id)
    if reply is None:
        return "Sorry, I couldn't reach the AI service right now (check GROQ_API_KEY). Please try again shortly."
    return reply
