from __future__ import annotations

from functools import lru_cache
from pathlib import Path
import time

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DATA_DIR, settings


class Base(DeclarativeBase):
    pass


def _default_sqlite_url() -> str:
    db_path = Path(DATA_DIR) / "app.db"
    return f"sqlite:///{db_path.as_posix()}"


@lru_cache(maxsize=1)
def get_engine():
    url = settings.database_url or _default_sqlite_url()
    if url.startswith("sqlite:///"):
        return create_engine(url, future=True, connect_args={"check_same_thread": False})
    return create_engine(url, future=True, pool_pre_ping=True)


SessionLocal = sessionmaker(bind=get_engine(), autoflush=False, autocommit=False, expire_on_commit=False, future=True)


def init_db() -> None:
    from . import models  # noqa: F401

    last_error: Exception | None = None
    for _ in range(10):
        try:
            Base.metadata.create_all(bind=get_engine())
            return
        except Exception as error:  # pragma: no cover - startup retry guard
            last_error = error
            time.sleep(1)
    if last_error:
        raise last_error
