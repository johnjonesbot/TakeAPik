// Landing-page hero mosaic. Photos ship with the app in public/images and are
// served at /images/mosaic-*.jpg, so they deploy with the code and can't be
// wiped by a deploy. Optimized JPEGs; a plain <img> keeps it simple.
const tiles = [
  { className: "tile tall", label: "First dance", src: "/images/mosaic-1.jpg" },
  { className: "tile warm", label: "Friends laughing", src: "/images/mosaic-2.jpg" },
  { className: "tile violet", label: "The vows", src: "/images/mosaic-3.jpg" },
  { className: "tile wide", label: "Family table", src: "/images/mosaic-4.jpg" },
  { className: "tile coral", label: "Confetti", src: "/images/mosaic-5.jpg" }
];

export function MosaicPreview() {
  return (
    <div className="mosaic-wrap" aria-label="A preview of an event photo mosaic">
      <div className="mosaic">
        {tiles.map((tile) => (
          <div className={tile.className} key={tile.label}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tile.src} alt={tile.label} decoding="async" />
            <span>{tile.label}</span>
          </div>
        ))}
      </div>
      <div className="live-pill"><i /> 47 moments shared</div>
    </div>
  );
}
