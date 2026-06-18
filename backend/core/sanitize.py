"""Input sanitisation for centre config + reply templates.

Reply text is posted publicly to Instagram, so we strip control characters,
normalise whitespace, and cap length. The policy is deliberately permissive
(IVF replies legitimately contain punctuation, emoji, phone numbers, URLs):
the goal is to neutralise control-char / oversized / malformed input, not to
reject normal content.
"""
from __future__ import annotations

import re
from typing import List, Optional

# Placeholders the renderer understands; everything else stays literal text.
ALLOWED_PLACEHOLDERS = {"doctor_name", "center_name", "phone", "address", "whatsapp"}

# Control chars except tab (\t) and newline (\n).
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_PLACEHOLDER_RE = re.compile(r"\{([a-zA-Z0-9_]+)\}")

MAX_FIELD_LEN = 300
MAX_TEMPLATE_LEN = 2000


def sanitize_field(value: Optional[str], max_len: int = MAX_FIELD_LEN) -> Optional[str]:
    """Clean a short free-text field (name / address / phone / whatsapp).

    ``None`` stays ``None`` so PATCH semantics are preserved. Strips control
    characters, collapses intra-line whitespace runs, trims, and caps length.
    """
    if value is None:
        return None
    cleaned = _CONTROL_RE.sub("", value)
    cleaned = re.sub(r"[ \t\r\f\v]+", " ", cleaned)
    cleaned = cleaned.strip()
    if len(cleaned) > max_len:
        cleaned = cleaned[:max_len].rstrip()
    return cleaned


def sanitize_template(value: Optional[str], max_len: int = MAX_TEMPLATE_LEN) -> Optional[str]:
    """Clean a reply template, preserving newlines and ``{placeholders}``.

    ``None`` stays ``None``. Strips control chars (keeping ``\\n``/``\\t``),
    normalises line endings, trims trailing whitespace per line, collapses
    3+ consecutive blank lines, and caps length.
    """
    if value is None:
        return None
    cleaned = _CONTROL_RE.sub("", value)
    cleaned = cleaned.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = "\n".join(line.rstrip() for line in cleaned.split("\n"))
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    if len(cleaned) > max_len:
        cleaned = cleaned[:max_len].rstrip()
    return cleaned


def unknown_placeholders(template: Optional[str]) -> List[str]:
    """Return placeholder names used in ``template`` that the renderer does not
    understand (so callers can warn the user about typos like ``{docter_name}``)."""
    if not template:
        return []
    found = {m.group(1) for m in _PLACEHOLDER_RE.finditer(template)}
    return sorted(found - ALLOWED_PLACEHOLDERS)
