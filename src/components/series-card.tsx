import Link from "next/link";

import type { SeriesSummary } from "@/domain/types";

/**
 * Library-overview card. Truthful about completeness:
 *  - unknown total → "N volumes owned" (no bar, never "Complete")
 *  - known total   → "owned / total", progress bar, missing count / Complete
 */
export function SeriesCard({ summary }: { summary: SeriesSummary }) {
  const { series, ownedCount, totalVolumes, missingCount, isComplete } = summary;
  const known = totalVolumes !== null;
  const pct = known && totalVolumes > 0 ? Math.round((ownedCount / totalVolumes) * 100) : 0;

  return (
    <Link
      href={`/series/${series.id}`}
      className="block rounded-xl border border-border bg-surface p-4 active:opacity-80"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="truncate text-base font-semibold">{series.title}</h2>
        <span className="shrink-0 text-sm text-muted">
          {known ? `${ownedCount} / ${totalVolumes}` : `${ownedCount} owned`}
        </span>
      </div>

      {known ? (
        <>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-missing">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, backgroundColor: "var(--owned)" }}
            />
          </div>
          <div className="mt-2 flex gap-3 text-xs text-muted">
            {isComplete ? (
              <span style={{ color: "var(--owned)" }}>Complete</span>
            ) : (
              <span>{missingCount} missing</span>
            )}
          </div>
        </>
      ) : (
        <div className="mt-2 text-xs text-muted">
          {ownedCount} {ownedCount === 1 ? "volume" : "volumes"} owned · total unknown
        </div>
      )}
    </Link>
  );
}
