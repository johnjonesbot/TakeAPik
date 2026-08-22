import { AdminLoginForm } from "@/components/admin-login-form";
import { AccountSecurity } from "@/components/admin/account-security";
import { CoverPicker } from "@/components/admin/cover-picker";
import { EventSettings } from "@/components/admin/event-settings";
import { ExportPanel } from "@/components/admin/export-panel";
import { FriendsManager } from "@/components/admin/friends-manager";
import { TenantNav } from "@/components/tenant-nav";
import { Wordmark } from "@/components/wordmark";
import { getAlbumTenant, getAuthorizedAlbumActor } from "@/lib/page-context";

export const dynamic = "force-dynamic";

/** The whole event-admin surface lives on this one settings page. */
export default async function AdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getAlbumTenant(slug);
  if (tenant.kind !== "tenant") {
    return (
      <main className="landing-shell tenant-login-shell">
        <section className="tenant-login">
          <h1>Album unavailable</h1>
          <p className="intro">This album doesn&apos;t exist or is no longer accepting visitors.</p>
        </section>
      </main>
    );
  }

  const authorized = await getAuthorizedAlbumActor(slug);
  if (!authorized || authorized.actor.kind !== "admin") {
    return (
      <main className="landing-shell tenant-login-shell">
        <header className="brand-bar">
          <Wordmark href={`/a/${slug}`} />
        </header>
        <section className="tenant-login">
          <h1>{tenant.context.displayName}</h1>
          <p className="intro">Sign in with your email and password.</p>
          <AdminLoginForm title="Event admin sign-in" slug={slug} />
        </section>
      </main>
    );
  }

  return (
    <main className="portal-shell">
      <TenantNav albumName={tenant.context.displayName} slug={slug} isAdmin />
      <section className="portal-body portal-body-wide">
        <h1 className="portal-heading">Settings</h1>

        <div className="settings-section">
          <EventSettings />
        </div>

        <div className="settings-section">
          <h2 className="settings-heading">Guests &amp; invitations</h2>
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
