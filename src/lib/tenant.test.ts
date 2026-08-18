import { describe, expect, it } from "vitest";
import { isValidTenantSlug, normalizeHostname, resolveTenant } from "./tenant";

describe("tenant resolution", () => {
  it("normalizes ports and case", () => expect(normalizeHostname("JJ.TakeAPik.com:443")).toBe("jj.takeapik.com"));
  it("recognizes the root host", () => expect(resolveTenant("takeapik.com", "takeapik.com")).toEqual({ kind: "root" }));
  it("resolves one tenant label", () => expect(resolveTenant("jj.takeapik.com", "takeapik.com")).toEqual({ kind: "tenant", slug: "jj" }));
  it("rejects nested and foreign hosts", () => {
    expect(resolveTenant("a.jj.takeapik.com", "takeapik.com").kind).toBe("invalid");
    expect(resolveTenant("takeapik.com.attacker.test", "takeapik.com").kind).toBe("invalid");
  });
  it("rejects reserved or malformed slugs", () => {
    expect(isValidTenantSlug("admin")).toBe(false);
    expect(isValidTenantSlug("j--j")).toBe(false);
    expect(isValidTenantSlug("jj1a")).toBe(true);
  });
});
