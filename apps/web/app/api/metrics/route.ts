import { NextResponse } from "next/server";
import { resolveTenant, jsonError } from "@/api/http";
import { getDashboardMetrics } from "@/features/dashboard/service";

export async function GET() {
  try {
    const ctx = await resolveTenant();
    const metrics = await getDashboardMetrics(ctx.activeTenantId);
    return NextResponse.json(metrics);
  } catch (e) {
    return jsonError(e);
  }
}
