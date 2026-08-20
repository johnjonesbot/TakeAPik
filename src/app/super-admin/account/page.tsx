import { redirect } from "next/navigation";
import { getPool } from "@/lib/db";
import { findPlatformUserById } from "@/lib/repositories/platform-users";
import { getSuperAdminPageActor } from "@/lib/page-context";
import { SuperAdminAccountSettings } from "@/components/super-admin/account-settings";
import { PlatformNav } from "@/components/super-admin/platform-nav";

export const dynamic = "force-dynamic";

export default async function SuperAdminAccountPage() {
  const actor = await getSuperAdminPageActor();
  if (!actor) redirect("/super-admin");

  const user = await findPlatformUserById(getPool(), actor.platformUserId);
  if (!user) redirect("/super-admin");

  return (
    <main className="portal-shell">
      <PlatformNav current="account" />
      <section className="portal-body">
        <h1 className="portal-heading">Account</h1>
        <SuperAdminAccountSettings email={user.email} />
      </section>
    </main>
  );
}
