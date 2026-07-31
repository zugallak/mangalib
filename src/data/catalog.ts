import "server-only";

import {
  isImportable,
  normalizeTitle,
  type DetectionResolution,
  type ResolvableDetection,
} from "@/domain/catalog";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Catalog data access.
 *
 * Reads (matching) use the RLS-aware user client — catalog SELECT is allowed
 * for authenticated users. Writes (find-or-create) use the service-role client
 * because RLS intentionally denies catalog INSERT to normal users. Ownership
 * writes never happen here — they go through the RLS user client in
 * src/data/ownership.ts.
 */

interface CatalogIndex {
  /** normalized series title → series ids */
  seriesByTitle: Map<string, string[]>;
  /** series id → editions (id + normalized publisher) */
  editionsBySeries: Map<string, { id: string; publisher: string | null }[]>;
  /** edition id → (volume_number → volume id) */
  volumesByEdition: Map<string, Map<number, string>>;
  /** volume ids the current user owns */
  ownedVolumeIds: Set<string>;
}

async function loadCatalogIndex(seriesTitles: readonly string[]): Promise<CatalogIndex> {
  const supabase = await createClient();

  const wanted = new Set(seriesTitles.map(normalizeTitle).filter((t) => t.length > 0));

  const seriesByTitle = new Map<string, string[]>();
  const editionsBySeries = new Map<string, { id: string; publisher: string | null }[]>();
  const volumesByEdition = new Map<string, Map<number, string>>();
  const ownedVolumeIds = new Set<string>();

  if (wanted.size === 0) {
    return { seriesByTitle, editionsBySeries, volumesByEdition, ownedVolumeIds };
  }

  // Personal catalogs are small: fetch series and match by normalized title
  // in-memory (the DB's lower(title) index isn't accent-insensitive, so we
  // reconcile here to stay consistent with normalizeTitle()).
  const { data: seriesRows } = await supabase.from("series").select("id, title");
  const matchedSeriesIds: string[] = [];
  for (const row of seriesRows ?? []) {
    const norm = normalizeTitle(row.title);
    if (!wanted.has(norm)) continue;
    const ids = seriesByTitle.get(norm) ?? [];
    ids.push(row.id);
    seriesByTitle.set(norm, ids);
    matchedSeriesIds.push(row.id);
  }

  if (matchedSeriesIds.length === 0) {
    return { seriesByTitle, editionsBySeries, volumesByEdition, ownedVolumeIds };
  }

  const { data: editionRows } = await supabase
    .from("edition")
    .select("id, series_id, publisher")
    .in("series_id", matchedSeriesIds);

  const editionIds: string[] = [];
  for (const e of editionRows ?? []) {
    const list = editionsBySeries.get(e.series_id) ?? [];
    list.push({ id: e.id, publisher: e.publisher });
    editionsBySeries.set(e.series_id, list);
    editionIds.push(e.id);
  }

  if (editionIds.length > 0) {
    const { data: volumeRows } = await supabase
      .from("volume")
      .select("id, edition_id, volume_number")
      .in("edition_id", editionIds);

    const volumeIds: string[] = [];
    for (const v of volumeRows ?? []) {
      const byNumber = volumesByEdition.get(v.edition_id) ?? new Map<number, string>();
      byNumber.set(v.volume_number, v.id);
      volumesByEdition.set(v.edition_id, byNumber);
      volumeIds.push(v.id);
    }

    if (volumeIds.length > 0) {
      const { data: owned } = await supabase
        .from("owned_volume")
        .select("volume_id")
        .in("volume_id", volumeIds);
      for (const o of owned ?? []) ownedVolumeIds.add(o.volume_id);
    }
  }

  return { seriesByTitle, editionsBySeries, volumesByEdition, ownedVolumeIds };
}

/**
 * Resolve reviewed detections against the shared catalog + the user's
 * ownership. Never guesses between ambiguous matches. Detections whose series
 * or volume don't exist yet resolve to "new" — they will be created on import.
 */
export async function resolveDetections(
  detections: readonly ResolvableDetection[],
): Promise<DetectionResolution[]> {
  const index = await loadCatalogIndex(detections.map((d) => d.seriesTitle));

  return detections.map((d) => resolveOne(d, index));
}

function resolveOne(d: ResolvableDetection, index: CatalogIndex): DetectionResolution {
  if (!isImportable(d) || d.volumeNumber === null) {
    return { detectionId: d.detectionId, status: "incomplete" };
  }

  const seriesIds = index.seriesByTitle.get(normalizeTitle(d.seriesTitle)) ?? [];

  // Series not in catalog yet → will be created on import.
  if (seriesIds.length === 0) return { detectionId: d.detectionId, status: "new" };
  if (seriesIds.length > 1) return { detectionId: d.detectionId, status: "ambiguous" };

  const seriesId = seriesIds[0];
  const editions = index.editionsBySeries.get(seriesId) ?? [];

  // Collect every volume id matching this number across the series' editions.
  const wantPublisher = d.publisher ? normalizeTitle(d.publisher) : null;
  const matches: string[] = [];
  const publisherMatches: string[] = [];
  for (const ed of editions) {
    const volumeId = index.volumesByEdition.get(ed.id)?.get(d.volumeNumber);
    if (!volumeId) continue;
    matches.push(volumeId);
    if (wantPublisher && normalizeTitle(ed.publisher ?? "") === wantPublisher) {
      publisherMatches.push(volumeId);
    }
  }

  // Volume not catalogued yet → will be created on import.
  if (matches.length === 0) return { detectionId: d.detectionId, status: "new" };

  let volumeId: string | null = null;
  if (matches.length === 1) volumeId = matches[0];
  else if (publisherMatches.length === 1) volumeId = publisherMatches[0];
  else return { detectionId: d.detectionId, status: "ambiguous" };

  const status = index.ownedVolumeIds.has(volumeId) ? "owned" : "new";
  return { detectionId: d.detectionId, status, volumeId };
}

/**
 * Find or create the catalog volume for a validated detection, returning its
 * id. Uses the service-role client (trusted, server-only) since RLS denies
 * catalog writes to normal users. Idempotent by lookup: existing rows are
 * reused, never duplicated for the volume (protected by the
 * UNIQUE(edition_id, volume_number) constraint).
 */
export async function findOrCreateVolumeId(input: {
  seriesTitle: string;
  volumeNumber: number;
  publisher: string | null;
}): Promise<string> {
  const svc = createServiceClient();
  const norm = normalizeTitle(input.seriesTitle);

  // 1) Series (match on normalized title).
  const { data: seriesRows, error: seriesErr } = await svc.from("series").select("id, title");
  if (seriesErr) throw seriesErr;
  let seriesId = (seriesRows ?? []).find((s) => normalizeTitle(s.title) === norm)?.id;
  if (!seriesId) {
    const { data, error } = await svc
      .from("series")
      .insert({ title: input.seriesTitle.trim() })
      .select("id")
      .single();
    if (error) throw error;
    seriesId = data.id;
  }

  // 2) Edition (default edition per publisher; null publisher is its own bucket).
  const { data: editionRows, error: edErr } = await svc
    .from("edition")
    .select("id, publisher")
    .eq("series_id", seriesId);
  if (edErr) throw edErr;
  const wantPublisher = input.publisher ? normalizeTitle(input.publisher) : "";
  let editionId = (editionRows ?? []).find(
    (e) => normalizeTitle(e.publisher ?? "") === wantPublisher,
  )?.id;
  if (!editionId) {
    const { data, error } = await svc
      .from("edition")
      .insert({ series_id: seriesId, publisher: input.publisher })
      .select("id")
      .single();
    if (error) throw error;
    editionId = data.id;
  }

  // 3) Volume (unique on edition_id + volume_number).
  const { data: volumeRow, error: volErr } = await svc
    .from("volume")
    .select("id")
    .eq("edition_id", editionId)
    .eq("volume_number", input.volumeNumber)
    .maybeSingle();
  if (volErr) throw volErr;
  if (volumeRow) return volumeRow.id;

  const { data: inserted, error: insErr } = await svc
    .from("volume")
    .insert({ edition_id: editionId, volume_number: input.volumeNumber })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return inserted.id;
}
