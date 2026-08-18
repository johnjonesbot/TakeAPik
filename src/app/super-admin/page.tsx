import { AdminLoginForm } from "@/components/admin-login-form";
import { TenantsManager } from "@/components/super-admin/tenants-manager";
import { getAuthorizedPageActor, getPageTenant } from "@/lib/page-context";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const tenant = await getPageTenant();
  if (tenant.kind !== "root") {
    // The platform portal never appears on tenant hosts.
    return (
      <main className="landing-shell tenant-login-shell">
        <section className="tenant-login">
          <h1>Not here</h1>
          <p className="intro">There is nothing at this address.</p>
        </section>
      </main>
    );
  }

  const authorized = await getAuthorizedPageActor();
  if (!authorized || authorized.actor.kind !== "super-admin") {
    return (
      <main className="landing-shell tenant-login-shell">
        <header className="brand-bar">
          <a className="wordmark" href="/" aria-label="TakeAPik home">
            take<span>a</span>pik
          </a>
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
      <nav className="tenant-nav" aria-label="Platform navigation">
        <span className="tenant-nav-name">Platform</span>
        <div className="tenant-nav-links">
          <a href="/super-admin" aria-current="page">Tenants</a>
        </div>
      </nav>
      <section className="portal-body">
        <h1 className="portal-heading">Tenants</h1>
        <TenantsManager />
      </section>
    </main>
  );
}
