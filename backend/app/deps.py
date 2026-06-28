from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException

from .repository import get_session_by_access_hash, get_user_by_id, touch_session, write_audit_log
from .security import hash_token


def _ensure_aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def require_current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    session = get_session_by_access_hash(hash_token(token))
    if not session or session.revoked_at:
        raise HTTPException(status_code=401, detail="invalid token")
    now = datetime.now(timezone.utc)
    if _ensure_aware(session.expires_at) <= now:
        raise HTTPException(status_code=401, detail="token expired")
    user = get_user_by_id(session.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=403, detail="user disabled")
    touch_session(session.id)
    write_audit_log(action="auth.access", payload={"session_id": session.id}, actor_id=user.id, target_type="session", target_id=session.id)
    return {"id": user.id, "username": user.username, "role": user.role, "session_id": session.id}


def require_role(*allowed_roles: str):
    def _dependency(current_user: dict = Depends(require_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="insufficient role")
        return current_user

    return _dependency
