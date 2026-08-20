"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { prepareImageForUpload, uploadPreparedImage, UploadError } from "@/lib/upload-flow.client";

interface Envelope<T> {
  data?: T;
  error?: { message?: string };
}

/**
 * Cover selection is a single action: pick an image from the phone, it's
 * uploaded and set as the album's cover. Once set, a thumbnail with a remove
 * button replaces the upload control; removing it brings the control back.
 */
export function CoverPicker() {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/v1/admin/event");
      const payload = (await response.json()) as Envelope<{ coverPhotoUrl: string | null }>;
      if (response.ok && payload.data) setCoverUrl(payload.data.coverPhotoUrl);
    })();
  }, []);

  async function uploadNewCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    setMessage("Uploading…");
    try {
      const prepared = await prepareImageForUpload(file);
      const { photoId } = await uploadPreparedImage(prepared, file.name, "", () => undefined);
      const response = await fetch("/api/v1/admin/cover", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId })
      });
      if (!response.ok) throw new Error("set-failed");
      // Refetch to get the signed URL of the newly set cover.
      const settings = await fetch("/api/v1/admin/event");
      const payload = (await settings.json()) as Envelope<{ coverPhotoUrl: string | null }>;
      setCoverUrl(payload.data?.coverPhotoUrl ?? null);
      setMessage("Cover photo set.");
    } catch (cause) {
      setMessage(cause instanceof UploadError ? cause.message : "That photo couldn't be uploaded.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function removeCover() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/v1/admin/cover", { method: "DELETE" });
      if (response.ok) {
        setCoverUrl(null);
        setMessage("Cover photo removed.");
      } else {
        setMessage("Couldn't remove the cover.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cover-picker">
      <p className="panel-note">
        Pick the image that greets guests when they open the album. It&apos;s resized on your phone before
        it uploads — just like any other photo.
      </p>

      {coverUrl ? (
        <div className="cover-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="Current album cover" />
          <button
            type="button"
            className="cover-thumb-remove"
            aria-label="Remove cover photo"
            disabled={busy}
            onClick={() => void removeCover()}
          >
            ✕
          </button>
        </div>
      ) : (
        <label className="button-link cover-upload-button">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={(event) => void uploadNewCover(event)}
            disabled={busy}
          />
          {busy ? "Uploading…" : "Upload a cover photo"}
        </label>
      )}

      <p className="form-status" aria-live="polite">{message}</p>
    </div>
  );
}
