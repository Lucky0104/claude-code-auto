import "server-only";
import { NextResponse } from "next/server";
import { getContext, type TenantContext } from "@/lib/auth";
import { hasRole, type Role } from "@/lib/rbac";
import { captureError } from "@/lib/observability";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Resolve the authenticated tenant context or throw an HttpError. */
export async function resolveTenant(): Promise<TenantContext> {
  const ctx = await getContext();
  if (!ctx) throw new HttpError(401, "Unauthorized");
  if (!ctx.activeTenantId || !ctx.role) throw new HttpError(403, "No active tenant");
  return ctx as TenantContext;
}

export function requireRole(ctx: TenantContext, ...roles: Role[]): void {
  if (!hasRole(ctx.role, ...roles)) throw new HttpError(403, "Forbidden");
}

/** Convert any thrown error into a JSON response with the right status. */
export function jsonError(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const maybeStatus = (e as { status?: unknown })?.status;
  const status = typeof maybeStatus === "number" ? maybeStatus : 500;
  if (status >= 500) captureError(e, { scope: "api" });
  const message = e instanceof Error ? e.message : "Internal error";
  return NextResponse.json({ error: message }, { status });
}
