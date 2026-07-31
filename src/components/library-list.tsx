"use client";

import { useMemo, useState } from "react";

import type { SeriesSummary } from "@/domain/types";
import { SeriesCard } from "@/components/series-card";

/**
 * Client-side searchable library. The full summary list is small (a personal
 * collection), so filtering in the browser keeps in-bookstore lookups instant
 * with no round trip.
 */
export function LibraryList({ summaries }: { summaries: SeriesSummary[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return summaries;
    return summaries.filter((s) => s.series.title.toLowerCase().includes(q));
  }, [query, summaries]);

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        inputMode="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a series…"
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none placeholder:text-muted focus:border-accent"
        aria-label="Search a series"
      />

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No series match “{query}”.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((summary) => (
            <li key={summary.series.id}>
              <SeriesCard summary={summary} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
