from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select

from .config import RUN_TRACE_FILE, STATE_FILE
from .db import SessionLocal, init_db
from .models import AppStateRecord, AuthSessionRecord, AuditLogRecord, BadCaseRecord, EvalRunRecord, FeedbackRecord, ProductRecord, ReviewRecord, TraceRecord, UserRecord


def ensure_data_store() -> None:
    init_db()
    _migrate_legacy_data_if_needed()


def _legacy_state_exists() -> bool:
    return STATE_FILE.exists() and STATE_FILE.stat().st_size > 0


def _legacy_traces_exist() -> bool:
    return RUN_TRACE_FILE.exists() and RUN_TRACE_FILE.stat().st_size > 0


def _is_db_empty(session) -> bool:
    return not any(
        session.scalars(select(model).limit(1)).first()
        for model in (AppStateRecord, ProductRecord, ReviewRecord, FeedbackRecord, BadCaseRecord, EvalRunRecord, TraceRecord)
    )


def _migrate_legacy_data_if_needed() -> None:
    if not _legacy_state_exists() and not _legacy_traces_exist():
        return
    with SessionLocal() as session:
        if not _is_db_empty(session):
            return
    legacy_state = _default_state()
    if _legacy_state_exists():
        try:
            legacy_state = {**legacy_state, **json.loads(STATE_FILE.read_text(encoding="utf-8"))}
        except Exception:
            legacy_state = _default_state()
    with SessionLocal() as session:
        session.execute(delete(ProductRecord))
        session.execute(delete(ReviewRecord))
        session.execute(delete(FeedbackRecord))
        session.execute(delete(BadCaseRecord))
        session.execute(delete(EvalRunRecord))
        session.execute(delete(AppStateRecord))
        session.add(AppStateRecord(id="singleton", current_report=legacy_state.get("currentReport"), report_count=int(legacy_state.get("reportCount") or 0), updated_at=datetime.now(timezone.utc)))
        for product in legacy_state.get("products", []):
            product_id = product.get("id")
            if product_id:
                session.add(ProductRecord(id=product_id, payload=product, status=product.get("status")))
        for review in legacy_state.get("reviews", []):
            review_id = review.get("id")
            if review_id:
                session.add(ReviewRecord(id=review_id, payload=review))
        for feedback in legacy_state.get("feedbacks", []):
            feedback_id = feedback.get("id")
            if feedback_id:
                session.add(FeedbackRecord(id=feedback_id, payload=feedback))
        for bad_case in legacy_state.get("badCases", []):
            bad_case_id = bad_case.get("id")
            if bad_case_id:
                session.add(BadCaseRecord(id=bad_case_id, payload=bad_case))
        for eval_run in legacy_state.get("evalRuns", []):
            eval_run_id = eval_run.get("run_id") or eval_run.get("id")
            if eval_run_id:
                session.add(EvalRunRecord(id=eval_run_id, payload=eval_run, mode=eval_run.get("mode")))
        if _legacy_traces_exist():
            try:
                for line in RUN_TRACE_FILE.read_text(encoding="utf-8").splitlines():
                    if not line.strip():
                        continue
                    session.add(TraceRecord(payload=json.loads(line), created_at=datetime.now(timezone.utc)))
            except Exception:
                pass
        session.commit()


def _default_state() -> dict[str, Any]:
    return {
        "currentReport": None,
        "products": [],
        "reviews": [],
        "feedbacks": [],
        "reportCount": 0,
        "evalRuns": [],
        "badCases": [],
        "actionLogs": [],
        "updatedAt": None,
    }


def _session_state(session) -> dict[str, Any]:
    state = _default_state()
    app_state = session.get(AppStateRecord, "singleton")
    if app_state:
        state["currentReport"] = app_state.current_report
        state["reportCount"] = app_state.report_count
        state["updatedAt"] = app_state.updated_at.isoformat() if app_state.updated_at else None
    state["products"] = [record.payload for record in session.scalars(select(ProductRecord).order_by(ProductRecord.updated_at.desc())).all()]
    state["reviews"] = [record.payload for record in session.scalars(select(ReviewRecord).order_by(ReviewRecord.updated_at.desc())).all()]
    state["feedbacks"] = [record.payload for record in session.scalars(select(FeedbackRecord).order_by(FeedbackRecord.updated_at.desc())).all()]
    state["badCases"] = [record.payload for record in session.scalars(select(BadCaseRecord).order_by(BadCaseRecord.updated_at.desc())).all()]
    state["evalRuns"] = [record.payload for record in session.scalars(select(EvalRunRecord).order_by(EvalRunRecord.updated_at.desc())).all()]
    state["actionLogs"] = [row.payload for row in session.scalars(select(TraceRecord).order_by(TraceRecord.created_at.desc())).all()]
    return state


def read_state() -> dict[str, Any]:
    ensure_data_store()
    with SessionLocal() as session:
        return _session_state(session)


def write_state(next_state: dict[str, Any]) -> dict[str, Any]:
    ensure_data_store()
    clean_state = {**_default_state(), **next_state, "updatedAt": next_state.get("updatedAt") or datetime.now(timezone.utc).isoformat()}
    with SessionLocal() as session:
        session.execute(delete(ProductRecord))
        session.execute(delete(ReviewRecord))
        session.execute(delete(FeedbackRecord))
        session.execute(delete(BadCaseRecord))
        session.execute(delete(EvalRunRecord))
        session.execute(delete(AppStateRecord))
        session.add(AppStateRecord(id="singleton", current_report=clean_state.get("currentReport"), report_count=int(clean_state.get("reportCount") or 0), updated_at=datetime.now(timezone.utc)))
        for product in clean_state.get("products", []):
            product_id = product.get("id")
            if product_id:
                session.add(ProductRecord(id=product_id, payload=product, status=product.get("status")))
        for review in clean_state.get("reviews", []):
            review_id = review.get("id")
            if review_id:
                session.add(ReviewRecord(id=review_id, payload=review))
        for feedback in clean_state.get("feedbacks", []):
            feedback_id = feedback.get("id")
            if feedback_id:
                session.add(FeedbackRecord(id=feedback_id, payload=feedback))
        for bad_case in clean_state.get("badCases", []):
            bad_case_id = bad_case.get("id")
            if bad_case_id:
                session.add(BadCaseRecord(id=bad_case_id, payload=bad_case))
        for eval_run in clean_state.get("evalRuns", []):
            eval_run_id = eval_run.get("run_id") or eval_run.get("id")
            if eval_run_id:
                session.add(EvalRunRecord(id=eval_run_id, payload=eval_run, mode=eval_run.get("mode")))
        session.commit()
    return clean_state


def list_products() -> list[dict[str, Any]]:
    ensure_data_store()
    with SessionLocal() as session:
        return [record.payload for record in session.scalars(select(ProductRecord).order_by(ProductRecord.updated_at.desc())).all()]


def list_reviews() -> list[dict[str, Any]]:
    ensure_data_store()
    with SessionLocal() as session:
        return [record.payload for record in session.scalars(select(ReviewRecord).order_by(ReviewRecord.updated_at.desc())).all()]


def list_feedbacks() -> list[dict[str, Any]]:
    ensure_data_store()
    with SessionLocal() as session:
        return [record.payload for record in session.scalars(select(FeedbackRecord).order_by(FeedbackRecord.updated_at.desc())).all()]


def list_bad_cases() -> list[dict[str, Any]]:
    ensure_data_store()
    with SessionLocal() as session:
        return [record.payload for record in session.scalars(select(BadCaseRecord).order_by(BadCaseRecord.updated_at.desc())).all()]


def list_eval_runs() -> list[dict[str, Any]]:
    ensure_data_store()
    with SessionLocal() as session:
        return [record.payload for record in session.scalars(select(EvalRunRecord).order_by(EvalRunRecord.updated_at.desc())).all()]


def upsert_by_id(items: list[dict[str, Any]], item: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not item or not item.get("id"):
        return items
    return [item, *[entry for entry in items if entry.get("id") != item["id"]]]


def upsert_product(product: dict[str, Any]) -> None:
    ensure_data_store()
    with SessionLocal() as session:
        session.merge(ProductRecord(id=product["id"], payload=product, status=product.get("status")))
        session.commit()


def update_product_status(product_id: str, status: str | None) -> None:
    ensure_data_store()
    if not status:
        return
    with SessionLocal() as session:
        record = session.get(ProductRecord, product_id)
        if not record:
            return
        record.status = status
        payload = dict(record.payload)
        payload["status"] = status
        record.payload = payload
        session.commit()


def upsert_review(review: dict[str, Any]) -> None:
    ensure_data_store()
    with SessionLocal() as session:
        session.merge(ReviewRecord(id=review["id"], payload=review))
        session.commit()


def upsert_feedback(feedback: dict[str, Any]) -> None:
    ensure_data_store()
    with SessionLocal() as session:
        session.merge(FeedbackRecord(id=feedback["id"], payload=feedback))
        session.commit()


def upsert_bad_case(bad_case: dict[str, Any]) -> None:
    ensure_data_store()
    with SessionLocal() as session:
        session.merge(BadCaseRecord(id=bad_case["id"], payload=bad_case))
        session.commit()


def upsert_eval_run(eval_run: dict[str, Any]) -> None:
    ensure_data_store()
    run_id = eval_run.get("run_id") or eval_run.get("id")
    if not run_id:
        return
    with SessionLocal() as session:
        session.merge(EvalRunRecord(id=run_id, payload=eval_run, mode=eval_run.get("mode")))
        session.commit()


def create_user(*, user_id: str, username: str, password_hash: str, role: str = "farmer", is_active: bool = True) -> None:
    ensure_data_store()
    with SessionLocal() as session:
        session.merge(UserRecord(id=user_id, username=username, password_hash=password_hash, role=role, is_active=is_active))
        session.commit()


def get_user_by_username(username: str) -> UserRecord | None:
    ensure_data_store()
    with SessionLocal() as session:
        return session.scalars(select(UserRecord).where(UserRecord.username == username)).first()


def get_user_by_id(user_id: str) -> UserRecord | None:
    ensure_data_store()
    with SessionLocal() as session:
        return session.get(UserRecord, user_id)


def create_session(*, session_id: str, user_id: str, access_token_hash: str, refresh_token_hash: str, expires_at, refresh_expires_at) -> None:
    ensure_data_store()
    with SessionLocal() as session:
        session.merge(
            AuthSessionRecord(
                id=session_id,
                user_id=user_id,
                access_token_hash=access_token_hash,
                refresh_token_hash=refresh_token_hash,
                expires_at=expires_at,
                refresh_expires_at=refresh_expires_at,
            )
        )
        session.commit()


def get_session_by_access_hash(access_token_hash: str) -> AuthSessionRecord | None:
    ensure_data_store()
    with SessionLocal() as session:
        return session.scalars(select(AuthSessionRecord).where(AuthSessionRecord.access_token_hash == access_token_hash)).first()


def get_session_by_refresh_hash(refresh_token_hash: str) -> AuthSessionRecord | None:
    ensure_data_store()
    with SessionLocal() as session:
        return session.scalars(select(AuthSessionRecord).where(AuthSessionRecord.refresh_token_hash == refresh_token_hash)).first()


def revoke_session(session_id: str) -> None:
    ensure_data_store()
    with SessionLocal() as session:
        record = session.get(AuthSessionRecord, session_id)
        if not record:
            return
        record.revoked_at = datetime.now(timezone.utc)
        session.commit()


def touch_session(session_id: str) -> None:
    ensure_data_store()
    with SessionLocal() as session:
        record = session.get(AuthSessionRecord, session_id)
        if not record:
            return
        record.last_used_at = datetime.now(timezone.utc)
        session.commit()


def write_audit_log(*, action: str, payload: dict[str, Any], actor_id: str | None = None, target_type: str | None = None, target_id: str | None = None) -> None:
    ensure_data_store()
    with SessionLocal() as session:
        session.add(
            AuditLogRecord(
                actor_id=actor_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                payload=payload,
                created_at=datetime.now(timezone.utc),
            )
        )
        session.commit()


def read_audit_logs(limit: int = 100) -> list[dict[str, Any]]:
    ensure_data_store()
    with SessionLocal() as session:
        rows = session.scalars(select(AuditLogRecord).order_by(AuditLogRecord.created_at.desc()).limit(limit)).all()
        return [
            {
                "id": row.id,
                "actor_id": row.actor_id,
                "action": row.action,
                "target_type": row.target_type,
                "target_id": row.target_id,
                "payload": row.payload,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]


def append_trace(trace: dict[str, Any]) -> None:
    ensure_data_store()
    with SessionLocal() as session:
        session.add(TraceRecord(payload=trace, created_at=datetime.now(timezone.utc)))
        session.commit()


def read_recent_traces(limit: int = 50) -> list[dict[str, Any]]:
    ensure_data_store()
    with SessionLocal() as session:
        rows = session.scalars(select(TraceRecord).order_by(TraceRecord.created_at.desc()).limit(limit)).all()
        return [row.payload for row in rows]
