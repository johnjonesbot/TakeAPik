import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./normalize";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
  });
});
