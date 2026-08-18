import { redirect } from "next/navigation";
import { FriendsManager } from "@/components/admin/friends-manager";
import { TenantNav } from "@/components/tenant-nav";
import { getAuthorizedPageActor } from "@/lib/page-context";

export const dynamic = "force-dynamic";

export default async function AdminFriendsPage() {
  const authorized = await getAuthorizedPageActor();
  if (!authorized || authorized.actor.kind !== "admin" || authorized.tenant.kind !== "tenant") {
    redirect("/admin");
  }

  return (
    <main className="portal-shell">
      <TenantNav albumName={authorized.tenant.context.displayName} surface="admin" />
      <section className="portal-body">
        <h1 className="portal-heading">Friends &amp; invitations</h1>
        <FriendsManager />
      </section>
    </main>
  );
}
