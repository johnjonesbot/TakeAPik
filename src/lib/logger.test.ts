import { describe, expect, it } from "vitest";
import { redact } from "./logger";

describe("redact", () => {
  it("masks values under secret-looking keys at any depth", () => {
    const result = redact({
      userId: "u1",
      password: "hunter2",
      accessCode: "12345678",
      nested: { sessionToken: "abc", authorization: "Bearer x", safe: "keep" }
    }) as Record<string, unknown>;

    expect(result.userId).toBe("u1");
    expect(result.password).toBe("[redacted]");
    expect(result.accessCode).toBe("[redacted]");
    expect((result.nested as Record<string, unknown>).sessionToken).toBe("[redacted]");
    expect((result.nested as Record<string, unknown>).authorization).toBe("[redacted]");
    expect((result.nested as Record<string, unknown>).safe).toBe("keep");
  });

  it("masks emails and signed URLs by key", () => {
    const result = redact({ email: "person@example.com", signedUrl: "https://s3/x?sig=1" }) as Record<string, unknown>;
    expect(result.email).toBe("[redacted]");
    expect(result.signedUrl).toBe("[redacted]");
  });

  it("serializes errors without dropping the message", () => {
    const result = redact({ error: new Error("boom") }) as Record<string, unknown>;
    expect(result.error).toEqual({ name: "Error", message: "boom" });
  });

  it("handles arrays and depth limits without throwing", () => {
    expect(redact([{ token: "x" }])).toEqual([{ token: "[redacted]" }]);
    let deep: Record<string, unknown> = { value: 1 };
    for (let i = 0; i < 10; i += 1) deep = { child: deep };
    expect(() => redact(deep)).not.toThrow();
  });
});
