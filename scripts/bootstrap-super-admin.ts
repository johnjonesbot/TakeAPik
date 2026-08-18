import argon2 from "argon2";
import { z } from "zod";
import { closePool, withTransaction } from "@/lib/db";
import { getLogger } from "@/lib/logger";
import { createPlatformUser, findPlatformUserByEmail } from "@/lib/repositories/platform-users";
import { writeAuditEvent } from "@/services/audit";

const bootstrapEnv = z.object({
  SUPER_ADMIN_BOOTSTRAP_EMAIL: z.email(),
  SUPER_ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12),
  SUPER_ADMIN_BOOTSTRAP_NAME: z.string().min(1).default("Platform Admin")
});

/**
 * Create the first super-admin. Safe to rerun: an existing account with the
 * bootstrap email is left untouched and the run becomes a no-op. Unset the
 * SUPER_ADMIN_BOOTSTRAP_* variables after the first successful run.
 */
export async function bootstrapSuperAdmin(): Promise<"created" | "already-exists"> {
  const log = getLogger().child({ component: "bootstrap-super-admin" });
  const parsed = bootstrapEnv.safeParse(process.env);
  if (!parsed.success) {
    const failed = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(
      `Bootstrap requires valid ${failed.join(", ")} (password must be at least 12 characters)`
    );
  }
  const { SUPER_ADMIN_BOOTSTRAP_EMAIL: email, SUPER_ADMIN_BOOTSTRAP_PASSWORD: password, SUPER_ADMIN_BOOTSTRAP_NAME: name } = parsed.data;

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1
  });

  return withTransaction(async (client) => {
    const existing = await findPlatformUserByEmail(client, email);
    if (existing) {
      log.info("super-admin bootstrap skipped; account already exists", { userId: existing.id });
      return "already-exists";
    }
    const user = await createPlatformUser(client, {
      email,
      passwordHash,
      displayName: name,
      isSuperAdmin: true
    });
    await writeAuditEvent(client, {
      actorPlatformUserId: user.id,
      action: "platform.super_admin.bootstrap",
      targetType: "platform_user",
      targetId: user.id,
      metadata: { method: "bootstrap-script" }
    });
    log.info("super-admin created; unset SUPER_ADMIN_BOOTSTRAP_* now", { userId: user.id });
    return "created";
  });
}

const isDirectRun = process.argv[1]?.endsWith("bootstrap-super-admin.ts") ?? false;
if (isDirectRun) {
  bootstrapSuperAdmin()
    .then(() => closePool())
    .catch((error) => {
      getLogger().error("super-admin bootstrap failed", { error });
      process.exitCode = 1;
      return closePool();
    });
}
