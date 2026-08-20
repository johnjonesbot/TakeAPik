import { getEnv } from "@/lib/env";

export const SESSION_COOKIE_NAME = "takeapik_session";

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  // No `domain`: host-only cookies keep one album's session off sibling subdomains.
}

/** Cookie lifetime mirrors the session row's server-side expiry (per-role TTLs). */
export function sessionCookieOptions(expiresAt?: Date): SessionCookieOptions {
  const env = getEnv();
  const maxAge = expiresAt
    ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
    : env.SESSION_TTL_HOURS * 60 * 60;
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge
  };
}

export function clearedSessionCookieOptions(): SessionCookieOptions {
  return { ...sessionCookieOptions(), maxAge: 0 };
}
