import { z } from "zod";

/**
 * Environment access. Server vars are validated lazily (so `next build` does not
 * crash when secrets are absent in the build environment). Public vars are
 * inlined by Next at build time.
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  FB_GRAPH_VERSION: z.string().default("v21.0"),
  FB_APP_ID: z.string().optional(),
  FB_APP_SECRET: z.string().optional(),
  FB_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  SYNC_RATE_LIMIT_SECONDS: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment: ${parsed.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}`,
    );
  }
  cached = parsed.data;
  return cached;
}

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
  posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
} as const;
