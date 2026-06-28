from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user, require_role
from app.services import claims as svc

router = APIRouter(prefix="/api/claims", tags=["claims"])


class ClaimCreate(BaseModel):
    order_id: int
    sku: str
    damage_type: str
    damaged_qty: int
    claim_text: str


class ClaimDecision(BaseModel):
    status: str  # approved | rejected
    decision_reason: str | None = None


@router.get("")
def list_claims(current_user: dict = Depends(get_current_user)):
    return svc.list_claims_for(current_user)


@router.get("/{claim_id}")
def get_claim(claim_id: int, current_user: dict = Depends(get_current_user)):
    claim = svc.get_claim(claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    role = current_user["role"]
    username = current_user["username"]
    if role == "customer" and claim.get("customer_username") != username:
        raise HTTPException(status_code=404, detail="Claim not found")
    if role == "vendor" and claim.get("vendor_username") != username:
        raise HTTPException(status_code=404, detail="Claim not found")
    return claim


@router.post("")
def create_claim(payload: ClaimCreate, current_user: dict = Depends(require_role("customer"))):
    try:
        return svc.create_claim(
            customer_username=current_user["username"],
            order_id=payload.order_id,
            sku=payload.sku,
            damage_type=payload.damage_type,
            damaged_qty=payload.damaged_qty,
            claim_text=payload.claim_text,
            actor=current_user["username"],
        )
    except ValueError as e:
        if str(e) == "order_not_found":
            raise HTTPException(status_code=404, detail="Order not found")
        if str(e) == "forbidden":
            raise HTTPException(status_code=403, detail="Order does not belong to you")
        raise


@router.put("/{claim_id}/decision")
def decide_claim(claim_id: int, payload: ClaimDecision, current_user: dict = Depends(require_role("vendor"))):
    if payload.status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="status must be 'approved' or 'rejected'")
    try:
        record = svc.decide_claim(
            claim_id,
            vendor_username=current_user["username"],
            status=payload.status,
            decision_reason=payload.decision_reason,
            actor=current_user["username"],
        )
    except ValueError as e:
        if str(e) == "forbidden":
            raise HTTPException(status_code=403, detail="Claim does not belong to you")
        raise
    if not record:
        raise HTTPException(status_code=404, detail="Claim not found")
    return record


@router.delete("/{claim_id}")
def delete_claim(claim_id: int, current_user: dict = Depends(require_role("admin"))):
    ok = svc.delete_claim(claim_id, actor=current_user["username"])
    if not ok:
        raise HTTPException(status_code=404, detail="Claim not found")
    return {"status": "deleted"}
