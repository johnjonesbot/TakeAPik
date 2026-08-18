import sharp, { type Metadata } from "sharp";

export const ALLOWED_UPLOAD_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const FORMAT_TO_MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

function magicBytesMime(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}

export interface VerifiedImage {
  mimeType: string;
  width: number;
  height: number;
}

export type ImageVerification = { ok: true; image: VerifiedImage } | { ok: false; reason: string };

/**
 * Server-side proof that the stored object is the image the client claimed:
 * magic bytes, then a real decode for dimensions and integrity. Browser
 * resizing is a performance nicety, never a security boundary.
 */
export async function verifyImageBytes(
  bytes: Buffer,
  claimed: { mimeType: string; width: number; height: number; maxWidth: number; maxPixels?: number }
): Promise<ImageVerification> {
  const sniffed = magicBytesMime(bytes);
  if (!sniffed) return { ok: false, reason: "unrecognized-format" };
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(sniffed)) return { ok: false, reason: "disallowed-format" };
  if (sniffed !== claimed.mimeType) return { ok: false, reason: "mime-mismatch" };

  let metadata: Metadata;
  try {
    // limitInputPixels guards against decompression bombs before full decode.
    const decoder = sharp(bytes, { limitInputPixels: claimed.maxPixels ?? 40_000_000 });
    metadata = await decoder.metadata();
    await decoder.stats();
  } catch {
    return { ok: false, reason: "decode-failed" };
  }

  const decodedMime = metadata.format ? FORMAT_TO_MIME[metadata.format] : undefined;
  if (decodedMime !== claimed.mimeType) return { ok: false, reason: "format-mismatch" };
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 1 || height < 1) return { ok: false, reason: "empty-image" };
  if (width > claimed.maxWidth) return { ok: false, reason: "too-wide" };
  if (width !== claimed.width || height !== claimed.height) return { ok: false, reason: "dimension-mismatch" };

  return { ok: true, image: { mimeType: decodedMime, width, height } };
}
