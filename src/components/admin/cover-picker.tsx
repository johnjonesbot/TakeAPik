"use client";

import { ChangeEvent, useRef, useState } from "react";
import { PhotoGallery } from "@/components/photo-gallery";
import { prepareImageForUpload, uploadPreparedImage, UploadError } from "@/lib/upload-flow.client";

export function CoverPicker() {
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [galleryKey, setGalleryKey] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  async function setCover(photoId: string): Promise<boolean> {
    const response = await fetch("/api/v1/admin/cover", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId })
    });
    setMessage(response.ok ? "Cover updated" : "Couldn't set the cover");
    return response.ok;
  }

  /** Upload a brand-new photo (it joins the album) and make it the cover. */
  async function uploadNewCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setMessage("Uploading…");
    try {
      const prepared = await prepareImageForUpload(file);
      const { photoId } = await uploadPreparedImage(prepared, file.name, "", () => undefined);
      const ok = await setCover(photoId);
      if (ok) {
        setMessage("New photo added and set as the cover");
        setGalleryKey((value) => value + 1); // refresh the catalog below
      }
    } catch (cause) {
      setMessage(cause instanceof UploadError ? cause.message : "That photo couldn't be uploaded.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <>
      <div className="cover-actions">
        <p className="panel-note">
          Pick the photo that greets guests when they open the album — upload a new one, or choose
          from the album below.
        </p>
        <label className="button-link cover-upload-button">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={(event) => void uploadNewCover(event)}
            disabled={uploading}
          />
          {uploading ? "Uploading…" : "Upload a new cover photo"}
        </label>
      </div>
      <p className="form-status" aria-live="polite">{message}</p>
      <PhotoGallery
        key={galleryKey}
        emptyMessage="No photos yet — upload a cover above or wait for guests to add photos."
        renderExtras={(photo) => (
          <button type="button" className="ghost" onClick={() => void setCover(photo.id)}>
            Set as cover
          </button>
        )}
      />
    </>
  );
}
