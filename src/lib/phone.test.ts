import { describe, expect, it } from "vitest";
import { normalizePhone, formatPhone } from "./phone";

describe("normalizePhone", () => {
  it("normalizes US numbers to E.164", () => {
    expect(normalizePhone("(305) 555-0142")).toBe("+13055550142");
    expect(normalizePhone("305-555-0142")).toBe("+13055550142");
    expect(normalizePhone("13055550142")).toBe("+13055550142");
    expect(normalizePhone("+1 305 555 0142")).toBe("+13055550142");
  });

  it("keeps valid international numbers", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("rejects junk", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
  });

  it("formats US numbers for display", () => {
    expect(formatPhone("+13055550142")).toBe("+1 (305) 555-0142");
    expect(formatPhone("+442079460958")).toBe("+442079460958");
  });
});
