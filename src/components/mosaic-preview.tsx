const tiles = [
  { className: "tile tall", label: "First dance" },
  { className: "tile warm", label: "Friends laughing" },
  { className: "tile violet", label: "City lights" },
  { className: "tile wide", label: "Dinner table" },
  { className: "tile coral", label: "Confetti" }
];

export function MosaicPreview() {
  return (
    <div className="mosaic-wrap" aria-label="A preview of an event photo mosaic">
      <div className="mosaic">
        {tiles.map((tile) => (
          <div className={tile.className} key={tile.label} role="img" aria-label={tile.label}>
            <span>{tile.label}</span>
          </div>
        ))}
      </div>
      <div className="live-pill"><i /> 47 moments shared</div>
    </div>
  );
}
