from __future__ import annotations

import bcrypt

from app.services.audit_logs import log_action
from app.store import CollectionByKey

_users = CollectionByKey("users.json", key_field="username")


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def _strip_hash(user: dict) -> dict:
    return {k: v for k, v in user.items() if k != "password_hash"}


def list_users(safe: bool = True) -> list[dict]:
    users = _users.list_all()
    return [_strip_hash(u) for u in users] if safe else users


def get_user_by_username(username: str, safe: bool = False) -> dict | None:
    user = _users.get_by_key(username)
    if not user:
        return None
    return _strip_hash(user) if safe else user


def create_user(payload: dict, actor: str = "system") -> dict:
    plain_password = payload.pop("password", None)
    if plain_password:
        payload["password_hash"] = hash_password(plain_password)
    record = _users.create(payload)
    log_action(actor, "create", "users", None, f"created user {record.get('username')}")
    return _strip_hash(record)


def update_user(username: str, patch: dict, actor: str = "system") -> dict | None:
    plain_password = patch.pop("password", None)
    if plain_password:
        patch["password_hash"] = hash_password(plain_password)
    record = _users.update_by_key(username, patch)
    if record:
        log_action(actor, "update", "users", None, f"updated user {record.get('username')}")
        return _strip_hash(record)
    return None


def delete_user(username: str, actor: str = "system") -> bool:
    ok = _users.delete_by_key(username)
    if ok:
        log_action(actor, "delete", "users", None, f"deleted user {username}")
    return ok
