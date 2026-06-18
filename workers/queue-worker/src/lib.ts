/** Safe reply-template rendering (mirror of apps/web/lib/templates renderTemplate). */
export const ALLOWED_PLACEHOLDERS = [
  "doctor_name",
  "center_name",
  "phone",
  "address",
  "whatsapp",
] as const;

const PLACEHOLDER_RE = /\{([a-zA-Z0-9_]+)\}/g;

export const DEFAULT_TEMPLATE =
  "Thank you for reaching out to {center_name}. Dr. {doctor_name} and our fertility experts would be happy to assist you. Contact us at {phone} or visit us at {address}.";

export function renderTemplate(
  template: string | null | undefined,
  vars: Record<string, string | null | undefined>,
): string {
  const tpl = template && template.trim() ? template : DEFAULT_TEMPLATE;
  const allowed = new Set<string>(ALLOWED_PLACEHOLDERS);
  return tpl
    .replace(PLACEHOLDER_RE, (match, key: string) =>
      allowed.has(key) ? (vars[key] ?? "").toString() : match,
    )
    .trim();
}
