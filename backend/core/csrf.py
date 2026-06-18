"""CSRF double-submit cookie middleware.

Strategy:
- On the first request without a `dashai_csrf` cookie, the middleware sets one (non-httpOnly).
- On state-mutating requests (POST/PATCH/PUT/DELETE), the client must send the same value
  back as the `X-CSRF-Token` header. The frontend axios interceptor reads the cookie and adds it.
- The webhook endpoint `/api/webhooks/meta` is exempt (Meta signs requests with App Secret HMAC).
- The OAuth callback `/api/auth/facebook/callback` is GET and exempt by method.
"""
import secrets
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, JSONResponse

CSRF_COOKIE = "dashai_csrf"
CSRF_HEADER = "x-csrf-token"
EXEMPT_PATHS = {"/api/webhooks/meta"}
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        method = request.method.upper()
        cookie_val = request.cookies.get(CSRF_COOKIE)

        if method not in SAFE_METHODS and path not in EXEMPT_PATHS:
            sent = request.headers.get(CSRF_HEADER)
            if not cookie_val or not sent or not secrets.compare_digest(cookie_val, sent):
                return JSONResponse({"detail": "CSRF token missing or invalid"}, status_code=403)

        response: Response = await call_next(request)
        if not cookie_val:
            new_val = secrets.token_urlsafe(24)
            response.set_cookie(
                key=CSRF_COOKIE, value=new_val, max_age=7 * 24 * 3600,
                httponly=False, secure=True, samesite="lax", path="/",
            )
        return response
