import { describe, expect, it } from "vitest";
import { computeRetention } from "./retention";

const DAY = 86_400_000;
const created = new Date("2026-01-01T00:00:00Z");

describe("computeRetention", () => {
  it("opens uploads a week before the event and flags 90 days later", () => {
    const eventDate = new Date("2026-06-10T12:00:00Z");
    const opensAt = new Date(eventDate.getTime() - 7 * DAY);

    expect(computeRetention(eventDate, created, new Date(opensAt.getTime() - 1)).uploadState).toBe("not-open");
    expect(computeRetention(eventDate, created, opensAt).uploadState).toBe("open");
    expect(computeRetention(eventDate, created, new Date(eventDate.getTime() + 82 * DAY)).uploadState).toBe("open");

    const flaggedAt = new Date(opensAt.getTime() + 90 * DAY);
    const closed = computeRetention(eventDate, created, flaggedAt);
    expect(closed.uploadState).toBe("closed");
    expect(closed.flagged).toBe(true);
    expect(closed.flaggedAt.toISOString()).toBe(flaggedAt.toISOString());
  });

  it("keeps uploads closed with no event date and falls back to creation for the flag", () => {
    const early = computeRetention(null, created, new Date(created.getTime() + DAY));
    expect(early.uploadState).toBe("no-date");
    expect(early.flagged).toBe(false);

    const late = computeRetention(null, created, new Date(created.getTime() + 91 * DAY));
    expect(late.uploadState).toBe("no-date");
    expect(late.flagged).toBe(true);
  });
});
