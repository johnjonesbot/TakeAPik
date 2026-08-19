import { getPool } from "@/lib/db";
import { findActiveTenantBySlug } from "@/lib/repositories/tenants";
import { isValidTenantSlug } from "@/lib/tenant";
import type { TenantRow } from "@/lib/repositories/types";

export interface TenantContext {
  tenantId: string;
  slug: string;
  displayName: string;
}

export type TenantLookup =
  | { kind: "tenant"; context: TenantContext }
  /** Covers invalid, unknown, and archived slugs alike so responses cannot be
   * used to enumerate which albums exist. */
  | { kind: "unavailable" };

export function toTenantContext(tenant: TenantRow): TenantContext {
  return { tenantId: tenant.id, slug: tenant.slug, displayName: tenant.display_name };
}

/**
 * Resolve an album slug (from the URL path, e.g. /a/:slug) to an active
 * tenant. Archived and missing albums are indistinguishable to the caller.
 * Tenancy is path-derived (ADR-004): the slug never grants access on its own —
 * authorization always compares it against the session's tenant.
 */
export async function lookupTenantBySlug(slug: string): Promise<TenantLookup> {
  if (!isValidTenantSlug(slug)) return { kind: "unavailable" };
  const tenant = await findActiveTenantBySlug(getPool(), slug);
  if (!tenant) return { kind: "unavailable" };
  return { kind: "tenant", context: toTenantContext(tenant) };
}
