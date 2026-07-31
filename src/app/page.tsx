import Link from "next/link";

import { getLibrarySummaries } from "@/data/library";
import { isSupabaseConfigured } from "@/lib/env";
import { Notice } from "@/components/notice";
import { SignOutButton } from "@/components/sign-out-button";

export default async function HomePage() {
  const summaries = await getLibrarySummaries();

  const seriesCount = summaries.length;
  const ownedVolumes = summaries.reduce((sum, s) => sum + s.ownedCount, 0);
  // Only known-total series contribute a meaningful "missing" figure.
  const missingVolumes = summaries.reduce((sum, s) => sum + (s.missingCount ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">MangaLib</h1>
          <p className="mt-1 text-sm text-muted">Your physical manga collection.</p>
        </div>
        {isSupabaseConfigured && <SignOutButton />}
      </header>

      {!isSupabaseConfigured && (
        <Notice title="Supabase not configured yet">
          Add your keys to <code className="font-mono">.env.local</code> (see{" "}
          <code className="font-mono">.env.example</code>) and run the SQL migration to start
          tracking volumes.
        </Notice>
      )}

      <section className="grid grid-cols-3 gap-3">
        <Stat label="Series" value={seriesCount} />
        <Stat label="Owned" value={ownedVolumes} />
        <Stat label="Missing" value={missingVolumes} />
      </section>

      <section className="flex flex-col gap-3">
        <Link
          href="/scan"
          className="rounded-xl px-4 py-4 text-center font-semibold text-white"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Scan a bookshelf
        </Link>
        <Link
          href="/library"
          className="rounded-xl border border-border bg-surface px-4 py-4 text-center font-semibold"
        >
          Browse library
        </Link>
      </section>

      {isSupabaseConfigured && seriesCount === 0 && (
        <Notice title="Your library is empty">
          Volumes you add will appear here.
        </Notice>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
