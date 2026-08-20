"use client";

import { useState } from "react";
import { PhotoGallery } from "@/components/photo-gallery";
import { UploadForm } from "@/components/upload-form";

/**
 * The album tab is the whole experience: the upload card sits above the
 * gallery, and a published photo drops straight into view — no tab switch,
 * no dead-end "see the album" link.
 */
export function AlbumView({ isAdmin }: { isAdmin: boolean }) {
  const [galleryVersion, setGalleryVersion] = useState(0);
  return (
    <>
      <div className="album-upload-card">
        <UploadForm onPublished={() => setGalleryVersion((version) => version + 1)} />
      </div>
      <PhotoGallery key={galleryVersion} canDownload={isAdmin} />
    </>
  );
}
