import { resizeImage } from "@/lib/image-resize.client";

export interface PreparedImage {
  blob: Blob;
  mimeType: "image/jpeg";
  width: number;
  height: number;
  checksumSha256: string;
}

export class UploadError extends Error {
  constructor(message: string, readonly retryable: boolean = false) {
    super(message);
  }
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Browser-side pipeline: decode (orientation-aware), resize to ≤1920 px,
 * re-encode to JPEG (which strips EXIF/GPS), then fingerprint the exact
 * bytes the server must receive.
 */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  let blob: Blob;
  try {
    blob = await resizeImage(file, { outputType: "image/jpeg" });
  } catch {
    throw new UploadError(
      file.type === "image/heic" || file.type === "image/heif"
        ? "This browser can't read HEIC photos. In your camera settings choose \"Most compatible\", or pick a JPEG."
        : "That file doesn't look like a photo this browser can read."
    );
  }

  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  bitmap.close();

  return { blob, mimeType: "image/jpeg", width, height, checksumSha256: await sha256Hex(blob) };
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string; code?: string };
}

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  return (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
}

/** PUT with progress; fetch has no upload progress, so XHR does this one job. */
function putWithProgress(url: string, blob: Blob, contentType: string, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new UploadError("The upload was interrupted; try again.", true));
    xhr.onerror = () => reject(new UploadError("The upload was interrupted; try again.", true));
    xhr.send(blob);
  });
}

export async function uploadPreparedImage(
  prepared: PreparedImage,
  originalFilename: string,
  description: string,
  onProgress: (fraction: number) => void
): Promise<void> {
  const intentResponse = await fetch("/api/v1/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: originalFilename,
      mimeType: prepared.mimeType,
      byteSize: prepared.blob.size,
      width: prepared.width,
      height: prepared.height,
      checksumSha256: prepared.checksumSha256
    })
  });
  const intent = await parseEnvelope<{ photoId: string; uploadUrl: string }>(intentResponse);
  if (!intentResponse.ok || !intent.data) {
    throw new UploadError(intent.error?.message ?? "The upload could not be started.", intentResponse.status === 429);
  }

  await putWithProgress(intent.data.uploadUrl, prepared.blob, prepared.mimeType, onProgress);

  const completeResponse = await fetch(`/api/v1/uploads/${intent.data.photoId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(description ? { description } : {})
  });
  const complete = await parseEnvelope<{ status: string }>(completeResponse);
  if (!completeResponse.ok) {
    throw new UploadError(complete.error?.message ?? "The photo failed verification.");
  }
}
