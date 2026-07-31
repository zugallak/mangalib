/**
 * Shared image-upload constraints. Safe to import from both client and server
 * (no secrets, no server-only imports).
 */

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Hard server-side cap on the uploaded image (after client downscale). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
export const MIN_UPLOAD_BYTES = 256; // reject empty / truncated files

/**
 * Longest-edge target for client-side downscaling. Big enough to keep spine
 * text legible for the model, small enough to avoid huge uploads.
 */
export const MAX_IMAGE_DIMENSION = 2000;

export function isAllowedImageType(type: string): type is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}
