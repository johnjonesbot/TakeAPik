export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export type ResizeOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  outputType?: "image/jpeg" | "image/webp";
};

export async function resizeImage(file: File, options: ResizeOptions = {}): Promise<Blob> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error("Unsupported image format");
  const maxWidth = options.maxWidth ?? 1920;
  const maxHeight = options.maxHeight ?? 1920;
  const quality = options.quality ?? 0.86;
  if (maxWidth < 1 || maxHeight < 1 || quality <= 0 || quality > 1) throw new Error("Invalid resize options");

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Image processing is unavailable in this browser");
    context.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("The image could not be encoded"))),
        options.outputType ?? "image/jpeg",
        quality
      );
    });
  } finally {
    bitmap.close();
  }
}
