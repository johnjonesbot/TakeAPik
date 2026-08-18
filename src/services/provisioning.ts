import type { PoolClient } from "pg";
import { isUniqueViolation, withTransaction } from "@/lib/db";
import { generateAccessCode, hashAccessCode } from "@/lib/access-code";
import { initialsFromName, slugCandidates } from "@/lib/slug";
import { createEvent } from "@/lib/repositories/events";
import { createMembership } from "@/lib/repositories/memberships";
import { createPlatformUser, findPlatformUserByEmail } from "@/lib/repositories/platform-users";
import { createTenant } from "@/lib/repositories/tenants";
import type { EventRow, MembershipRow, PlatformUserRow, TenantRow } from "@/lib/repositories/types";
import { writeAuditEvent } from "@/services/audit";

export interface ProvisionTenantInput {
  ownerEmail: string;
  ownerDisplayName: string;
  /** Argon2id hash produced by the caller; provisioning never sees the password. */
  ownerPasswordHash: string;
  eventName: string;
  timezone?: string;
  /** Super-admin performing the provisioning, for the audit trail. */
  actorPlatformUserId: string;
}

export interface ProvisionTenantResult {
  tenant: TenantRow;
  event: EventRow;
  owner: PlatformUserRow;
  ownerMembership: MembershipRow;
  /** Shown once at provisioning; only the hash is stored. */
  accessCode: string;
}

/**
 * Insert the tenant under the first free slug candidate. Each attempt runs in
 * a savepoint so a unique-violation rollback does not abort the outer
 * transaction; the database unique constraint is the sole authority.
 */
async function insertTenantWithFreeSlug(
  client: PoolClient,
  ownerUserId: string,
  displayName: string
): Promise<TenantRow> {
  for (const candidate of slugCandidates(initialsFromName(displayName))) {
    await client.query("SAVEPOINT slug_attempt");
    try {
      const tenant = await createTenant(client, { slug: candidate, ownerUserId, displayName });
      await client.query("RELEASE SAVEPOINT slug_attempt");
      return tenant;
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT slug_attempt");
      if (!isUniqueViolation(error, "tenants_slug_key")) throw error;
    }
  }
  throw new Error("Exhausted slug candidates while provisioning tenant");
}

export async function provisionTenant(input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
  const accessCode = generateAccessCode();
  const accessCodeHash = await hashAccessCode(accessCode);

  return withTransaction(async (client) => {
    const owner =
      (await findPlatformUserByEmail(client, input.ownerEmail)) ??
      (await createPlatformUser(client, {
        email: input.ownerEmail,
        passwordHash: input.ownerPasswordHash,
        displayName: input.ownerDisplayName
      }));
    if (owner.disabled_at) throw new Error("Owner account is disabled");

    const tenant = await insertTenantWithFreeSlug(client, owner.id, input.ownerDisplayName);
    const event = await createEvent(client, {
      tenantId: tenant.id,
      name: input.eventName,
      accessCodeHash,
      timezone: input.timezone
    });
    const ownerMembership = await createMembership(client, {
      tenantId: tenant.id,
      email: owner.email,
      friendName: owner.display_name,
      role: "admin",
      platformUserId: owner.id
    });

    await writeAuditEvent(client, {
      tenantId: tenant.id,
      actorPlatformUserId: input.actorPlatformUserId,
      action: "tenant.provision",
      targetType: "tenant",
      targetId: tenant.id,
      metadata: { slug: tenant.slug, eventId: event.id, ownerUserId: owner.id }
    });

    return { tenant, event, owner, ownerMembership, accessCode };
  });
}
