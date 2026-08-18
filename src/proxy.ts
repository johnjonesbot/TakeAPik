import { NextRequest, NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const result = resolveTenant(
    request.headers.get("host") ?? "",
    process.env.ROOT_DOMAIN ?? "localhost:3000",
    process.env.DEV_TENANT_SLUG
  );

  if (result.kind === "tenant") response.headers.set("x-takeapik-tenant", result.slug);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("permissions-policy", "camera=(self), geolocation=(), microphone=()");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
