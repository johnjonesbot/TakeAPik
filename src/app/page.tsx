import { Wordmark } from "@/components/wordmark";
import { AccessForm } from "@/components/access-form";
import { MosaicPreview } from "@/components/mosaic-preview";
import { PhotoGallery } from "@/components/photo-gallery";
import { TenantNav } from "@/components/tenant-nav";
import { getAuthorizedPageActor, getPageTenant } from "@/lib/page-context";

export const dynamic = "force-dynamic";

function RootLanding() {
  return (
    <main className="landing-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="brand-bar">
        <Wordmark />
        <p>private albums · shared beautifully</p>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">The night, from everyone&apos;s point of view</p>
          <h1>Every angle.<br />One album.</h1>
          <p className="intro">
            A private photo space for your event. No app download, no social feed—just the people,
            the pictures, and the moments worth keeping.
          </p>
          <AccessForm surface="root" />
          <p className="privacy-note">24-hour guest sessions · Original files stay private</p>
        </div>
        <MosaicPreview />
      </section>
    </main>
  );
}

function TenantLogin({ albumName }: { albumName: string }) {
  return (
    <main className="landing-shell tenant-login-shell">
      <div className="ambient ambient-one" />
      <header className="brand-bar">
        <Wordmark />
      </header>
      <section className="tenant-login">
        <h1>{albumName}</h1>
        <p className="intro">Enter your email and the event&apos;s 8-digit access code to open the album.</p>
        <AccessForm surface="tenant" />
      </section>
    </main>
  );
}

async function TenantAlbum({ albumName, isAdmin }: { albumName: string; isAdmin: boolean }) {
  return (
    <main className="portal-shell">
      <TenantNav albumName={albumName} isAdmin={isAdmin} />
      <section className="portal-body portal-body-wide">
        <h1 className="portal-heading">The album</h1>
        <PhotoGallery />
      </section>
    </main>
  );
}

export default async function HomePage() {
  const tenant = await getPageTenant();

  if (tenant.kind === "root") return <RootLanding />;
  if (tenant.kind === "unavailable") {
    return (
      <main className="landing-shell tenant-login-shell">
        <section className="tenant-login">
          <h1>Album unavailable</h1>
          <p className="intro">This album doesn&apos;t exist or is no longer accepting visitors.</p>
        </section>
      </main>
    );
  }

  const authorized = await getAuthorizedPageActor();
  if (!authorized || authorized.actor.kind === "super-admin") {
    return <TenantLogin albumName={tenant.context.displayName} />;
  }
  return <TenantAlbum albumName={tenant.context.displayName} isAdmin={authorized.actor.kind === "admin"} />;
}
