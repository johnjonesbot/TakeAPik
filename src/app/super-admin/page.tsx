import { Wordmark } from "@/components/wordmark";
import { AdminLoginForm } from "@/components/admin-login-form";
import { AccountsManager } from "@/components/super-admin/accounts-manager";
import { PlatformNav } from "@/components/super-admin/platform-nav";
import { getSuperAdminPageActor } from "@/lib/page-context";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const actor = await getSuperAdminPageActor();
  if (!actor) {
    return (
      <main className="landing-shell tenant-login-shell">
        <header className="brand-bar">
          <Wordmark />
        </header>
        <section className="tenant-login">
          <h1>Platform</h1>
          <p className="intro">Super-admin sign-in. MFA is required.</p>
          <AdminLoginForm title="Super-admin sign-in" />
        </section>
      </main>
    );
  }

  return (
    <main className="portal-shell">
      <PlatformNav current="accounts" />
      <section className="portal-body">
        <h1 className="portal-heading">Accounts</h1>
        <AccountsManager />
      </section>
    </main>
  );
}
