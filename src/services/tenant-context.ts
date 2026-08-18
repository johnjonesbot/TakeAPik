import { getPool } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { findActiveTenantBySlug } from "@/lib/repositories/tenants";
import { resolveTenant } from "@/lib/tenant";
import type { TenantRow } from "@/lib/repositories/types";

export interface TenantContext {
  tenantId: string;
  slug: string;
  displayName: string;
}

export type TenantLookup =
  | { kind: "root" }
  | { kind: "tenant"; context: TenantContext }
  /** Covers invalid hosts, unknown slugs, and archived tenants alike so
   * responses cannot be used to enumerate which albums exist. */
  | { kind: "unavailable" };

export function toTenantContext(tenant: TenantRow): TenantContext {
  return { tenantId: tenant.id, slug: tenant.slug, displayName: tenant.display_name };
}

/**
 * Resolve a request Host header to an active tenant. Archived and missing
 * tenants are indistinguishable to the caller.
 */
export async function lookupTenantByHost(host: string): Promise<TenantLookup> {
  const env = getEnv();
  const resolution = resolveTenant(host, env.ROOT_DOMAIN, env.DEV_TENANT_SLUG);
  if (resolution.kind === "root") return { kind: "root" };
  if (resolution.kind === "invalid") return { kind: "unavailable" };

  const tenant = await findActiveTenantBySlug(getPool(), resolution.slug);
  if (!tenant) return { kind: "unavailable" };
  return { kind: "tenant", context: toTenantContext(tenant) };
}
