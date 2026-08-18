"use client";

import { useState } from "react";
import { PhotoGallery } from "@/components/photo-gallery";

export function CoverPicker() {
  const [message, setMessage] = useState("");

  async function setCover(photoId: string) {
    const response = await fetch("/api/v1/admin/cover", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId })
    });
    setMessage(response.ok ? "Cover updated" : "Couldn't set the cover");
  }

  return (
    <>
      <p className="panel-note">Pick the photo that greets guests when they open the album.</p>
      <p className="form-status" aria-live="polite">{message}</p>
      <PhotoGallery
        emptyMessage="No photos yet — the cover can be chosen once photos arrive."
        renderExtras={(photo) => (
          <button type="button" className="ghost" onClick={() => void setCover(photo.id)}>
            Set as cover
          </button>
        )}
      />
    </>
  );
}
