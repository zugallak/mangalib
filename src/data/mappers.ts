/**
 * Row → domain mappers. The only place that knows Supabase column names.
 */

import type { Edition, Series, Volume } from "@/domain/types";

export interface SeriesRow {
  id: string;
  title: string;
  original_title: string | null;
}

export interface EditionRow {
  id: string;
  series_id: string;
  total_volumes?: number | null;
}

export interface VolumeRow {
  id: string;
  edition_id: string;
  volume_number: number;
  isbn: string | null;
  title: string | null;
  cover_url: string | null;
}

export function toSeries(row: SeriesRow): Series {
  return {
    id: row.id,
    title: row.title,
    originalTitle: row.original_title,
  };
}

export function toEdition(row: EditionRow & { series_id: string }): Edition {
  return {
    id: row.id,
    seriesId: row.series_id,
    publisher: null,
    language: null,
    editionName: null,
    totalVolumes: row.total_volumes ?? null,
  };
}

export function toVolume(row: VolumeRow): Volume {
  return {
    id: row.id,
    editionId: row.edition_id,
    volumeNumber: row.volume_number,
    isbn: row.isbn,
    title: row.title,
    coverUrl: row.cover_url,
  };
}
