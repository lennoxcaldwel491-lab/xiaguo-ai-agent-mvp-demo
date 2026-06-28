from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from fastapi import Depends
from pydantic import BaseModel, Field

from .config import settings
from .deps import require_current_user, require_role
from .repository import create_session, create_user, get_session_by_refresh_hash, get_user_by_id, get_user_by_username, read_audit_logs, revoke_session, write_audit_log
from .security import build_session_tokens, hash_password, hash_token, verify_password


router = APIRouter(prefix="/auth", tags=["auth"])


def _ensure_aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class RegisterRequest(BaseModel):
    username: str
    password: str
    role: str = "farmer"


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    session_id: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict = Field(default_factory=dict)


@router.post("/register")
def register(payload: RegisterRequest) -> dict:
    if get_user_by_username(payload.username):
        raise HTTPException(status_code=409, detail="username already exists")
    user_id = f"user_{payload.username}"
    create_user(user_id=user_id, username=payload.username, password_hash=hash_password(payload.password), role=payload.role)
    write_audit_log(action="auth.register", payload={"username": payload.username, "role": payload.role}, actor_id=user_id, target_type="user", target_id=user_id)
    return {"ok": True, "user_id": user_id}


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest) -> dict:
    user = get_user_by_username(payload.username)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid credentials")
    tokens = build_session_tokens()
    session_id = f"session_{user.id}_{int(datetime.now(timezone.utc).timestamp())}"
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.access_token_ttl_hours)
    refresh_expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_ttl_days)
    create_session(
        session_id=session_id,
        user_id=user.id,
        access_token_hash=hash_token(tokens["access_token"]),
        refresh_token_hash=hash_token(tokens["refresh_token"]),
        expires_at=expires_at,
        refresh_expires_at=refresh_expires_at,
    )
    write_audit_log(action="auth.login", payload={"username": payload.username}, actor_id=user.id, target_type="session", target_id=session_id)
    return {
        **tokens,
        "user": {"id": user.id, "username": user.username, "role": user.role},
    }


@router.post("/refresh", response_model=AuthResponse)
def refresh(payload: RefreshRequest) -> dict:
    session = get_session_by_refresh_hash(hash_token(payload.refresh_token))
    if not session or session.revoked_at:
        raise HTTPException(status_code=401, detail="invalid refresh token")
    now = datetime.now(timezone.utc)
    if _ensure_aware(session.refresh_expires_at) <= now:
        raise HTTPException(status_code=401, detail="refresh token expired")
    # Token rotation is intentionally simple here: the client gets a fresh pair and the old session is revoked.
    revoke_session(session.id)
    new_tokens = build_session_tokens()
    new_session_id = f"session_{session.user_id}_{int(now.timestamp())}_r"
    create_session(
        session_id=new_session_id,
        user_id=session.user_id,
        access_token_hash=hash_token(new_tokens["access_token"]),
        refresh_token_hash=hash_token(new_tokens["refresh_token"]),
        expires_at=now + timedelta(hours=settings.access_token_ttl_hours),
        refresh_expires_at=now + timedelta(days=settings.refresh_token_ttl_days),
    )
    write_audit_log(action="auth.refresh", payload={"session_id": session.id, "new_session_id": new_session_id}, actor_id=session.user_id, target_type="session", target_id=new_session_id)
    user = get_user_by_id(session.user_id)
    return {
        **new_tokens,
        "user": {"id": session.user_id, "username": user.username if user else "", "role": user.role if user else "farmer"},
    }


@router.post("/logout")
def logout(payload: LogoutRequest) -> dict:
    revoke_session(payload.session_id)
    write_audit_log(action="auth.logout", payload={"session_id": payload.session_id}, actor_id=None, target_type="session", target_id=payload.session_id)
    return {"ok": True}


@router.get("/me")
def me(current_user: dict = Depends(require_current_user)) -> dict:
    return {"user": current_user}


@router.get("/audit/logs")
def audit_logs(limit: int = 100, current_user: dict = Depends(require_role("operator", "admin"))) -> dict:
    return {"logs": read_audit_logs(limit=max(1, min(200, limit)))}
