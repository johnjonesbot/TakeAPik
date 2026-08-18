import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
import { resolveActorFromToken, type Actor } from "@/services/sessions";
import { lookupTenantByHost, type TenantLookup } from "@/services/tenant-context";

/** Origin check for mutations: same-origin fetch metadata or a matching Origin host. */
export function isSameOriginRequest(request: NextRequest): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin") return true;
  if (secFetchSite && secFetchSite !== "none") return false;

  const origin = request.headers.get("origin");
  if (!origin) return request.method === "GET" || request.method === "HEAD";
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/** Keyed IP/user-agent hashes so logs and sessions never hold raw values. */
export function fingerprintHash(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return createHmac("sha256", getEnv().TOKEN_HASH_PEPPER).update(value).digest("hex").slice(0, 32);
}

export function requestIpHash(request: NextRequest): string | undefined {
  const env = getEnv();
  const forwarded = env.TRUST_PROXY ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined;
  return fingerprintHash(forwarded ?? "direct");
}

export async function getRequestTenant(request: NextRequest): Promise<TenantLookup> {
  return lookupTenantByHost(request.headers.get("host") ?? "");
}

export async function getRequestActor(request: NextRequest): Promise<Actor | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return resolveActorFromToken(token);
}

/**
 * Actor valid for this request's tenant surface: a friend/admin actor must
 * belong to the host-resolved tenant; a super-admin actor is only valid on
 * the root surface.
 */
export async function getAuthorizedActor(request: NextRequest): Promise<{ actor: Actor; tenant: TenantLookup } | null> {
  const [actor, tenant] = await Promise.all([getRequestActor(request), getRequestTenant(request)]);
  if (!actor) return null;
  if (actor.kind === "super-admin") {
    return tenant.kind === "root" ? { actor, tenant } : null;
  }
  if (tenant.kind !== "tenant" || tenant.context.tenantId !== actor.tenantId) return null;
  return { actor, tenant };
}
