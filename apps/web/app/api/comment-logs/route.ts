import { NextResponse } from "next/server";
import { resolveTenant, jsonError } from "@/api/http";
import { listCommentLogs } from "@/features/comments/service";
import type { CommentLogStatus } from "@/types";

export async function GET(req: Request) {
  try {
    const ctx = await resolveTenant();
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const result = await listCommentLogs(ctx.activeTenantId, {
      campaignId: searchParams.get("campaignId") ?? undefined,
      centerName: searchParams.get("centerName") ?? undefined,
      status: (statusParam as CommentLogStatus) ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      page: Number(searchParams.get("page") ?? "1"),
      pageSize: Number(searchParams.get("pageSize") ?? "20"),
    });
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e);
  }
}
