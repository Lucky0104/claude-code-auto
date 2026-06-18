import os
from motor.motor_asyncio import AsyncIOMotorClient

_client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = _client[os.environ['DB_NAME']]

# Collections (all keyed by tenant_id where applicable)
users = db.users
tenants = db.tenants
members = db.tenant_members
pages = db.facebook_pages
ig_accounts = db.instagram_accounts
posts = db.posts
comments = db.comments
replies = db.replies
approvals = db.approval_queue
leads = db.leads
kb = db.knowledge_base
campaigns = db.campaigns
notifications = db.notifications
audit_logs = db.audit_logs
webhook_events = db.webhook_events
invites = db.team_invites
settings_col = db.tenant_settings
# New collections for Crysta IVF auto-comment bot
comment_logs = db.comment_logs
monitored_posts = db.monitored_posts


async def ensure_indexes():
    await users.create_index("fb_user_id", unique=True, sparse=True)
    await users.create_index("email")
    await members.create_index([("user_id", 1), ("tenant_id", 1)], unique=True)
    await pages.create_index([("tenant_id", 1), ("page_id", 1)], unique=True)
    await ig_accounts.create_index([("tenant_id", 1), ("ig_id", 1)], unique=True)
    await comments.create_index([("tenant_id", 1), ("comment_id", 1)], unique=True)
    await comments.create_index([("tenant_id", 1), ("created_at", -1)])
    await leads.create_index([("tenant_id", 1), ("created_at", -1)])
    await approvals.create_index([("tenant_id", 1), ("status", 1)])
    await kb.create_index([("tenant_id", 1), ("kind", 1)])
    await invites.create_index("token", unique=True)
    await audit_logs.create_index([("tenant_id", 1), ("at", -1)])
    await notifications.create_index([("tenant_id", 1), ("user_id", 1), ("read", 1)])
    await campaigns.create_index([("tenant_id", 1), ("created_at", -1)])
    # OAuth state with 10-min TTL (Mongo TTL only triggers on Date BSON, so we store epoch seconds in expires_at)
    await db.oauth_states.create_index("expires_at", expireAfterSeconds=0)

    # --- Crysta IVF auto-comment bot indexes ---
    await comment_logs.create_index("comment_id", unique=True)
    await monitored_posts.create_index(
        [("instagram_post_id", 1), ("tenant_id", 1)], unique=True
    )
    await campaigns.create_index([("tenant_id", 1), ("meta_synced_at", -1)])
