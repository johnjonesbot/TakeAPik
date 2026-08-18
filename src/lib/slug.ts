import { isValidTenantSlug } from "@/lib/tenant";

/**
 * Lowercase initials of up to four name words, e.g. "John Jones" → "jj".
 * Falls back to the first two letters of the name when only one word exists.
 */
export function initialsFromName(displayName: string): string {
  const words = displayName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/[\s-]+/)
    .filter(Boolean);
  const base =
    words.length >= 2
      ? words.slice(0, 4).map((word) => word[0]).join("")
      : (words[0] ?? "").slice(0, 2);
  const padded = base.length < 2 ? `${base}xx`.slice(0, 2) : base;
  return /^[a-z]/.test(padded) ? padded : `x${padded}`.slice(0, 4);
}

const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz";

/**
 * Deterministic candidate sequence: `jj`, then `jj1a` … `jj1z`, `jj2a` … The
 * caller inserts each candidate and advances on a unique violation, so the
 * database constraint — not a check-then-insert — is the authority.
 */
export function* slugCandidates(base: string, maxAttempts = 40): Generator<string> {
  if (isValidTenantSlug(base)) yield base;
  let produced = 0;
  for (let round = 1; produced < maxAttempts; round += 1) {
    for (const letter of SUFFIX_ALPHABET) {
      const candidate = `${base}${round}${letter}`;
      if (isValidTenantSlug(candidate)) {
        yield candidate;
        produced += 1;
        if (produced >= maxAttempts) return;
      }
    }
  }
}
