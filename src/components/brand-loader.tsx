/**
 * The standard loading indicator for the whole product: the TakeAPik camera
 * mark breathing inside a spinning ring. Use this — never bare "Loading…"
 * text — for any async pending state. CSS-animated (crisp on retina,
 * transparent over any background); the global reduced-motion kill-switch
 * stills it automatically.
 */
export function BrandLoader({ label = "Loading", small = false }: { label?: string; small?: boolean }) {
  return (
    <div className={`brand-loader${small ? " brand-loader-small" : ""}`} role="status" aria-label={label}>
      <span className="brand-loader-ring" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/brand-mark.png" alt="" decoding="async" />
    </div>
  );
}
