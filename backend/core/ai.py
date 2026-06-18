import os
import json
import uuid
import re
from emergentintegrations.llm.chat import LlmChat, UserMessage

API_KEY = os.environ['EMERGENT_LLM_KEY']

CATEGORIES = [
    "product_inquiry", "pricing_inquiry", "availability_inquiry", "shipping_inquiry",
    "faq", "lead_intent", "complaint", "refund_request", "positive_feedback",
    "negative_feedback", "spam", "competitor_mention", "support_request", "general_question",
]

AUTO_REPLY_CATEGORIES = {
    "faq", "pricing_inquiry", "product_inquiry", "shipping_inquiry",
    "availability_inquiry", "general_question",
}

NEVER_AUTO_REPLY = {"complaint", "refund_request", "negative_feedback", "spam", "competitor_mention"}


def _extract_json(text: str) -> dict:
    # Try direct parse first
    try:
        return json.loads(text)
    except Exception:
        pass
    # Extract first {...} block
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return {}
    return {}


async def classify_comment(comment_text: str, post_context: str = "") -> dict:
    """Returns {category, confidence (0-100), sentiment ('positive'|'neutral'|'negative'), sentiment_score (-1..1), lead_score (0-100), reasoning}."""
    chat = LlmChat(
        api_key=API_KEY,
        session_id=f"classify-{uuid.uuid4()}",
        system_message=(
            "You are an expert social media comment classifier. Respond ONLY with a single compact JSON object, no prose. "
            f"Valid categories: {CATEGORIES}. "
            "Schema: {\"category\": string, \"confidence\": int 0-100, \"sentiment\": \"positive|neutral|negative\", "
            "\"sentiment_score\": float -1..1, \"lead_score\": int 0-100, \"reasoning\": string}."
        ),
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    prompt = f"Post context: {post_context or '(none)'}\n\nComment: \"{comment_text}\"\n\nClassify it."
    resp = await chat.send_message(UserMessage(text=prompt))
    data = _extract_json(resp if isinstance(resp, str) else str(resp))
    # Defaults
    data.setdefault("category", "general_question")
    data.setdefault("confidence", 50)
    data.setdefault("sentiment", "neutral")
    data.setdefault("sentiment_score", 0.0)
    data.setdefault("lead_score", 0)
    return data


async def generate_reply(comment_text: str, classification: dict, kb_context: str, brand: dict) -> str:
    chat = LlmChat(
        api_key=API_KEY,
        session_id=f"reply-{uuid.uuid4()}",
        system_message=(
            "You write public social media replies for a business. Rules:\n"
            "- Sound human, conversational, concise, professional.\n"
            "- Max 60 words.\n"
            "- Never invent facts; if unknown, invite to DM.\n"
            "- Never discuss internal policies.\n"
            f"- Brand name: {brand.get('name','')}. Tone: {brand.get('tone','friendly professional')}.\n"
            "Respond with ONLY the reply text. No quotes, no preface."
        ),
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    prompt = (
        f"Knowledge base (use only what is relevant):\n{kb_context or '(empty)'}\n\n"
        f"Classification: {classification.get('category')} (sentiment: {classification.get('sentiment')})\n"
        f"Comment: \"{comment_text}\"\n\nWrite the public reply."
    )
    resp = await chat.send_message(UserMessage(text=prompt))
    text = resp if isinstance(resp, str) else str(resp)
    return text.strip().strip('"').strip()


def should_auto_reply(classification: dict) -> bool:
    cat = classification.get("category")
    conf = classification.get("confidence", 0)
    sent = classification.get("sentiment", "neutral")
    if cat in NEVER_AUTO_REPLY:
        return False
    if sent == "negative":
        return False
    if conf < 90:
        return False
    return cat in AUTO_REPLY_CATEGORIES


async def generate_campaign_ideas(brand: dict, kb_summary: str, recent_themes: list[str]) -> dict:
    chat = LlmChat(
        api_key=API_KEY,
        session_id=f"campaign-{uuid.uuid4()}",
        system_message=(
            "You are a senior social media strategist. Respond with ONLY a JSON object. Schema: "
            "{\"campaigns\": [{\"name\": string, \"audience\": string, \"budget_usd\": int, "
            "\"expected_reach\": int, \"ad_copy\": string, \"creative_idea\": string, "
            "\"schedule\": string, \"hashtags\": [string]}]}"
        ),
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    prompt = (
        f"Brand: {brand.get('name')} ({brand.get('industry')}). Tone: {brand.get('tone')}.\n"
        f"Knowledge base summary: {kb_summary}\n"
        f"Recent comment themes: {recent_themes}\n"
        "Produce 3 strong campaign suggestions."
    )
    resp = await chat.send_message(UserMessage(text=prompt))
    return _extract_json(resp if isinstance(resp, str) else str(resp))




async def generate_dm_opener(comment_text: str, from_name: str, brand: dict, kb_summary: str) -> str:
    chat = LlmChat(
        api_key=API_KEY,
        session_id=f"dm-{uuid.uuid4()}",
        system_message=(
            "You write a short, personal DM opener to follow up with a high-intent prospect from a public comment. "
            "Rules: max 45 words, warm but professional, no emojis, no salesy buzzwords, reference what they asked. "
            f"Brand: {brand.get('name','')}. Tone: {brand.get('tone','friendly professional')}. "
            "Return ONLY the message body."
        ),
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    prompt = (
        f"Knowledge base context:\n{kb_summary or '(empty)'}\n\n"
        f"Prospect name: {from_name}\nTheir public comment: \"{comment_text}\"\n\nWrite the DM opener."
    )
    resp = await chat.send_message(UserMessage(text=prompt))
    return (resp if isinstance(resp, str) else str(resp)).strip().strip('"').strip()
