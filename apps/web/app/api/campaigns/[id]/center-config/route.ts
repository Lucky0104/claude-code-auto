import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveTenant, requireRole, jsonError, HttpError } from "@/api/http";
import { configureCenter } from "@/features/campaigns/service";

const schema = z.object({
  centerName: z.string().optional().nullable(),
  doctorName: z.string().min(1, "Doctor name is required"),
  address: z.string().min(1, "Address is required"),
  phone: z.string().min(1, "Phone is required"),
  whatsapp: z.string().optional().nullable(),
  replyTemplate: z.string().optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await resolveTenant();
    requireRole(ctx, "OWNER", "ADMIN", "MANAGER");
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(422, parsed.error.issues.map((i) => i.message).join(", "));
    }
    const campaign = await configureCenter(ctx.activeTenantId, id, parsed.data, ctx.userId);
    return NextResponse.json({ campaign });
  } catch (e) {
    return jsonError(e);
  }
}
