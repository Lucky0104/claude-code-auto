import os
import hmac
import hashlib
import httpx
from typing import Any

GRAPH = f"https://graph.facebook.com/{os.environ['FB_GRAPH_VERSION']}"
APP_ID = os.environ['FB_APP_ID']
APP_SECRET = os.environ['FB_APP_SECRET']
REDIRECT_URI = os.environ['FB_REDIRECT_URI']

DEFAULT_SCOPES = [
    "public_profile",
    "email",
    "pages_show_list",
    "business_management",
    "ads_read",
    "pages_read_engagement",
    "pages_manage_engagement",
    "instagram_manage_comments",
]


async def get_user_adaccounts(token: str) -> list[dict]:
    """Returns ad accounts the user has access to."""
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"{GRAPH}/me/adaccounts",
            params={
                "fields": "id,account_id,name,account_status",
                "access_token": token,
            },
        )
        r.raise_for_status()
        return r.json().get("data", [])


def login_dialog_url(state: str) -> str:
    scope = ",".join(DEFAULT_SCOPES)
    return (
        f"https://www.facebook.com/{os.environ['FB_GRAPH_VERSION']}/dialog/oauth"
        f"?client_id={APP_ID}&redirect_uri={REDIRECT_URI}"
        f"&state={state}&scope={scope}&response_type=code"
    )


def verify_signature(body: bytes, signature_header: str | None) -> bool:
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = signature_header.split("=", 1)[1]
    mac = hmac.new(APP_SECRET.encode(), msg=body, digestmod=hashlib.sha256).hexdigest()
    return hmac.compare_digest(mac, expected)


async def exchange_code_for_token(code: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"{GRAPH}/oauth/access_token",
            params={
                "client_id": APP_ID,
                "client_secret": APP_SECRET,
                "redirect_uri": REDIRECT_URI,
                "code": code,
            },
        )
        r.raise_for_status()
        return r.json()


async def get_long_lived_user_token(short_token: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"{GRAPH}/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": APP_ID,
                "client_secret": APP_SECRET,
                "fb_exchange_token": short_token,
            },
        )
        r.raise_for_status()
        return r.json()


async def get_me(token: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(f"{GRAPH}/me", params={"fields": "id,name,email,picture", "access_token": token})
        r.raise_for_status()
        return r.json()


async def get_user_pages(token: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"{GRAPH}/me/accounts",
            params={"fields": "id,name,access_token,category,fan_count,picture,tasks", "access_token": token},
        )
        r.raise_for_status()
        return r.json().get("data", [])


async def get_ig_account_for_page(page_id: str, page_token: str) -> dict | None:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"{GRAPH}/{page_id}",
            params={"fields": "instagram_business_account", "access_token": page_token},
        )
        r.raise_for_status()
        data = r.json()
        ig = data.get("instagram_business_account")
        if not ig:
            return None
        ig_id = ig["id"]
        r2 = await c.get(
            f"{GRAPH}/{ig_id}",
            params={"fields": "id,username,name,profile_picture_url,followers_count,media_count", "access_token": page_token},
        )
        r2.raise_for_status()
        return r2.json()


async def get_page_posts(page_id: str, page_token: str, limit: int = 25) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"{GRAPH}/{page_id}/posts",
            params={"fields": "id,message,created_time,permalink_url,full_picture", "limit": limit, "access_token": page_token},
        )
        r.raise_for_status()
        return r.json().get("data", [])


async def get_post_comments(post_id: str, page_token: str, limit: int = 50) -> list[dict]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(
            f"{GRAPH}/{post_id}/comments",
            params={"fields": "id,message,from,created_time,like_count", "limit": limit, "access_token": page_token},
        )
        r.raise_for_status()
        return r.json().get("data", [])


async def reply_to_comment(comment_id: str, message: str, page_token: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"{GRAPH}/{comment_id}/comments",
            data={"message": message, "access_token": page_token},
        )
        r.raise_for_status()
        return r.json()


async def hide_comment(comment_id: str, page_token: str, hidden: bool = True) -> dict:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{GRAPH}/{comment_id}", data={"is_hidden": str(hidden).lower(), "access_token": page_token})
        r.raise_for_status()
        return r.json()


async def subscribe_page(page_id: str, page_token: str) -> dict:
    """Subscribe webhook fields for a page."""
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"{GRAPH}/{page_id}/subscribed_apps",
            data={"subscribed_fields": "feed,comments,mention", "access_token": page_token},
        )
        return r.json()
