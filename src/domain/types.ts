/**
 * Core domain types.
 *
 * These deliberately separate *catalog* data (Series / Edition / Volume — the
 * shared, provider-independent facts about a manga) from *user ownership*
 * (OwnedVolume — what a given user physically has on their shelf).
 *
 * They are decoupled from any database or transport concern: the data layer
 * maps Supabase rows onto these types.
 */

export interface Series {
  id: string;
  title: string;
  originalTitle: string | null;
}

export interface Edition {
  id: string;
  seriesId: string;
  publisher: string | null;
  language: string | null;
  editionName: string | null;
}

export interface Volume {
  id: string;
  editionId: string;
  volumeNumber: number;
  isbn: string | null;
  title: string | null;
  coverUrl: string | null;
}

/**
 * A user owning a volume. Ownership is a boolean relationship: the row's
 * existence is the fact. There is no quantity — we do not track duplicate
 * physical copies.
 */
export interface OwnedVolume {
  id: string;
  userId: string;
  volumeId: string;
  createdAt: string;
}

/** Ownership status for a single volume, computed for the current user. */
export type VolumeOwnership = "owned" | "missing";

/**
 * A volume enriched with the current user's ownership state — the unit the
 * series detail grid renders.
 */
export interface VolumeWithOwnership {
  volume: Volume;
  owned: boolean;
  status: VolumeOwnership;
}

/**
 * Summary of one owned series for the library overview: enough to answer
 * "what do I own?" and "how complete is it?" at a glance.
 */
export interface SeriesSummary {
  series: Series;
  ownedCount: number;
  totalCount: number;
  missingCount: number;
}

/** A series together with its full, ownership-annotated volume list. */
export interface SeriesDetail {
  series: Series;
  volumes: VolumeWithOwnership[];
  ownedCount: number;
  totalCount: number;
}
