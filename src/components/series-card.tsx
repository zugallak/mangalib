import Link from "next/link";

import type { SeriesSummary } from "@/domain/types";

/**
 * Library-overview card. Answers "what do I own?" and "how complete is it?"
 * at a glance: title, owned/total count, and a progress bar.
 */
export function SeriesCard({ summary }: { summary: SeriesSummary }) {
  const { series, ownedCount, totalCount, missingCount } = summary;
  const pct = totalCount > 0 ? Math.round((ownedCount / totalCount) * 100) : 0;

  return (
    <Link
      href={`/series/${series.id}`}
      className="block rounded-xl border border-border bg-surface p-4 active:opacity-80"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="truncate text-base font-semibold">{series.title}</h2>
        <span className="shrink-0 text-sm text-muted">
          {ownedCount} / {totalCount}
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-missing">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: "var(--owned)" }}
        />
      </div>

      <div className="mt-2 flex gap-3 text-xs text-muted">
        {missingCount > 0 ? (
          <span>{missingCount} missing</span>
        ) : (
          <span style={{ color: "var(--owned)" }}>Complete</span>
        )}
      </div>
    </Link>
  );
}
