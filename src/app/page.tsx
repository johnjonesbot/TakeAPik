import { headers } from "next/headers";
import { AccessForm } from "@/components/access-form";
import { MosaicPreview } from "@/components/mosaic-preview";
import { Wordmark } from "@/components/wordmark";
import { albumsUrl, isAlbumsHost } from "@/lib/hosts";

export const dynamic = "force-dynamic";

/** Marketing landing (main domain). The album entry lives on the albums
 *  subdomain, linked from here — no album logic on the main domain. */
function Marketing({ albumsHref }: { albumsHref: string }) {
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
          <a className="cta-button" href={albumsHref}>Open your album <span aria-hidden="true">↗</span></a>
          <p className="privacy-note">24-hour guest sessions · Original files stay private</p>
        </div>
        <MosaicPreview />
      </section>
    </main>
  );
}

/** Album front door (albums subdomain): email + code locate the album and
 *  redirect to /a/:slug on this same host. */
function AlbumFrontDoor() {
  return (
    <main className="landing-shell tenant-login-shell">
      <div className="ambient ambient-one" />
      <header className="brand-bar">
        <Wordmark href="/" />
      </header>
      <section className="tenant-login">
        <h1>Open your album</h1>
        <p className="intro">Enter your email and the event&apos;s 8-digit access code.</p>
        <AccessForm surface="root" />
      </section>
    </main>
  );
}

export default async function HomePage() {
  const host = (await headers()).get("host") ?? "";
  if (isAlbumsHost(host)) return <AlbumFrontDoor />;
  return <Marketing albumsHref={albumsUrl("/")} />;
}
