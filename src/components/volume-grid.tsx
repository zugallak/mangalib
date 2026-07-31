import type { VolumeWithOwnership } from "@/domain/types";

/**
 * Compact logical-volume grid. One cell per volume NUMBER (duplicate catalog
 * rows already collapsed upstream):
 *   owned    → filled green
 *   missing  → dashed outline / dimmed
 */
export function VolumeGrid({ volumes }: { volumes: VolumeWithOwnership[] }) {
  return (
    <ul className="grid grid-cols-5 gap-2 sm:grid-cols-6">
      {volumes.map((v) => (
        <VolumeCell key={v.volumeNumber} item={v} />
      ))}
    </ul>
  );
}

function VolumeCell({ item }: { item: VolumeWithOwnership }) {
  const base =
    "flex aspect-square items-center justify-center rounded-lg text-sm font-semibold select-none";

  if (!item.owned) {
    return (
      <li
        className={`${base} border border-dashed border-border text-muted`}
        aria-label={`Volume ${item.volumeNumber} missing`}
      >
        {item.volumeNumber}
      </li>
    );
  }

  return (
    <li
      className={`${base} text-white`}
      style={{ backgroundColor: "var(--owned)" }}
      aria-label={`Volume ${item.volumeNumber} owned`}
    >
      {item.volumeNumber}
    </li>
  );
}
