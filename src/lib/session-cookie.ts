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

export function sessionCookieOptions(): SessionCookieOptions {
  const env = getEnv();
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_HOURS * 60 * 60
  };
}

export function clearedSessionCookieOptions(): SessionCookieOptions {
  return { ...sessionCookieOptions(), maxAge: 0 };
}
