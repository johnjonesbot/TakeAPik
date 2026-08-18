import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecret, totpCode, verifyTotpCode } from "./totp";

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    const buffer = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 42]);
    expect(base32Decode(base32Encode(buffer))).toEqual(buffer);
  });
});

describe("totp", () => {
  // RFC 6238 SHA-1 test vector: secret "12345678901234567890", T=59s → 94287082 (8 digits; last 6: 287082)
  const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

  it("matches the RFC 6238 test vector", () => {
    expect(totpCode(RFC_SECRET, 59_000)).toBe("287082");
  });

  it("verifies current codes and rejects wrong ones", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotpCode(secret, totpCode(secret, now), now)).toBe(true);
    expect(verifyTotpCode(secret, "000000", now)).toBe(false);
    expect(verifyTotpCode(secret, "not-num", now)).toBe(false);
  });

  it("accepts one step of clock drift but not two", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotpCode(secret, totpCode(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotpCode(secret, totpCode(secret, now + 30_000), now)).toBe(true);
    expect(verifyTotpCode(secret, totpCode(secret, now - 90_000), now)).toBe(false);
  });
});
