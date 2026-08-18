import { AccessForm } from "@/components/access-form";
import { MosaicPreview } from "@/components/mosaic-preview";
import { TenantNav } from "@/components/tenant-nav";
import { getAuthorizedPageActor, getPageTenant } from "@/lib/page-context";

export const dynamic = "force-dynamic";

function RootLanding() {
  return (
    <main className="landing-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="brand-bar">
        <a className="wordmark" href="/" aria-label="TakeAPik home">
          take<span>a</span>pik
        </a>
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
        <a className="wordmark" href="/" aria-label="TakeAPik home">
          take<span>a</span>pik
        </a>
      </header>
      <section className="tenant-login">
        <h1>{albumName}</h1>
        <p className="intro">Enter the event details from your invitation to open the album.</p>
        <AccessForm surface="tenant" eventNamePlaceholder="Event name from your invite" />
      </section>
    </main>
  );
}

async function TenantAlbum({ albumName }: { albumName: string }) {
  return (
    <main className="portal-shell">
      <TenantNav albumName={albumName} surface="friend" />
      <section className="portal-body">
        <h1 className="portal-heading">The album</h1>
        <p className="portal-placeholder">
          Photos land here. Uploading and the live gallery arrive with the next phase of the build —
          your session and access already work.
        </p>
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
  return <TenantAlbum albumName={tenant.context.displayName} />;
}
