const DAY_MS = 86_400_000;

/** Uploads open this many days before the event date. */
export const UPLOAD_LEAD_DAYS = 7;
/** The album's photo window: from opening until flagged for takedown. */
export const RETENTION_DAYS = 90;

export type UploadState = "no-date" | "not-open" | "open" | "closed";

export interface Retention {
  /** When uploads open (event date − lead); null when no event date is set. */
  uploadsOpenAt: Date | null;
  /** When uploads close and the album is flagged; from tenant creation when no event date. */
  flaggedAt: Date;
  uploadState: UploadState;
  /** Past the window: the super-admin sees the takedown flag. */
  flagged: boolean;
}

/**
 * Retention policy (ADR-007): an album's photo window opens UPLOAD_LEAD_DAYS
 * before the event date and lasts RETENTION_DAYS, after which the album is
 * flagged for takedown by the super-admin (flag only — deletion is manual).
 * The event date is required; rows without one (legacy or freshly purged)
 * keep uploads closed until the admin sets a date, and fall back to tenant
 * creation + RETENTION_DAYS for the flag.
 */
export function computeRetention(startsAt: Date | null, tenantCreatedAt: Date, now: Date = new Date()): Retention {
  if (!startsAt) {
    const flaggedAt = new Date(tenantCreatedAt.getTime() + RETENTION_DAYS * DAY_MS);
    return { uploadsOpenAt: null, flaggedAt, uploadState: "no-date", flagged: now >= flaggedAt };
  }
  const uploadsOpenAt = new Date(startsAt.getTime() - UPLOAD_LEAD_DAYS * DAY_MS);
  const flaggedAt = new Date(uploadsOpenAt.getTime() + RETENTION_DAYS * DAY_MS);
  const uploadState: UploadState = now < uploadsOpenAt ? "not-open" : now >= flaggedAt ? "closed" : "open";
  return { uploadsOpenAt, flaggedAt, uploadState, flagged: now >= flaggedAt };
}
