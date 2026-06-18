/**
 * Reply template rendering + input sanitisation.
 *
 * Reply text is posted publicly to Instagram, so we strip control characters,
 * cap length, and only substitute an allow-list of placeholders (preventing
 * template injection — unknown `{tokens}` are left as literal text and never
 * evaluated). Pure module: safe to import from the app, tests, and workers.
 */
export const ALLOWED_PLACEHOLDERS = [
  "doctor_name",
  "center_name",
  "phone",
  "address",
  "whatsapp",
] as const;

export type PlaceholderKey = (typeof ALLOWED_PLACEHOLDERS)[number];
export type TemplateVars = Partial<Record<PlaceholderKey, string | null | undefined>>;

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const PLACEHOLDER_RE = /\{([a-zA-Z0-9_]+)\}/g;

export const MAX_FIELD_LEN = 300;
export const MAX_TEMPLATE_LEN = 2000;

export const DEFAULT_TEMPLATE =
  "Thank you for reaching out to {center_name}. Dr. {doctor_name} and our fertility experts would be happy to assist you. Contact us at {phone} or visit us at {address}.";

/** Clean a short free-text field (name/address/phone/whatsapp). */
export function sanitizeField(
  value: string | null | undefined,
  maxLen: number = MAX_FIELD_LEN,
): string | null {
  if (value === null || value === undefined) return null;
  let cleaned = value.replace(CONTROL_RE, "");
  cleaned = cleaned.replace(/[ \t\r\f\v]+/g, " ").trim();
  if (cleaned.length > maxLen) cleaned = cleaned.slice(0, maxLen).trimEnd();
  return cleaned;
}

/** Clean a reply template, preserving newlines and {placeholders}. */
export function sanitizeTemplate(
  value: string | null | undefined,
  maxLen: number = MAX_TEMPLATE_LEN,
): string | null {
  if (value === null || value === undefined) return null;
  let cleaned = value.replace(CONTROL_RE, "");
  cleaned = cleaned.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  cleaned = cleaned
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length > maxLen) cleaned = cleaned.slice(0, maxLen).trimEnd();
  return cleaned;
}

/** Placeholder names used in a template that the renderer does not understand. */
export function unknownPlaceholders(template: string | null | undefined): string[] {
  if (!template) return [];
  const found = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER_RE)) found.add(m[1]!);
  const allowed = new Set<string>(ALLOWED_PLACEHOLDERS);
  return [...found].filter((k) => !allowed.has(k)).sort();
}

/**
 * Render a reply. Falls back to the default template when none is provided.
 * Only allow-listed placeholders are substituted; anything else stays literal.
 */
export function renderTemplate(
  template: string | null | undefined,
  vars: TemplateVars,
): string {
  const tpl = template && template.trim() ? template : DEFAULT_TEMPLATE;
  const allowed = new Set<string>(ALLOWED_PLACEHOLDERS);
  return tpl
    .replace(PLACEHOLDER_RE, (match, key: string) => {
      if (allowed.has(key)) {
        const val = vars[key as PlaceholderKey];
        return (val ?? "").toString();
      }
      return match;
    })
    .trim();
}
