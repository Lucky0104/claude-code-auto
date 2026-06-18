from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime, timezone
import uuid


def _now():
    return datetime.now(timezone.utc).isoformat()


def _id():
    return str(uuid.uuid4())


class OnboardingPayload(BaseModel):
    business_name: str
    industry: Optional[str] = ""
    website: Optional[str] = ""
    description: Optional[str] = ""
    timezone: Optional[str] = "UTC"
    support_email: Optional[str] = ""
    support_phone: Optional[str] = ""
    brand_tone: Optional[str] = "friendly professional"
    reply_style: Optional[str] = "concise"


class KBEntry(BaseModel):
    id: str = Field(default_factory=_id)
    kind: str  # product | service | faq | policy | info
    title: str
    content: str
    created_at: str = Field(default_factory=_now)


class KBEntryCreate(BaseModel):
    kind: str
    title: str
    content: str


class InviteCreate(BaseModel):
    email: EmailStr
    role: str  # owner|admin|moderator|viewer


class ApprovalAction(BaseModel):
    action: str  # approve | edit | reject
    edited_reply: Optional[str] = None


class TenantUpdate(BaseModel):
    business_name: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None
    brand_tone: Optional[str] = None
    reply_style: Optional[str] = None
    support_email: Optional[str] = None
    support_phone: Optional[str] = None
    timezone: Optional[str] = None
    auto_reply_enabled: Optional[bool] = None
