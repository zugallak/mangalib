"use client";

import { MAX_IMAGE_DIMENSION } from "@/lib/scan-upload";

/**
 * Downscale a large photo in the browser using canvas, to avoid uploading a
 * 10+ MB phone image while preserving enough spine detail for the model.
 * Re-encodes as JPEG at high quality. Falls back to the original file if the
 * browser can't decode it or the result would be larger.
 */
export async function downscaleImage(file: File): Promise<Blob> {
  // Skip work for already-small images.
  if (file.size < 1_200_000) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const { width, height } = bitmap;
  const longest = Math.max(width, height);
  if (longest <= MAX_IMAGE_DIMENSION) {
    bitmap.close();
    return file;
  }

  const scale = MAX_IMAGE_DIMENSION / longest;
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );

  if (!blob || blob.size >= file.size) return file;
  return blob;
}
