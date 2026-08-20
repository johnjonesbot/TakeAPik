import { queryOne, type Queryable } from "@/lib/db";
import type { TenantRow } from "@/lib/repositories/types";

/** Root lookup used by tenant resolution; slug is globally unique. */
export async function findActiveTenantBySlug(db: Queryable, slug: string): Promise<TenantRow | null> {
  return queryOne<TenantRow>(db, "SELECT * FROM tenants WHERE slug = $1 AND status = 'active'", [slug]);
}

export async function findTenantById(db: Queryable, tenantId: string): Promise<TenantRow | null> {
  return queryOne<TenantRow>(db, "SELECT * FROM tenants WHERE id = $1", [tenantId]);
}

export interface CreateTenantInput {
  slug: string;
  ownerUserId: string;
  displayName: string;
  status?: "draft" | "active";
}

export async function createTenant(db: Queryable, input: CreateTenantInput): Promise<TenantRow> {
  const row = await queryOne<TenantRow>(
    db,
    `INSERT INTO tenants (slug, owner_user_id, display_name, status)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.slug, input.ownerUserId, input.displayName, input.status ?? "active"]
  );
  if (!row) throw new Error("tenant insert returned no row");
  return row;
}
