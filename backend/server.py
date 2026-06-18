from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from core import db as dbmod
from core import observability as obs
from core.csrf import CSRFMiddleware
from routers import auth, tenant, pages, instagram, comments, approvals, leads, kb, team, analytics, webhooks, audit, campaigns, notifications, metrics

app = FastAPI(title="DashAI - Social Comment Manager")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"app": "DashAI", "status": "ok"}


@api_router.get("/health")
async def health():
    return {"ok": True}


api_router.include_router(auth.router)
api_router.include_router(tenant.router)
api_router.include_router(pages.router)
api_router.include_router(instagram.router)
api_router.include_router(comments.router)
api_router.include_router(approvals.router)
api_router.include_router(leads.router)
api_router.include_router(kb.router)
api_router.include_router(team.router)
api_router.include_router(analytics.router)
api_router.include_router(webhooks.router)
api_router.include_router(audit.router)
api_router.include_router(campaigns.router)
api_router.include_router(notifications.router)
api_router.include_router(metrics.router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["set-cookie"],
)
app.add_middleware(CSRFMiddleware)

obs.setup_logging()
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def on_startup():
    try:
        await dbmod.ensure_indexes()
        obs.log_event(logger, "startup.indexes_ensured")
    except Exception as e:
        logger.warning("ensure_indexes failed: %s", e)
