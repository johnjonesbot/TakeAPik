"use client";

import { useState } from "react";
import { BrandLoader } from "@/components/brand-loader";

/**
 * The cover-photo page background: lazy-loaded behind the brand loader, then
 * faded in. The loader sits in the backdrop layer (under the content), so a
 * slow image never blocks or overlaps the page itself.
 */
export function AlbumBackdrop({ coverUrl }: { coverUrl: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="album-backdrop" aria-hidden="true">
      {!loaded ? (
        <div className="album-backdrop-loading">
          <BrandLoader label="" />
        </div>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={coverUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={loaded ? "is-loaded" : undefined}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
