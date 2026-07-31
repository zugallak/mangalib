import type { VolumeWithOwnership } from "@/domain/types";

/**
 * Compact volume grid for the series detail page. Each cell shows the volume
 * number and its ownership state:
 *   owned    → filled green
 *   missing  → dashed outline / dimmed
 */
export function VolumeGrid({ volumes }: { volumes: VolumeWithOwnership[] }) {
  return (
    <ul className="grid grid-cols-5 gap-2 sm:grid-cols-6">
      {volumes.map((v) => (
        <VolumeCell key={v.volume.id} item={v} />
      ))}
    </ul>
  );
}

function VolumeCell({ item }: { item: VolumeWithOwnership }) {
  const { volume, owned } = item;

  const base =
    "flex aspect-square items-center justify-center rounded-lg text-sm font-semibold select-none";

  if (!owned) {
    return (
      <li
        className={`${base} border border-dashed border-border text-muted`}
        aria-label={`Volume ${volume.volumeNumber} missing`}
      >
        {volume.volumeNumber}
      </li>
    );
  }

  return (
    <li
      className={`${base} text-white`}
      style={{ backgroundColor: "var(--owned)" }}
      aria-label={`Volume ${volume.volumeNumber} owned`}
    >
      {volume.volumeNumber}
    </li>
  );
}
