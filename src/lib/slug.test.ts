import { describe, expect, it } from "vitest";
import { initialsFromName, slugCandidates } from "./slug";

describe("initialsFromName", () => {
  it("uses initials for multi-word names", () => {
    expect(initialsFromName("John Jones")).toBe("jj");
    expect(initialsFromName("Mary Ann Major-Smith")).toBe("mams");
  });

  it("uses leading letters for single-word names", () => {
    expect(initialsFromName("Beyonce")).toBe("be");
  });

  it("normalizes punctuation, digits, and casing", () => {
    expect(initialsFromName("  D'Angelo  O'Neil ")).toBe("do");
    expect(initialsFromName("4th Street Crew")).toBe("x4sc");
  });

  it("always starts with a letter", () => {
    expect(initialsFromName("123")).toMatch(/^[a-z]/);
    expect(initialsFromName("")).toMatch(/^[a-z]/);
  });
});

describe("slugCandidates", () => {
  it("yields the base first, then numbered letter suffixes", () => {
    const candidates = [...slugCandidates("jj", 4)];
    expect(candidates.slice(0, 4)).toEqual(["jj", "jj1a", "jj1b", "jj1c"]);
  });

  it("skips a reserved base but keeps suffixed candidates", () => {
    const candidates = [...slugCandidates("www", 2)];
    expect(candidates[0]).toBe("www1a");
  });

  it("advances rounds after exhausting the alphabet", () => {
    const candidates = [...slugCandidates("jj", 30)];
    expect(candidates).toContain("jj1z");
    expect(candidates).toContain("jj2a");
  });
});
