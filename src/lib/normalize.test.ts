import { describe, expect, it } from "vitest";
import { normalizeEmail, normalizeEventName } from "./normalize";

describe("normalizeEventName", () => {
  it("ignores case, extra whitespace, and unicode form", () => {
    expect(normalizeEventName("  Maya & Leo  ")).toBe("maya & leo");
    expect(normalizeEventName("MAYA   &\tLEO")).toBe("maya & leo");
    expect(normalizeEventName("Café Night")).toBe(normalizeEventName("Café Night"));
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
  });
});
