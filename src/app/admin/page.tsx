import { AdminLoginForm } from "@/components/admin-login-form";
import { TenantNav } from "@/components/tenant-nav";
import { getAuthorizedPageActor, getPageTenant } from "@/lib/page-context";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const tenant = await getPageTenant();
  if (tenant.kind !== "tenant") {
    return (
      <main className="landing-shell tenant-login-shell">
        <section className="tenant-login">
          <h1>Not here</h1>
          <p className="intro">Event administration lives on your album&apos;s own address.</p>
        </section>
      </main>
    );
  }

  const authorized = await getAuthorizedPageActor();
  if (!authorized || authorized.actor.kind !== "admin") {
    return (
      <main className="landing-shell tenant-login-shell">
        <header className="brand-bar">
          <a className="wordmark" href="/" aria-label="TakeAPik home">
            take<span>a</span>pik
          </a>
        </header>
        <section className="tenant-login">
          <h1>{tenant.context.displayName}</h1>
          <p className="intro">Event admin sign-in.</p>
          <AdminLoginForm title="Event admin sign-in" />
        </section>
      </main>
    );
  }

  return (
    <main className="portal-shell">
      <TenantNav albumName={tenant.context.displayName} surface="admin" />
      <section className="portal-body">
        <h1 className="portal-heading">Event overview</h1>
        <p className="portal-placeholder">
          Event settings, access-code rotation, friends, invitations, and export controls are being
          built phase by phase. Your admin session and this portal&apos;s security are already live.
        </p>
      </section>
    </main>
  );
}
