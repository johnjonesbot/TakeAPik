"use client";

import { ChangeEvent, useRef, useState } from "react";
import { prepareImageForUpload, uploadPreparedImage, UploadError } from "@/lib/upload-flow.client";

/**
 * Cover selection is a single action: pick an image from the phone, it's
 * uploaded and set as the album's cover. No gallery picker — that duplicated
 * the album tab and cluttered settings.
 */
export function CoverPicker() {
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function uploadNewCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setMessage("Uploading…");
    try {
      const prepared = await prepareImageForUpload(file);
      const { photoId } = await uploadPreparedImage(prepared, file.name, "", () => undefined);
      const response = await fetch("/api/v1/admin/cover", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId })
      });
      setMessage(response.ok ? "Cover photo updated." : "Couldn't set the cover.");
    } catch (cause) {
      setMessage(cause instanceof UploadError ? cause.message : "That photo couldn't be uploaded.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <>
      <p className="panel-note">
        Pick the image that greets guests when they open the album. It&apos;s resized on your phone before
        it uploads — just like any other photo.
      </p>
      <label className="button-link cover-upload-button">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={(event) => void uploadNewCover(event)}
          disabled={uploading}
        />
        {uploading ? "Uploading…" : "Upload a cover photo"}
      </label>
      <p className="form-status" aria-live="polite">{message}</p>
    </>
  );
}
