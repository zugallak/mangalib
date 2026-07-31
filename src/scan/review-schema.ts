import { z } from "zod";

/**
 * Validation for the (possibly user-edited) detections posted back from the
 * review screen to the resolve/import endpoints. Never trust the client.
 */
export const reviewDetectionSchema = z.object({
  detectionId: z.string().min(1),
  seriesTitle: z.string().max(300),
  volumeNumber: z.number().int().nullable(),
  publisher: z.string().max(200).nullable().default(null),
});

export const reviewPayloadSchema = z.object({
  // A single bookshelf photo won't realistically exceed a few hundred spines.
  detections: z.array(reviewDetectionSchema).max(500),
});

export type ReviewDetection = z.infer<typeof reviewDetectionSchema>;
