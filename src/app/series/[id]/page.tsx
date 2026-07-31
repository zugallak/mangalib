import Link from "next/link";
import { notFound } from "next/navigation";

import { getSeriesDetail } from "@/data/series";
import { VolumeGrid } from "@/components/volume-grid";
import { Notice } from "@/components/notice";

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getSeriesDetail(id);

  if (!detail) notFound();

  const { series, volumes, ownedCount, totalVolumes, isComplete } = detail;
  const known = totalVolumes !== null;
  const missingCount = known ? totalVolumes - ownedCount : null;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/library" className="text-sm text-muted active:opacity-70">
        ← Library
      </Link>

      <header>
        <h1 className="text-2xl font-bold">{series.title}</h1>
        <p className="mt-2 text-sm text-muted">
          {known ? (
            <>
              <span className="font-semibold text-foreground">
                {ownedCount} / {totalVolumes}
              </span>{" "}
              volumes
              {isComplete ? (
                <span style={{ color: "var(--owned)" }}> · Complete</span>
              ) : (
                missingCount !== null && missingCount > 0 && ` · ${missingCount} missing`
              )}
            </>
          ) : (
            <>
              <span className="font-semibold text-foreground">{ownedCount}</span>{" "}
              {ownedCount === 1 ? "volume" : "volumes"} owned
              <span className="text-muted"> · total unknown</span>
            </>
          )}
        </p>
      </header>

      {volumes.length === 0 ? (
        <Notice title="No volumes catalogued">
          This series has no volumes in the catalog yet.
        </Notice>
      ) : (
        <>
          <VolumeGrid volumes={volumes} />
          <Legend />
        </>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      <LegendItem color="var(--owned)" label="Owned" />
      <LegendItem color="var(--missing)" label="Missing" dashed />
    </div>
  );
}

function LegendItem({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded"
        style={
          dashed
            ? { border: "1px dashed var(--border)" }
            : { backgroundColor: color }
        }
      />
      {label}
    </span>
  );
}
