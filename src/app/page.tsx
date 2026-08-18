import { AccessForm } from "@/components/access-form";
import { MosaicPreview } from "@/components/mosaic-preview";

export default function HomePage() {
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
          <AccessForm />
          <p className="privacy-note">24-hour guest sessions · Original files stay private</p>
        </div>
        <MosaicPreview />
      </section>
    </main>
  );
}
