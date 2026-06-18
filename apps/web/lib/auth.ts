import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRole, type Role } from "@/lib/rbac";

export const ACTIVE_TENANT_COOKIE = "crysta_active_tenant";

export interface Membership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: Role;
}

export interface AppContext {
  authUserId: string;
  userId: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  memberships: Membership[];
  activeTenantId: string | null;
  role: Role | null;
}

export interface TenantContext extends AppContext {
  activeTenantId: string;
  role: Role;
}

/** Resolve the current user + memberships + active tenant. Returns null when
 *  not authenticated. Ensures a `users` row exists (idempotent). */
export async function getContext(): Promise<AppContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const appUser = await prisma.user.upsert({
    where: { authUserId: user.id },
    update: {},
    create: {
      authUserId: user.id,
      email: user.email ?? "",
      fullName: (meta.full_name as string) ?? (meta.name as string) ?? null,
      avatarUrl: (meta.avatar_url as string) ?? (meta.picture as string) ?? null,
      facebookUserId: (meta.provider_id as string) ?? null,
    },
    include: { memberships: { include: { tenant: true } } },
  });

  const memberships: Membership[] = appUser.memberships.map((m) => ({
    tenantId: m.tenantId,
    tenantName: m.tenant.name,
    tenantSlug: m.tenant.slug,
    role: (isRole(m.role) ? m.role : "VIEWER") as Role,
  }));

  const cookieStore = await cookies();
  const cookieTenant = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value ?? null;
  const active =
    memberships.find((m) => m.tenantId === cookieTenant) ?? memberships[0] ?? null;

  return {
    authUserId: user.id,
    userId: appUser.id,
    email: appUser.email,
    fullName: appUser.fullName,
    avatarUrl: appUser.avatarUrl,
    memberships,
    activeTenantId: active?.tenantId ?? null,
    role: active?.role ?? null,
  };
}

export async function requireUser(): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function requireTenant(): Promise<TenantContext> {
  const ctx = await requireUser();
  if (!ctx.activeTenantId || !ctx.role) redirect("/onboarding");
  return ctx as TenantContext;
}

/** Throws `forbidden` when the active role is not allowed. */
export function assertRole(ctx: TenantContext, ...roles: Role[]): void {
  if (!roles.includes(ctx.role)) {
    throw new Error("forbidden");
  }
}
