import { cookies, headers } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
import { resolveActorFromToken, type Actor } from "@/services/sessions";
import { lookupTenantByHost, type TenantLookup } from "@/services/tenant-context";

/** Server-component variants of the request-context helpers. */
export async function getPageTenant(): Promise<TenantLookup> {
  const headerList = await headers();
  return lookupTenantByHost(headerList.get("host") ?? "");
}

export async function getPageActor(): Promise<Actor | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return resolveActorFromToken(token);
}

/** Actor already validated against the page's tenant surface; null otherwise. */
export async function getAuthorizedPageActor(): Promise<{ actor: Actor; tenant: TenantLookup } | null> {
  const [actor, tenant] = await Promise.all([getPageActor(), getPageTenant()]);
  if (!actor) return null;
  if (actor.kind === "super-admin") return tenant.kind === "root" ? { actor, tenant } : null;
  if (tenant.kind !== "tenant" || tenant.context.tenantId !== actor.tenantId) return null;
  return { actor, tenant };
}
