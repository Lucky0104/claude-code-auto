import { NextResponse } from "next/server";
import { resolveTenant, requireRole, jsonError } from "@/api/http";
import { setMonitoring } from "@/features/campaigns/service";

type Params = { params: Promise<{ id: string; postId: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const ctx = await resolveTenant();
    requireRole(ctx, "OWNER", "ADMIN", "MANAGER", "AGENT");
    const { id, postId } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await setMonitoring(
      ctx.activeTenantId,
      id,
      postId,
      true,
      ctx.userId,
      (body as { permalink?: string }).permalink ?? null,
    );
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await resolveTenant();
    requireRole(ctx, "OWNER", "ADMIN", "MANAGER", "AGENT");
    const { id, postId } = await params;
    const result = await setMonitoring(ctx.activeTenantId, id, postId, false, ctx.userId);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return jsonError(e);
  }
}
