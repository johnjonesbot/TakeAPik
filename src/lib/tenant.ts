export const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "admin", "cdn", "media", "static", "support"]);

export type TenantResolution =
  | { kind: "root" }
  | { kind: "tenant"; slug: string }
  | { kind: "invalid"; reason: string };

export function normalizeHostname(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function resolveTenant(host: string, rootDomain: string, developmentSlug?: string): TenantResolution {
  const hostname = normalizeHostname(host);
  const root = normalizeHostname(rootDomain);

  if (developmentSlug && (hostname === "localhost" || hostname === "127.0.0.1")) {
    return isValidTenantSlug(developmentSlug)
      ? { kind: "tenant", slug: developmentSlug }
      : { kind: "invalid", reason: "Invalid development tenant slug" };
  }
  if (hostname === root || hostname === `www.${root}`) return { kind: "root" };
  if (!hostname.endsWith(`.${root}`)) return { kind: "invalid", reason: "Host is outside the configured root domain" };

  const slug = hostname.slice(0, -(root.length + 1));
  if (slug.includes(".")) return { kind: "invalid", reason: "Nested subdomains are not supported" };
  if (!isValidTenantSlug(slug)) return { kind: "invalid", reason: "Invalid or reserved tenant slug" };
  return { kind: "tenant", slug };
}

export function isValidTenantSlug(slug: string): boolean {
  return /^[a-z][a-z0-9-]{0,61}[a-z0-9]$/.test(slug) && !slug.includes("--") && !RESERVED_SUBDOMAINS.has(slug);
}
