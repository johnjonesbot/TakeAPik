import { describe, expect, it } from "vitest";
import { openSecret, sealSecret } from "./secret-box";

describe("secret-box", () => {
  it("round-trips a secret", () => {
    const sealed = sealSecret("JBSWY3DPEHPK3PXP", "totp");
    expect(sealed).not.toContain("JBSWY3DP");
    expect(openSecret(sealed, "totp")).toBe("JBSWY3DPEHPK3PXP");
  });

  it("binds ciphertext to its purpose", () => {
    const sealed = sealSecret("value", "totp");
    expect(() => openSecret(sealed, "other-purpose")).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const sealed = sealSecret("value", "totp");
    const [iv, data, tag] = sealed.split(".");
    const tampered = [iv, data?.replace(/^./, data[0] === "A" ? "B" : "A"), tag].join(".");
    expect(() => openSecret(tampered, "totp")).toThrow();
  });
});
