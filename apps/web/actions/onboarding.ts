"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getContext } from "@/lib/auth";

export async function createWorkspace(formData: FormData): Promise<void> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  const name = ((formData.get("name") as string) ?? "").trim() || "My Workspace";
  await prisma.tenant.create({
    data: {
      name,
      slug: `t-${ctx.userId.slice(0, 8)}-${Date.now().toString(36)}`,
      members: { create: { userId: ctx.userId, role: "OWNER" } },
      settings: { create: {} },
    },
  });
  redirect("/dashboard");
}
