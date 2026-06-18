import os
import jwt
from datetime import datetime, timezone, timedelta
from cryptography.fernet import Fernet

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"
JWT_EXP_DAYS = 7

_fernet = Fernet(os.environ['FERNET_KEY'].encode())


def encrypt_token(plain: str) -> str:
    return _fernet.encrypt(plain.encode()).decode()


def decrypt_token(enc: str) -> str:
    return _fernet.decrypt(enc.encode()).decode()


def create_jwt(user_id: str, tenant_id: str | None = None) -> str:
    payload = {
        "sub": user_id,
        "tid": tenant_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_jwt(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
