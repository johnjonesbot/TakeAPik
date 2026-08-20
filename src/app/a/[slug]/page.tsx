import { AccessForm } from "@/components/access-form";
import { AlbumView } from "@/components/album-view";
import { TenantNav } from "@/components/tenant-nav";
import { Wordmark } from "@/components/wordmark";
import { getAlbumTenant, getAuthorizedAlbumActor } from "@/lib/page-context";

export const dynamic = "force-dynamic";

function AlbumUnavailable() {
  return (
    <main className="landing-shell tenant-login-shell">
      <section className="tenant-login">
        <h1>Album unavailable</h1>
        <p className="intro">This album doesn&apos;t exist or is no longer accepting visitors.</p>
      </section>
    </main>
  );
}

function AlbumLogin({ slug, albumName }: { slug: string; albumName: string }) {
  return (
    <main className="landing-shell tenant-login-shell">
      <div className="ambient ambient-one" />
      <header className="brand-bar">
        <Wordmark />
      </header>
      <section className="tenant-login">
        <h1>{albumName}</h1>
        <p className="intro">Enter your email and the event&apos;s 8-digit access code to open the album.</p>
        <AccessForm surface="tenant" slug={slug} />
      </section>
    </main>
  );
}

export default async function AlbumPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getAlbumTenant(slug);
  if (tenant.kind !== "tenant") return <AlbumUnavailable />;

  const authorized = await getAuthorizedAlbumActor(slug);
  if (!authorized) return <AlbumLogin slug={slug} albumName={tenant.context.displayName} />;

  return (
    <main className="portal-shell">
      <TenantNav albumName={tenant.context.displayName} slug={slug} isAdmin={authorized.actor.kind === "admin"} />
      <section className="portal-body portal-body-wide">
        <h1 className="portal-heading">The album</h1>
        <AlbumView />
      </section>
    </main>
  );
}
