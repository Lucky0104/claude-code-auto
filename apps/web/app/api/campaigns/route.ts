import { NextResponse } from "next/server";
import { resolveTenant, jsonError } from "@/api/http";
import { listCampaigns } from "@/features/campaigns/service";

export async function GET() {
  try {
    const ctx = await resolveTenant();
    const campaigns = await listCampaigns(ctx.activeTenantId);
    return NextResponse.json({ campaigns });
  } catch (e) {
    return jsonError(e);
  }
}
