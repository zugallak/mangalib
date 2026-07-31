/**
 * Catalog duplicate repair — consolidates logical-duplicate series / editions /
 * volumes created by noisy AI scans, preserving all users' ownership.
 *
 *   npm run catalog:repair            # DRY RUN (default) — reports only
 *   npm run catalog:repair -- --apply # MUTATES the database
 *
 * Identity: seriesMatchKey(title) + volume number (publisher/edition ignored).
 * Never merges series whose match keys differ (xxxHOLiC vs xxxHOLiC Rei stay
 * separate). Preserves ownership: canonical ownership is inserted (ON CONFLICT
 * DO NOTHING) BEFORE any duplicate ownership/volume rows are deleted.
 *
 * Reads SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
 * from the environment. Logs counts and series titles only — no user PII.
 */
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(2);
}

const svc = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Must match src/domain/catalog.ts seriesMatchKey(). */
const seriesMatchKey = (t) =>
  (t ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const byCreatedAsc = (a, b) => String(a.created_at).localeCompare(String(b.created_at));

async function loadAll() {
  const [series, editions, volumes, owned] = await Promise.all([
    svc.from("series").select("id, title, created_at"),
    svc.from("edition").select("id, series_id, created_at"),
    svc.from("volume").select("id, edition_id, volume_number, created_at"),
    svc.from("owned_volume").select("id, user_id, volume_id"),
  ]);
  for (const r of [series, editions, volumes, owned]) if (r.error) throw r.error;
  return {
    series: series.data ?? [],
    editions: editions.data ?? [],
    volumes: volumes.data ?? [],
    owned: owned.data ?? [],
  };
}

function buildPlan(data) {
  const editionsBySeries = new Map();
  for (const e of data.editions) {
    const arr = editionsBySeries.get(e.series_id) ?? [];
    arr.push(e);
    editionsBySeries.set(e.series_id, arr);
  }
  const volumesByEdition = new Map();
  for (const v of data.volumes) {
    const arr = volumesByEdition.get(v.edition_id) ?? [];
    arr.push(v);
    volumesByEdition.set(v.edition_id, arr);
  }
  const ownersByVolume = new Map();
  for (const o of data.owned) {
    const arr = ownersByVolume.get(o.volume_id) ?? [];
    arr.push(o);
    ownersByVolume.set(o.volume_id, arr);
  }

  // Group series by match key.
  const groups = new Map();
  for (const s of data.series) {
    const key = seriesMatchKey(s.title);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  const plan = {
    seriesGroups: [],
    stats: {
      totalSeries: data.series.length,
      // Match-key groups containing >1 series row (true duplicate identities).
      seriesIdentitiesMerged: 0,
      // Match-key groups touched by ANY duplication (identity and/or volume rows).
      seriesAffected: 0,
      logicalVolumeDuplicates: 0,
      volumesToDelete: 0,
      ownershipRepointed: 0,
      ownershipCanonicalInserts: 0,
    },
  };

  for (const [key, groupSeries] of groups) {
    // Collect every volume across the group's series/editions, indexed by number.
    const volumesByNumber = new Map();
    let ownedCountBySeries = new Map();
    for (const s of groupSeries) {
      let ownedForSeries = 0;
      for (const e of editionsBySeries.get(s.id) ?? []) {
        for (const v of volumesByEdition.get(e.id) ?? []) {
          const arr = volumesByNumber.get(v.volume_number) ?? [];
          arr.push({ ...v, series_id: s.id });
          volumesByNumber.set(v.volume_number, arr);
          if ((ownersByVolume.get(v.id) ?? []).length > 0) ownedForSeries += 1;
        }
      }
      ownedCountBySeries.set(s.id, ownedForSeries);
    }

    const dupNumbers = [...volumesByNumber.values()].filter((a) => a.length > 1).length;
    const hasSeriesDupes = groupSeries.length > 1;
    if (!hasSeriesDupes && dupNumbers === 0) continue; // nothing to do for this key

    plan.stats.seriesAffected += 1;
    if (hasSeriesDupes) plan.stats.seriesIdentitiesMerged += 1;

    // Canonical series: most owned volumes, tie → earliest created.
    const canonicalSeries = [...groupSeries].sort(
      (a, b) =>
        (ownedCountBySeries.get(b.id) ?? 0) - (ownedCountBySeries.get(a.id) ?? 0) ||
        byCreatedAsc(a, b),
    )[0];

    // Canonical edition: earliest edition of the canonical series (or null → create).
    const canonicalEdition =
      [...(editionsBySeries.get(canonicalSeries.id) ?? [])].sort(byCreatedAsc)[0] ?? null;

    const groupPlan = {
      key,
      canonicalSeriesTitle: canonicalSeries.title,
      duplicateSeriesTitles: groupSeries.filter((s) => s.id !== canonicalSeries.id).map((s) => s.title),
      volumeMerges: [],
    };

    for (const [number, vols] of volumesByNumber) {
      if (vols.length <= 1 && !hasSeriesDupes) continue;
      plan.stats.logicalVolumeDuplicates += vols.length > 1 ? 1 : 0;

      // Canonical volume: prefer one already under the canonical edition, else earliest.
      const inCanonicalEdition = canonicalEdition
        ? vols.filter((v) => v.edition_id === canonicalEdition.id).sort(byCreatedAsc)[0]
        : undefined;
      const canonicalVolume = inCanonicalEdition ?? [...vols].sort(byCreatedAsc)[0];
      const duplicates = vols.filter((v) => v.id !== canonicalVolume.id);

      let repoint = 0;
      let inserts = 0;
      const canonicalOwners = new Set((ownersByVolume.get(canonicalVolume.id) ?? []).map((o) => o.user_id));
      for (const dup of duplicates) {
        for (const o of ownersByVolume.get(dup.id) ?? []) {
          repoint += 1;
          if (!canonicalOwners.has(o.user_id)) {
            inserts += 1;
            canonicalOwners.add(o.user_id);
          }
        }
      }

      plan.stats.volumesToDelete += duplicates.length;
      plan.stats.ownershipRepointed += repoint;
      plan.stats.ownershipCanonicalInserts += inserts;

      if (vols.length > 1) {
        groupPlan.volumeMerges.push({ number, catalogRecords: vols.length });
      }
    }

    plan.seriesGroups.push(groupPlan);
  }

  return plan;
}

function printPlan(plan) {
  console.log(`\n=== Catalog repair ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===\n`);

  const dupeGroups = plan.seriesGroups.filter((g) => g.duplicateSeriesTitles.length > 0);
  console.log(
    `Duplicate SERIES IDENTITIES (same match key, >1 series row → will be merged into one): ${dupeGroups.length}`,
  );
  for (const g of dupeGroups) {
    console.log(`  - [${g.duplicateSeriesTitles.join(", ")}] → canonical "${g.canonicalSeriesTitle}"`);
  }

  console.log(
    `\nDuplicate LOGICAL VOLUMES (one series identity, same volume number, >1 catalog row → consolidated to one):`,
  );
  let anyVol = false;
  for (const g of plan.seriesGroups) {
    for (const m of g.volumeMerges) {
      anyVol = true;
      console.log(`  - "${g.canonicalSeriesTitle}" volume ${m.number}: ${m.catalogRecords} catalog rows`);
    }
  }
  if (!anyVol) console.log("  (none)");

  console.log(`\nSummary:`);
  console.log(`  Duplicate series identities merged        : ${plan.stats.seriesIdentitiesMerged}`);
  console.log(`  Series affected (identity and/or volumes) : ${plan.stats.seriesAffected}`);
  console.log(`  Duplicate logical volumes consolidated    : ${plan.stats.logicalVolumeDuplicates}`);
  console.log(`  Ownership rows re-pointed to canonical     : ${plan.stats.ownershipRepointed}`);
  console.log(`  New canonical ownership inserts           : ${plan.stats.ownershipCanonicalInserts}`);
  console.log(`  Duplicate volume rows deleted             : ${plan.stats.volumesToDelete}`);
  console.log(`  Series match_key (re)computed on --apply  : ${plan.stats.totalSeries}`);
  console.log("");
}

async function apply(data) {
  // Re-derive per-group so we operate on live rows in a safe order.
  const editionsBySeries = new Map();
  for (const e of data.editions) {
    (editionsBySeries.get(e.series_id) ?? editionsBySeries.set(e.series_id, []).get(e.series_id)).push(e);
  }
  const volumesByEdition = new Map();
  for (const v of data.volumes) {
    (volumesByEdition.get(v.edition_id) ?? volumesByEdition.set(v.edition_id, []).get(v.edition_id)).push(v);
  }
  const ownersByVolume = new Map();
  for (const o of data.owned) {
    (ownersByVolume.get(o.volume_id) ?? ownersByVolume.set(o.volume_id, []).get(o.volume_id)).push(o);
  }

  const groups = new Map();
  for (const s of data.series) {
    const key = seriesMatchKey(s.title);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(s);
  }

  for (const [, groupSeries] of groups) {
    const ownedCountBySeries = new Map();
    const volumesByNumber = new Map();
    for (const s of groupSeries) {
      let owned = 0;
      for (const e of editionsBySeries.get(s.id) ?? []) {
        for (const v of volumesByEdition.get(e.id) ?? []) {
          (volumesByNumber.get(v.volume_number) ?? volumesByNumber.set(v.volume_number, []).get(v.volume_number)).push(v);
          if ((ownersByVolume.get(v.id) ?? []).length) owned += 1;
        }
      }
      ownedCountBySeries.set(s.id, owned);
    }
    const hasSeriesDupes = groupSeries.length > 1;
    const dupNumbers = [...volumesByNumber.values()].some((a) => a.length > 1);
    if (!hasSeriesDupes && !dupNumbers) continue;

    const canonicalSeries = [...groupSeries].sort(
      (a, b) => (ownedCountBySeries.get(b.id) ?? 0) - (ownedCountBySeries.get(a.id) ?? 0) || byCreatedAsc(a, b),
    )[0];

    let canonicalEdition = [...(editionsBySeries.get(canonicalSeries.id) ?? [])].sort(byCreatedAsc)[0];
    if (!canonicalEdition) {
      const { data: created, error } = await svc
        .from("edition")
        .insert({ series_id: canonicalSeries.id, publisher: null })
        .select("id")
        .single();
      if (error) throw error;
      canonicalEdition = { id: created.id, series_id: canonicalSeries.id };
    }

    for (const vols of volumesByNumber.values()) {
      const inCanon = vols.filter((v) => v.edition_id === canonicalEdition.id).sort(byCreatedAsc)[0];
      let canonicalVolume = inCanon;
      if (!canonicalVolume) {
        // Re-parent the earliest duplicate into the canonical edition.
        canonicalVolume = [...vols].sort(byCreatedAsc)[0];
        const { error } = await svc
          .from("volume")
          .update({ edition_id: canonicalEdition.id })
          .eq("id", canonicalVolume.id);
        if (error) throw error;
      }
      const duplicates = vols.filter((v) => v.id !== canonicalVolume.id);

      for (const dup of duplicates) {
        const owners = ownersByVolume.get(dup.id) ?? [];
        if (owners.length > 0) {
          const rows = owners.map((o) => ({ user_id: o.user_id, volume_id: canonicalVolume.id }));
          const { error: insErr } = await svc
            .from("owned_volume")
            .upsert(rows, { onConflict: "user_id,volume_id", ignoreDuplicates: true });
          if (insErr) throw insErr;
          const { error: delOwnErr } = await svc.from("owned_volume").delete().eq("volume_id", dup.id);
          if (delOwnErr) throw delOwnErr;
        }
        const { error: delVolErr } = await svc.from("volume").delete().eq("id", dup.id);
        if (delVolErr) throw delVolErr;
      }
    }

    // Delete now-empty editions and non-canonical series in this group.
    const { data: remainingVolumes } = await svc
      .from("volume")
      .select("edition_id")
      .in(
        "edition_id",
        (editionsBySeries.get(canonicalSeries.id) ?? [])
          .concat(groupSeries.filter((s) => s.id !== canonicalSeries.id).flatMap((s) => editionsBySeries.get(s.id) ?? []))
          .map((e) => e.id),
      );
    const nonEmptyEditionIds = new Set((remainingVolumes ?? []).map((r) => r.edition_id));

    const allGroupEditions = groupSeries.flatMap((s) => editionsBySeries.get(s.id) ?? []);
    for (const e of allGroupEditions) {
      if (e.id === canonicalEdition.id) continue;
      if (nonEmptyEditionIds.has(e.id)) continue;
      const { error } = await svc.from("edition").delete().eq("id", e.id);
      if (error) throw error;
    }

    for (const s of groupSeries) {
      if (s.id === canonicalSeries.id) continue;
      const { data: remEd } = await svc.from("edition").select("id").eq("series_id", s.id).limit(1);
      if ((remEd ?? []).length === 0) {
        const { error } = await svc.from("series").delete().eq("id", s.id);
        if (error) throw error;
      }
    }
  }

  // Backfill match_key EXACTLY (JS seriesMatchKey) for every surviving series,
  // so the stored value equals the app's identity key by construction. This is
  // what makes a future UNIQUE index on match_key safe to add.
  const { data: survivors, error: readErr } = await svc.from("series").select("id, title");
  if (readErr) throw readErr;
  for (const s of survivors ?? []) {
    const { error } = await svc
      .from("series")
      .update({ match_key: seriesMatchKey(s.title) })
      .eq("id", s.id);
    if (error) throw error;
  }
}

async function main() {
  const data = await loadAll();
  const plan = buildPlan(data);
  printPlan(plan);

  if (!APPLY) {
    console.log("Dry run only. Re-run with `-- --apply` to mutate.\n");
    return;
  }
  console.log("Applying…");
  await apply(data);
  console.log("Repair applied. Re-run without --apply to verify (should report 0 duplicates).\n");
}

main().catch((err) => {
  console.error("Repair failed:", err?.message ?? err);
  process.exit(1);
});
