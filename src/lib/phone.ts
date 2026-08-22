/**
 * Normalize a phone number to E.164 (+ and digits). A bare 10-digit number is
 * assumed North American (+1); an 11-digit number starting with 1 is treated
 * the same. Anything that can't be resolved to a plausible international number
 * returns null so the caller can reject it.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (hasPlus) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** A light readability format for display; falls back to the raw value. */
export function formatPhone(e164: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `+1 (${match[1]}) ${match[2]}-${match[3]}` : e164;
}
