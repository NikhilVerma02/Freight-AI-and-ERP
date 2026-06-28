from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user, require_role
from app.services import orders as svc

router = APIRouter(prefix="/api/orders", tags=["orders"])


class OrderItem(BaseModel):
    sku: str
    item_name: str
    qty: int


class OrderCreate(BaseModel):
    vendor_username: str
    items: list[OrderItem]


class OrderStatusUpdate(BaseModel):
    status: str  # delivered | undelivered
    undelivered_reason: str | None = None


@router.get("")
def list_orders(current_user: dict = Depends(get_current_user)):
    return svc.list_orders_for(current_user)


@router.get("/{order_id}")
def get_order(order_id: int, current_user: dict = Depends(get_current_user)):
    order = svc.get_order(order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    role = current_user["role"]
    username = current_user["username"]
    if role == "customer" and order.get("customer_username") != username:
        raise HTTPException(status_code=404, detail="Order not found")
    if role == "vendor" and order.get("vendor_username") != username:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("")
def create_order(payload: OrderCreate, current_user: dict = Depends(require_role("customer"))):
    try:
        return svc.create_order(
            customer_username=current_user["username"],
            vendor_username=payload.vendor_username,
            items=[i.model_dump() for i in payload.items],
            actor=current_user["username"],
        )
    except ValueError as e:
        if str(e) == "not_linked":
            raise HTTPException(status_code=403, detail="Not linked to this vendor")
        raise


@router.put("/{order_id}/status")
def update_status(order_id: int, payload: OrderStatusUpdate, current_user: dict = Depends(require_role("vendor"))):
    if payload.status not in ("delivered", "undelivered"):
        raise HTTPException(status_code=400, detail="status must be 'delivered' or 'undelivered'")
    try:
        record = svc.update_status(
            order_id,
            vendor_username=current_user["username"],
            status=payload.status,
            undelivered_reason=payload.undelivered_reason,
            actor=current_user["username"],
        )
    except ValueError as e:
        if str(e) == "forbidden":
            raise HTTPException(status_code=403, detail="Order does not belong to you")
        raise
    if not record:
        raise HTTPException(status_code=404, detail="Order not found")
    return record


@router.delete("/{order_id}")
def delete_order(order_id: int, current_user: dict = Depends(require_role("admin"))):
    ok = svc.delete_order(order_id, actor=current_user["username"])
    if not ok:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"status": "deleted"}
