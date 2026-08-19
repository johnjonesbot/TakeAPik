// Landing-page hero mosaic. Photos are served directly from the web root at
// /images/mosaic-*.png (uploaded outside the Next public/ folder), so a plain
// <img> is used rather than next/image, whose optimizer runs inside the Node
// process and can't reach files the front web server serves.
const tiles = [
  { className: "tile tall", label: "First dance", src: "/images/mosaic-1.png" },
  { className: "tile warm", label: "Friends laughing", src: "/images/mosaic-2.png" },
  { className: "tile violet", label: "The vows", src: "/images/mosaic-3.png" },
  { className: "tile wide", label: "Family table", src: "/images/mosaic-4.png" },
  { className: "tile coral", label: "Confetti", src: "/images/mosaic-5.png" }
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
