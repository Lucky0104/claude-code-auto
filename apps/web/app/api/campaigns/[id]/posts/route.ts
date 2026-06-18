import { NextResponse } from "next/server";
import { resolveTenant, jsonError } from "@/api/http";
import { listCampaignPosts } from "@/features/campaigns/service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await resolveTenant();
    const { id } = await params;
    const posts = await listCampaignPosts(ctx.activeTenantId, id);
    return NextResponse.json({ posts });
  } catch (e) {
    return jsonError(e);
  }
}
