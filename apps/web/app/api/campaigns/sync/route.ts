import { NextResponse } from "next/server";
import { resolveTenant, requireRole, jsonError } from "@/api/http";
import { syncCampaigns } from "@/features/campaigns/service";
import { checkCooldown, syncCooldownSeconds } from "@/lib/rate-limit";
import { trackServer } from "@/lib/observability";

export async function POST() {
  try {
    const ctx = await resolveTenant();
    requireRole(ctx, "OWNER", "ADMIN", "MANAGER");

    const { allowed, retryAfter } = checkCooldown(
      `sync:${ctx.activeTenantId}`,
      syncCooldownSeconds(),
    );
    if (!allowed) {
      return NextResponse.json(
        { error: `Sync rate limit, try again in ${retryAfter}s` },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const result = await syncCampaigns(ctx.activeTenantId);
    trackServer("campaigns_synced", ctx.userId, {
      tenantId: ctx.activeTenantId,
      count: result.count,
    });
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e);
  }
}
