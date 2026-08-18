/** Case-, whitespace-, and unicode-normalized event name for comparisons. */
export function normalizeEventName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
