import { AccessForm } from "@/components/access-form";
import { MosaicPreview } from "@/components/mosaic-preview";
import { Wordmark } from "@/components/wordmark";

export const dynamic = "force-dynamic";

/** Marketing landing + guest entry. Email + code locate the album and redirect
 *  to /a/:slug on the same host (ADR-005, single origin). */
export default function HomePage() {
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
          <p className="privacy-note">
            Private albums · Original files stay private ·{" "}
            <a href="/legal">Privacy &amp; Terms</a>
          </p>
        </div>
        <MosaicPreview />
      </section>
    </main>
  );
}
