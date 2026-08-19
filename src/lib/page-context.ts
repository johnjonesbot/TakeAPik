import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
import { resolveActorFromToken, type Actor } from "@/services/sessions";
import { lookupTenantBySlug, type TenantContext, type TenantLookup } from "@/services/tenant-context";

export async function getPageActor(): Promise<Actor | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return resolveActorFromToken(token);
}

/** Resolve the album named in the URL path (/a/:slug). */
export async function getAlbumTenant(slug: string): Promise<TenantLookup> {
  return lookupTenantBySlug(slug);
}

export type MemberActor = Actor & { kind: "friend" | "admin" };

/**
 * The actor authorized for THIS album: their session's tenant must match the
 * album in the path. Super-admins are not automatically granted album access.
 * Returns null (caller shows the login form) otherwise.
 */
export async function getAuthorizedAlbumActor(
  slug: string
): Promise<{ actor: MemberActor; tenant: TenantContext } | null> {
  const [actor, tenant] = await Promise.all([getPageActor(), lookupTenantBySlug(slug)]);
  if (!actor || tenant.kind !== "tenant") return null;
  if (actor.kind === "super-admin") return null;
  if (actor.tenantId !== tenant.context.tenantId) return null;
  return { actor, tenant: tenant.context };
}

export async function getSuperAdminPageActor(): Promise<(Actor & { kind: "super-admin" }) | null> {
  const actor = await getPageActor();
  return actor && actor.kind === "super-admin" ? actor : null;
}
