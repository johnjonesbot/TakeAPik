import { queryOne, type Queryable } from "@/lib/db";
import type { PlatformUserRow } from "@/lib/repositories/types";

export async function findPlatformUserByEmail(db: Queryable, email: string): Promise<PlatformUserRow | null> {
  return queryOne<PlatformUserRow>(db, "SELECT * FROM platform_users WHERE email = $1", [email]);
}

export async function findPlatformUserById(db: Queryable, id: string): Promise<PlatformUserRow | null> {
  return queryOne<PlatformUserRow>(db, "SELECT * FROM platform_users WHERE id = $1", [id]);
}

export interface CreatePlatformUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  isSuperAdmin?: boolean;
}

export async function createPlatformUser(db: Queryable, input: CreatePlatformUserInput): Promise<PlatformUserRow> {
  const row = await queryOne<PlatformUserRow>(
    db,
    `INSERT INTO platform_users (email, password_hash, display_name, is_super_admin)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.email, input.passwordHash, input.displayName, input.isSuperAdmin ?? false]
  );
  if (!row) throw new Error("platform user insert returned no row");
  return row;
}
