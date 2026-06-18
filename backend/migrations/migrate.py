#!/usr/bin/env python3
"""Standalone migration: ensure Crysta IVF collections + indexes exist.

Idempotent -- safe to run repeatedly. The app also calls ``ensure_indexes()``
on startup, but this script lets you provision/verify the schema as an
explicit deploy step (and prints the resulting index state).

Run from the backend directory::

    cd backend && python -m migrations.migrate
    # or
    cd backend && python migrations/migrate.py

Requires ``MONGO_URL`` and ``DB_NAME`` in the environment (or ``backend/.env``).
"""
import asyncio
import sys
from pathlib import Path

# Make `core` importable whether run as a module or as a script.
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

try:  # load backend/.env if python-dotenv is available
    from dotenv import load_dotenv

    load_dotenv(BACKEND_DIR / ".env")
except Exception:
    pass


# Collections that should exist for the Crysta IVF auto-comment bot. Mongo
# creates collections lazily on first write, but creating them up front makes
# index creation and operational dashboards deterministic.
REQUIRED_COLLECTIONS = [
    "campaigns",
    "monitored_posts",
    "comment_logs",
    "webhook_events",
]

# Collections whose indexes we surface for verification.
VERIFY_INDEXES = ["comment_logs", "monitored_posts", "campaigns"]


async def run() -> int:
    from core import db as dbmod  # imported after env is loaded

    existing = set(await dbmod.db.list_collection_names())
    for name in REQUIRED_COLLECTIONS:
        if name not in existing:
            await dbmod.db.create_collection(name)
            print(f"[migrate] created collection: {name}")
        else:
            print(f"[migrate] collection exists:  {name}")

    await dbmod.ensure_indexes()
    print("[migrate] indexes ensured")

    for coll in VERIFY_INDEXES:
        info = await getattr(dbmod, coll).index_information()
        print(f"[migrate] {coll} indexes: {sorted(info.keys())}")

    print("[migrate] done")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
