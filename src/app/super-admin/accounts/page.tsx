import { redirect } from "next/navigation";
import { getSuperAdminPageActor } from "@/lib/page-context";
import { AccountsManager } from "@/components/super-admin/accounts-manager";

export const dynamic = "force-dynamic";

export default async function SuperAdminAccountsPage() {
  const actor = await getSuperAdminPageActor();
  if (!actor) redirect("/super-admin");

  return (
    <main className="portal-shell">
      <nav className="tenant-nav" aria-label="Platform navigation">
        <span className="tenant-nav-name">Platform</span>
        <div className="tenant-nav-links">
          <a href="/super-admin">Tenants</a>
          <a href="/super-admin/accounts" aria-current="page">Accounts</a>
          <a href="/super-admin/account">Account</a>
        </div>
      </nav>
      <section className="portal-body">
        <h1 className="portal-heading">Accounts</h1>
        <AccountsManager />
      </section>
    </main>
  );
}
