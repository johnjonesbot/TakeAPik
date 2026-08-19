import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

function requestFor(opts: { proto?: string; host?: string } = {}): NextRequest {
  process.env.TRUST_PROXY = "true";
  const headers = new Headers();
  if (opts.proto) headers.set("x-forwarded-proto", opts.proto);
  if (opts.host) headers.set("host", opts.host);
  // The internal URL a standalone server actually sees; the public host must
  // never be derived from it.
  return new NextRequest("http://0.0.0.0:3000/a/jj?x=1", { headers });
}

describe("proxy", () => {
  it("redirects forwarded plain-HTTP requests to https on the public host", () => {
    const response = proxy(requestFor({ proto: "http", host: "takeapik.com" }));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://takeapik.com/a/jj?x=1");
  });

  it("redirects www to the apex origin", () => {
    const response = proxy(requestFor({ proto: "https", host: "www.takeapik.com" }));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://takeapik.com/a/jj?x=1");
  });

  it("serves forwarded https apex requests with the strict nonce CSP", () => {
    const response = proxy(requestFor({ proto: "https", host: "takeapik.com" }));
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
    const response = proxy(requestFor({ host: "localhost:3000" }));
    expect(response.status).toBe(200);
  });

  it("ignores forwarded proto when the proxy is not trusted (local next start)", () => {
    const request = requestFor({ proto: "http", host: "localhost:3000" });
    process.env.TRUST_PROXY = "false";
    const response = proxy(request);
    expect(response.status).toBe(200);
  });
});
