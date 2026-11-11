"""FastAPI application entry point."""

from __future__ import annotations

import logging

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.agents.persistence import agent_lifespan
from app.core.config import settings
from app.core.csrf import csrf_origin_middleware
from app.core.dependencies import get_current_user
from app.routers.agent import router as agent_router
from app.routers.auth import router as auth_router
from app.routers.documents import router as documents_router
from app.routers.rag import router as rag_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Cognivault AI API",
    version="1.0.0",
    lifespan=agent_lifespan,
    # Without this, a missing/extra trailing slash returns a 307 whose
    # Location header points at the backend host. Behind the Next.js
    # proxy that leaks http://127.0.0.1:8000 to the browser and drops
    # the auth cookie (the original dashboard-401 bug).
    redirect_slashes=False,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault(
        "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
    )
    return response


app.middleware("http")(csrf_origin_middleware)

# CORS is added last so it is the outermost middleware and can answer
# preflight requests before the CSRF origin check runs.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Origin"],
)


@app.get("/health")
@app.get("/api/v1/health")
def health():
    return {
        "status": "ok",
        "message": "Cognivault API is running",
    }


app.include_router(auth_router)

app.include_router(
    documents_router,
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    rag_router,
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    agent_router,
    dependencies=[Depends(get_current_user)],
)
