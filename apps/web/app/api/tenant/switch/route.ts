import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getContext, ACTIVE_TENANT_COOKIE } from "@/lib/auth";
import { jsonError, HttpError } from "@/api/http";

export async function POST(req: Request) {
  try {
    const ctx = await getContext();
    if (!ctx) throw new HttpError(401, "Unauthorized");
    const body = (await req.json().catch(() => ({}))) as { tenantId?: string };
    const tenantId = body.tenantId;
    if (!tenantId || !ctx.memberships.some((m) => m.tenantId === tenantId)) {
      throw new HttpError(403, "Not a member of that tenant");
    }
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_TENANT_COOKIE, tenantId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return NextResponse.json({ success: true, activeTenantId: tenantId });
  } catch (e) {
    return jsonError(e);
  }
}
