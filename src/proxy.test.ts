import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function requestWith(proto?: string): NextRequest {
  const headers = new Headers();
  if (proto) headers.set("x-forwarded-proto", proto);
  return new NextRequest("https://takeapik.com/a/jj?x=1", { headers });
}

describe("proxy", () => {
  it("redirects forwarded plain-HTTP requests to https with 308", () => {
    const response = proxy(requestWith("http"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://takeapik.com/a/jj?x=1");
  });

  it("serves forwarded https requests with the strict nonce CSP", () => {
    const response = proxy(requestWith("https"));
    expect(response.status).toBe(200);
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self' 'nonce-");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=63072000");
  });

  it("does not redirect local requests that have no forwarded proto", () => {
    const response = proxy(requestWith(undefined));
    expect(response.status).toBe(200);
  });
});
