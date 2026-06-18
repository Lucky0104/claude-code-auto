"""Tiny in-process rate limiter (fixed-interval cooldown).

Used to throttle expensive Meta sync operations per tenant so an impatient
user (or a runaway client) cannot hammer the Graph API. In-process only
(per worker) -- adequate as an accidental-abuse guard; for strict global
limits across workers back this with Redis later.
"""
from __future__ import annotations

import os
import threading
import time
from typing import Dict, Tuple

_lock = threading.Lock()
_last_call: Dict[str, float] = {}


def check_cooldown(key: str, cooldown_seconds: float) -> Tuple[bool, int]:
    """Return ``(allowed, retry_after_seconds)``.

    Allows the call if at least ``cooldown_seconds`` have elapsed since the
    last *allowed* call for ``key``. Records the timestamp only when allowed,
    so a blocked caller does not extend its own cooldown. ``cooldown_seconds
    <= 0`` disables the limit.
    """
    if cooldown_seconds <= 0:
        return True, 0
    now = time.monotonic()
    with _lock:
        last = _last_call.get(key)
        if last is not None:
            elapsed = now - last
            if elapsed < cooldown_seconds:
                return False, max(1, int(round(cooldown_seconds - elapsed)))
        _last_call[key] = now
    return True, 0


def sync_cooldown_seconds() -> float:
    """Cooldown between campaign syncs per tenant (env ``SYNC_RATE_LIMIT_SECONDS``)."""
    try:
        return float(os.environ.get("SYNC_RATE_LIMIT_SECONDS", "15"))
    except (TypeError, ValueError):
        return 15.0


def reset() -> None:  # for tests
    with _lock:
        _last_call.clear()
