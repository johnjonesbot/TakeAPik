import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
import { resolveActorFromToken, type Actor } from "@/services/sessions";

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

export async function getRequestActor(request: NextRequest): Promise<Actor | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return resolveActorFromToken(token);
}

/**
 * The signed-in actor from the session cookie, or null. Tenancy is carried by
 * the session itself (ADR-004): the session row binds an actor to exactly one
 * tenant, and every tenant-owned query is scoped by that tenant id, so a
 * session can never reach another album's data regardless of the URL.
 */
export async function getAuthorizedActor(request: NextRequest): Promise<{ actor: Actor } | null> {
  const actor = await getRequestActor(request);
  return actor ? { actor } : null;
}
