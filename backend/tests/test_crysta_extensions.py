"""Unit tests for the additive hardening modules: sanitize, ratelimit,
observability. These require NO MongoDB and NO environment variables.

Run: cd backend && python -m pytest tests/test_crysta_extensions.py -q
"""
import json
import logging

from core.sanitize import sanitize_field, sanitize_template, unknown_placeholders
from core.ratelimit import check_cooldown, reset as rl_reset
from core import observability as obs


# --- sanitize_field ---------------------------------------------------------
def test_sanitize_field_preserves_normal_values():
    assert sanitize_field("Dr. A") == "Dr. A"
    assert sanitize_field("+91 99999") == "+91 99999"
    assert sanitize_field("Main St") == "Main St"
    assert sanitize_field("") == ""


def test_sanitize_field_none_stays_none():
    assert sanitize_field(None) is None


def test_sanitize_field_strips_control_chars_and_trims():
    assert sanitize_field("  Dr.\x00 A\t ") == "Dr. A"


def test_sanitize_field_collapses_whitespace():
    assert sanitize_field("Dr.    A") == "Dr. A"


def test_sanitize_field_caps_length():
    assert len(sanitize_field("x" * 5000)) == 300


# --- sanitize_template ------------------------------------------------------
def test_sanitize_template_preserves_placeholders_and_newlines():
    tpl = "Hi {doctor_name}\nCall {phone}"
    assert sanitize_template(tpl) == "Hi {doctor_name}\nCall {phone}"


def test_sanitize_template_none_stays_none():
    assert sanitize_template(None) is None


def test_sanitize_template_strips_control_and_collapses_blank_lines():
    assert sanitize_template("a\x07\n\n\n\nb") == "a\n\nb"


def test_sanitize_template_caps_length():
    assert len(sanitize_template("y" * 5000)) == 2000


def test_unknown_placeholders():
    assert unknown_placeholders("Hi {doctor_name} {docter_name}") == ["docter_name"]
    assert unknown_placeholders("no placeholders") == []
    assert unknown_placeholders(None) == []


# --- ratelimit --------------------------------------------------------------
def test_cooldown_blocks_second_call():
    rl_reset()
    allowed1, _ = check_cooldown("k", 100)
    allowed2, retry = check_cooldown("k", 100)
    assert allowed1 is True
    assert allowed2 is False
    assert retry >= 1


def test_cooldown_disabled_with_zero():
    rl_reset()
    a1, _ = check_cooldown("k", 0)
    a2, _ = check_cooldown("k", 0)
    assert a1 and a2


def test_cooldown_independent_keys():
    rl_reset()
    a1, _ = check_cooldown("a", 100)
    a2, _ = check_cooldown("b", 100)
    assert a1 and a2


# --- observability ----------------------------------------------------------
def test_metrics_inc_and_snapshot():
    obs.metrics.reset()
    obs.inc("x")
    obs.inc("x", 2)
    obs.inc("y")
    snap = obs.snapshot()
    assert snap["counters"]["x"] == 3
    assert snap["counters"]["y"] == 1
    assert "uptime_seconds" in snap


def test_json_formatter_outputs_json():
    rec = logging.LogRecord("t", logging.INFO, __file__, 1, "hello", None, None)
    rec.event = "test.event"
    rec.tenant_id = "t1"
    parsed = json.loads(obs.JsonFormatter().format(rec))
    assert parsed["msg"] == "hello"
    assert parsed["event"] == "test.event"
    assert parsed["tenant_id"] == "t1"
    assert parsed["level"] == "INFO"


def test_log_event_never_raises():
    log = logging.getLogger("test")
    obs.log_event(log, "some.event", tenant_id="t", count=5)  # must not raise


def test_setup_logging_idempotent():
    root = logging.getLogger()
    saved = list(root.handlers)
    try:
        obs.setup_logging()
        obs.setup_logging("DEBUG")
        assert len(root.handlers) == 1  # replaced, not duplicated
    finally:
        root.handlers[:] = saved
