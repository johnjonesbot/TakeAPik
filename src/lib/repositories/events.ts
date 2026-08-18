import { queryOne, type Queryable } from "@/lib/db";
import type { EventRow } from "@/lib/repositories/types";

export async function findEventByTenant(db: Queryable, tenantId: string): Promise<EventRow | null> {
  return queryOne<EventRow>(db, "SELECT * FROM events WHERE tenant_id = $1", [tenantId]);
}

export interface CreateEventInput {
  tenantId: string;
  name: string;
  accessCodeHash: string;
  timezone?: string;
  startsAt?: Date;
}

export async function createEvent(db: Queryable, input: CreateEventInput): Promise<EventRow> {
  const row = await queryOne<EventRow>(
    db,
    `INSERT INTO events (tenant_id, name, access_code_hash, timezone, starts_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.tenantId, input.name, input.accessCodeHash, input.timezone ?? "UTC", input.startsAt ?? null]
  );
  if (!row) throw new Error("event insert returned no row");
  return row;
}

export async function rotateAccessCode(db: Queryable, tenantId: string, accessCodeHash: string): Promise<EventRow | null> {
  return queryOne<EventRow>(
    db,
    `UPDATE events
     SET access_code_hash = $2, access_code_last_changed_at = now(), updated_at = now()
     WHERE tenant_id = $1
     RETURNING *`,
    [tenantId, accessCodeHash]
  );
}
