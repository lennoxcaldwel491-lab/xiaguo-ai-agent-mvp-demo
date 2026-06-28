from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import router as auth_router
from .config import settings
from .routes import router
from .storage import ensure_data_store


def create_app() -> FastAPI:
    ensure_data_store()
    app = FastAPI(title=settings.app_name, version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router, prefix=settings.api_prefix)
    app.include_router(router, prefix=f"{settings.api_prefix}/v1")
    app.include_router(auth_router, prefix=settings.api_prefix)
    app.include_router(auth_router, prefix=f"{settings.api_prefix}/v1")

    @app.get("/")
    async def root() -> dict:
        return {"ok": True, "service": settings.app_name, "api_prefix": settings.api_prefix}

    return app


app = create_app()
