"""
Simple RBAC auth: no external IdP. Opaque random session tokens kept in an
in-memory dict (module-level — fine for a hackathon demo; restart clears
sessions). Client sends `Authorization: Bearer <token>`.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.services.users import create_user, get_user_by_username, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_TTL_HOURS = 12
SIGNUP_ROLES = {"vendor", "customer"}

# token -> {user_id, username, role, expires_at}
_sessions: dict[str, dict] = {}


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str
    role: str
    display_name: str


class SignupRequest(BaseModel):
    username: str
    password: str
    display_name: str
    role: str
    company_name: str | None = None
    email: str | None = None


def _issue_session(user: dict) -> LoginResponse:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS)
    _sessions[token] = {
        "username": user["username"],
        "role": user["role"],
        "expires_at": expires_at,
    }
    return LoginResponse(
        token=token,
        username=user["username"],
        role=user["role"],
        display_name=user.get("display_name", user["username"]),
    )


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    user = get_user_by_username(payload.username)
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return _issue_session(user)


@router.post("/signup", response_model=LoginResponse)
def signup(payload: SignupRequest):
    if payload.role not in SIGNUP_ROLES:
        raise HTTPException(status_code=400, detail="Role must be 'vendor' or 'customer'")
    username = payload.username.strip().lower()
    if not username or not payload.password:
        raise HTTPException(status_code=400, detail="Username and password are required")
    if get_user_by_username(username):
        raise HTTPException(status_code=409, detail="Username already taken")

    record = create_user(
        {
            "username": username,
            "password": payload.password,
            "role": payload.role,
            "display_name": payload.display_name.strip() or username,
            "company_name": payload.company_name,
            "email": payload.email,
        },
        actor=username,
    )
    return _issue_session(record)


def _extract_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    return authorization.split(" ", 1)[1].strip()


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    token = _extract_token(authorization)
    session = _sessions.get(token)
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")
    if session["expires_at"] < datetime.now(timezone.utc):
        _sessions.pop(token, None)
        raise HTTPException(status_code=401, detail="Session expired")
    return session


def require_role(*roles: str):
    def _dependency(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in roles:
            raise HTTPException(status_code=403, detail=f"Role '{current_user['role']}' not permitted for this action")
        return current_user

    return _dependency


@router.post("/logout")
def logout(authorization: str | None = Header(default=None)):
    token = _extract_token(authorization)
    _sessions.pop(token, None)
    return {"status": "logged_out"}


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return current_user
