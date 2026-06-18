import { NextResponse } from "next/server";
import { resolveTenant, jsonError, HttpError } from "@/api/http";
import { getCampaign } from "@/features/campaigns/service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await resolveTenant();
    const { id } = await params;
    const campaign = await getCampaign(ctx.activeTenantId, id);
    if (!campaign) throw new HttpError(404, "Campaign not found");
    return NextResponse.json({ campaign });
  } catch (e) {
    return jsonError(e);
  }
}
