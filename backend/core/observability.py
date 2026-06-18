"""Structured logging + lightweight in-process metrics for the Crysta IVF bot.

Stdlib-only (no extra dependencies). Logging emits single-line JSON when
``LOG_FORMAT=json`` (the default) so logs are machine-parseable in
production; set ``LOG_FORMAT=text`` to keep the classic human-readable
format. ``LOG_LEVEL`` controls the root level (default ``INFO``).

Metrics are simple in-process counters (per worker), intended for quick
operational visibility (webhook throughput, reply success/failure, sync
runs) and exposed via ``GET /api/metrics``. They reset on restart and are
NOT aggregated across workers/hosts -- for that, scrape them into an
external collector. This is deliberately dependency-free for the project's
current ("no Redis yet") stage.
"""
from __future__ import annotations

import json
import logging
import os
import sys
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Union

# Standard LogRecord attributes we must NOT duplicate into the JSON payload.
_RESERVED = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "taskName", "message", "asctime",
}


class JsonFormatter(logging.Formatter):
    """Formats log records as single-line JSON, merging any structured extras."""

    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key in _RESERVED or key.startswith("_"):
                continue
            try:
                json.dumps(value)
                payload[key] = value
            except (TypeError, ValueError):
                payload[key] = repr(value)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


_TEXT_FMT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
_configured = False


def setup_logging(level: Optional[Union[str, int]] = None) -> None:
    """Idempotently configure the root logger. Safe to call multiple times."""
    global _configured
    lvl: Union[str, int] = level or os.environ.get("LOG_LEVEL", "INFO")
    if isinstance(lvl, str):
        lvl = getattr(logging, lvl.upper(), logging.INFO)

    root = logging.getLogger()
    root.setLevel(lvl)
    # Replace handlers so we don't double-log (mirrors basicConfig semantics).
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    if os.environ.get("LOG_FORMAT", "json").lower() == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter(_TEXT_FMT))
    root.addHandler(handler)
    _configured = True


def log_event(
    logger: logging.Logger,
    event: str,
    level: int = logging.INFO,
    **fields: Any,
) -> None:
    """Emit a structured log line: an event name + arbitrary key/value fields.

    Fields surface as top-level keys under the JSON formatter and are harmlessly
    ignored by the text formatter. Never raises -- logging failures are swallowed
    so observability can never break request handling.
    """
    try:
        logger.log(level, event, extra={"event": event, **fields})
    except Exception:  # pragma: no cover - defensive
        try:
            logger.log(level, "%s %s", event, fields)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# In-process metrics
# ---------------------------------------------------------------------------
class _Metrics:
    def __init__(self) -> None:
        self._counters: Dict[str, float] = defaultdict(float)
        self._lock = threading.Lock()
        self.started_at = time.time()

    def inc(self, name: str, amount: float = 1.0) -> None:
        with self._lock:
            self._counters[name] += amount

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            counters = dict(self._counters)
        return {
            "counters": counters,
            "uptime_seconds": round(time.time() - self.started_at, 1),
        }

    def reset(self) -> None:  # for tests
        with self._lock:
            self._counters.clear()


metrics = _Metrics()


def inc(name: str, amount: float = 1.0) -> None:
    """Increment a named counter (never raises)."""
    try:
        metrics.inc(name, amount)
    except Exception:  # pragma: no cover - defensive
        pass


def snapshot() -> Dict[str, Any]:
    return metrics.snapshot()
