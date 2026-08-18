import { AdminLoginForm } from "@/components/admin-login-form";
import { AccountSecurity } from "@/components/admin/account-security";
import { CoverPicker } from "@/components/admin/cover-picker";
import { EventSettings } from "@/components/admin/event-settings";
import { ExportPanel } from "@/components/admin/export-panel";
import { FriendsManager } from "@/components/admin/friends-manager";
import { TenantNav } from "@/components/tenant-nav";
import { getAuthorizedPageActor, getPageTenant } from "@/lib/page-context";

export const dynamic = "force-dynamic";

/** The whole admin surface lives on this one settings page. */
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
          <p className="intro">Sign in with your email and password.</p>
          <AdminLoginForm title="Event admin sign-in" />
        </section>
      </main>
    );
  }

  return (
    <main className="portal-shell">
      <TenantNav albumName={tenant.context.displayName} surface="admin" />
      <section className="portal-body portal-body-wide">
        <h1 className="portal-heading">Settings</h1>

        <div className="settings-section">
          <EventSettings />
        </div>

        <div className="settings-section">
          <h2 className="settings-heading">Friends &amp; invitations</h2>
          <FriendsManager />
        </div>

        <div className="settings-section">
          <h2 className="settings-heading">Cover photo</h2>
          <CoverPicker />
        </div>

        <div className="settings-section settings-section-narrow">
          <h2 className="settings-heading">Download everything</h2>
          <ExportPanel />
        </div>

        <div className="settings-section">
          <h2 className="settings-heading">Your account</h2>
          <AccountSecurity />
        </div>
      </section>
    </main>
  );
}
