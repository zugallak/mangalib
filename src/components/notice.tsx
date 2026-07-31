import type { ReactNode } from "react";

/** Neutral informational block used for empty and setup states. */
export function Notice({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center">
      <p className="text-base font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}
