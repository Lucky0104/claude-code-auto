import "server-only";
import type { Session } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { getUserPages, getUserAdAccounts, getLongLivedUserToken } from "@/lib/meta";
import { captureError, logEvent } from "@/lib/observability";

/**
 * Runs after a successful Supabase Facebook login: ensures the app user +
 * a default tenant exist, captures the (long-lived) provider token into the
 * server-only facebook_identities table, and syncs pages + ad accounts.
 */
export async function afterFacebookLogin(session: Session): Promise<void> {
  const authUser = session.user;
  const meta = (authUser.user_metadata ?? {}) as Record<string, string | undefined>;

  const appUser = await prisma.user.upsert({
    where: { authUserId: authUser.id },
    update: {
      email: authUser.email ?? "",
      fullName: meta.full_name ?? meta.name ?? null,
      avatarUrl: meta.avatar_url ?? meta.picture ?? null,
      facebookUserId: meta.provider_id ?? null,
    },
    create: {
      authUserId: authUser.id,
      email: authUser.email ?? "",
      fullName: meta.full_name ?? meta.name ?? null,
      avatarUrl: meta.avatar_url ?? meta.picture ?? null,
      facebookUserId: meta.provider_id ?? null,
    },
    include: { memberships: true },
  });

  // Bootstrap a default tenant on first login.
  if (appUser.memberships.length === 0) {
    await prisma.tenant.create({
      data: {
        name: meta.full_name ? `${meta.full_name}'s Workspace` : "My Workspace",
        slug: `t-${appUser.id.slice(0, 8)}-${Date.now().toString(36)}`,
        members: { create: { userId: appUser.id, role: "OWNER" } },
        settings: { create: {} },
      },
    });
  }

  const providerToken = session.provider_token ?? undefined;
  if (!providerToken) return;

  // Prefer a long-lived token when app credentials are configured.
  let token = providerToken;
  try {
    const appId = process.env.FB_APP_ID;
    const appSecret = process.env.FB_APP_SECRET;
    if (appId && appSecret) {
      const ll = await getLongLivedUserToken(providerToken, appId, appSecret);
      token = ll.access_token ?? providerToken;
    }
  } catch (e) {
    captureError(e, { scope: "longLivedToken" });
  }

  await prisma.facebookIdentity.upsert({
    where: { userId: appUser.id },
    update: { accessToken: token, facebookUserId: meta.provider_id ?? "" },
    create: { userId: appUser.id, accessToken: token, facebookUserId: meta.provider_id ?? "" },
  });

  const membership = await prisma.teamMember.findFirst({
    where: { userId: appUser.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return;
  const tenantId = membership.tenantId;

  // Sync pages.
  try {
    const pages = await getUserPages(token);
    for (const p of pages) {
      await prisma.facebookPage.upsert({
        where: { tenantId_pageId: { tenantId, pageId: p.id } },
        update: {
          name: p.name,
          category: p.category ?? null,
          fanCount: p.fan_count ?? null,
          picture: p.picture?.data?.url ?? null,
          accessToken: p.access_token,
          isActive: true,
        },
        create: {
          tenantId,
          pageId: p.id,
          name: p.name,
          category: p.category ?? null,
          fanCount: p.fan_count ?? null,
          picture: p.picture?.data?.url ?? null,
          accessToken: p.access_token,
          isActive: true,
        },
      });
    }
  } catch (e) {
    captureError(e, { scope: "syncPages" });
  }

  // Sync ad accounts (mark the first ACTIVE one as the active account).
  try {
    const accounts = await getUserAdAccounts(token);
    let activeChosen = false;
    for (const a of accounts) {
      const makeActive = a.account_status === 1 && !activeChosen;
      if (makeActive) activeChosen = true;
      await prisma.adAccount.upsert({
        where: { tenantId_adAccountId: { tenantId, adAccountId: a.account_id } },
        update: { name: a.name ?? null, accountStatus: a.account_status ?? null },
        create: {
          tenantId,
          adAccountId: a.account_id,
          name: a.name ?? null,
          accountStatus: a.account_status ?? null,
          isActive: makeActive,
        },
      });
    }
  } catch (e) {
    captureError(e, { scope: "syncAdAccounts" });
  }

  logEvent("auth.facebook_login", { tenantId, userId: appUser.id });
}
