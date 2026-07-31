"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";

import { confidenceLevel, type MangaScanResult, type ScanProviderName } from "@/domain/scan";
import {
  seriesMatchKey,
  type DetectionResolution,
  type ResolutionStatus,
  type ResolutionSummary,
} from "@/domain/catalog";
import { downscaleImage } from "@/lib/image-client";
import { isAllowedImageType } from "@/lib/scan-upload";

type Stage = "capture" | "preview" | "analyzing" | "review" | "confirm" | "importing" | "done";

interface EditableDetection {
  id: string;
  seriesTitle: string;
  volumeNumber: number | null;
  publisher: string | null;
  confidence: number;
  notes: string | null;
}

interface ImportResult {
  added: number;
  alreadyOwned: number;
  skippedIncomplete: number;
}

const PROVIDER_LABEL: Record<ScanProviderName, string> = {
  gemini: "Analyzed with Gemini",
  openai: "Analyzed with OpenAI fallback",
};

export function Scanner() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("capture");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [provider, setProvider] = useState<ScanProviderName | null>(null);
  const [detections, setDetections] = useState<EditableDetection[]>([]);
  const [statusById, setStatusById] = useState<Record<string, ResolutionStatus>>({});
  const [summary, setSummary] = useState<ResolutionSummary | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImageBlob(null);
    setProvider(null);
    setDetections([]);
    setStatusById({});
    setSummary(null);
    setResult(null);
    setError(null);
    setStage("capture");
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setError(null);

    if (!isAllowedImageType(file.type)) {
      setError("Unsupported image type. Use a JPEG, PNG or WebP photo.");
      return;
    }
    const blob = await downscaleImage(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setImageBlob(blob);
    setPreviewUrl(URL.createObjectURL(blob));
    setStage("preview");
  }

  async function analyze() {
    if (!imageBlob || stage === "analyzing") return;
    setStage("analyzing");
    setError(null);
    try {
      const form = new FormData();
      const type = imageBlob.type || "image/jpeg";
      form.append("image", imageBlob, `bookshelf.${type.split("/")[1] ?? "jpg"}`);
      const res = await fetch("/api/scan", { method: "POST", body: form });
      const data = (await res.json()) as MangaScanResult | { error: string };
      if (!res.ok || !("detections" in data)) {
        throw new Error("error" in data ? data.error : "Could not analyze the image.");
      }
      setProvider(data.provider);
      setDetections(
        data.detections.map((d) => ({
          id: d.id,
          seriesTitle: d.seriesTitle,
          volumeNumber: d.volumeNumber,
          publisher: d.publisher ?? null,
          confidence: d.confidence,
          notes: d.notes ?? null,
        })),
      );
      setStage("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not analyze the image.");
      setStage("preview");
    }
  }

  function updateDetection(id: string, patch: Partial<EditableDetection>) {
    setDetections((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function removeDetection(id: string) {
    setDetections((prev) => prev.filter((d) => d.id !== id));
  }

  /** Bulk-edit every detection currently in a group (by member ids). */
  function updateGroup(memberIds: readonly string[], patch: Partial<EditableDetection>) {
    const ids = new Set(memberIds);
    setDetections((prev) => prev.map((d) => (ids.has(d.id) ? { ...d, ...patch } : d)));
  }

  function removeGroup(memberIds: readonly string[]) {
    const ids = new Set(memberIds);
    setDetections((prev) => prev.filter((d) => !ids.has(d.id)));
  }

  async function continueToConfirm() {
    setError(null);
    try {
      const res = await fetch("/api/scan/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detections: detections.map(toPayload) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not check your library.");
      const map: Record<string, ResolutionStatus> = {};
      for (const r of data.resolutions as DetectionResolution[]) map[r.detectionId] = r.status;
      setStatusById(map);
      setSummary(data.summary as ResolutionSummary);
      setStage("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check your library.");
    }
  }

  async function confirmImport() {
    if (stage === "importing") return;
    setStage("importing");
    setError(null);
    try {
      // Only import detections that resolve to owned/new — never ambiguous or
      // incomplete (those need user correction first).
      const toImport = detections.filter((d) => {
        const s = statusById[d.id];
        return s === "new" || s === "owned";
      });
      const res = await fetch("/api/scan/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detections: toImport.map(toPayload) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Could not update your library.");
      setResult(data as ImportResult);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your library.");
      setStage("confirm");
    }
  }

  // ---- render -------------------------------------------------------------

  if (stage === "done" && result) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <p className="text-lg font-semibold" style={{ color: "var(--owned)" }}>
            Added {result.added} {result.added === 1 ? "volume" : "volumes"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {result.alreadyOwned > 0 && `${result.alreadyOwned} already owned. `}
            {result.skippedIncomplete > 0 && `${result.skippedIncomplete} skipped. `}
          </p>
        </div>
        <Link
          href="/library"
          className="rounded-xl px-4 py-3 text-center font-semibold text-white"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Go to library
        </Link>
        <button
          type="button"
          onClick={reset}
          className="rounded-xl border border-border bg-surface px-4 py-3 font-semibold"
        >
          Scan another shelf
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={onPickFile}
        className="hidden"
      />

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </p>
      )}

      {(stage === "capture" || stage === "preview" || stage === "analyzing") && (
        <CaptureStage
          stage={stage}
          previewUrl={previewUrl}
          onChoose={() => fileRef.current?.click()}
          onAnalyze={analyze}
        />
      )}

      {stage === "review" && (
        <ReviewStage
          provider={provider}
          detections={detections}
          onUpdate={updateDetection}
          onRemove={removeDetection}
          onUpdateGroup={updateGroup}
          onRemoveGroup={removeGroup}
          onContinue={continueToConfirm}
          onRescan={reset}
        />
      )}

      {(stage === "confirm" || stage === "importing") && summary && (
        <ConfirmStage
          summary={summary}
          importing={stage === "importing"}
          onBack={() => setStage("review")}
          onConfirm={confirmImport}
        />
      )}
    </div>
  );
}

function toPayload(d: EditableDetection) {
  return {
    detectionId: d.id,
    seriesTitle: d.seriesTitle.trim(),
    volumeNumber: d.volumeNumber,
    publisher: d.publisher?.trim() ? d.publisher.trim() : null,
  };
}

// ---- stages ---------------------------------------------------------------

function CaptureStage({
  stage,
  previewUrl,
  onChoose,
  onAnalyze,
}: {
  stage: Stage;
  previewUrl: string | null;
  onChoose: () => void;
  onAnalyze: () => void;
}) {
  const analyzing = stage === "analyzing";
  return (
    <div className="flex flex-col gap-4">
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Selected bookshelf"
          className="max-h-80 w-full rounded-xl border border-border object-contain"
        />
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
          Take or choose a photo of a bookshelf with the manga spines visible.
        </div>
      )}

      {analyzing ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-center">
          <p className="font-semibold">Analyzing bookshelf…</p>
          <p className="mt-1 text-sm text-muted">This can take a moment.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onChoose}
            className="rounded-xl border border-border bg-surface px-4 py-4 font-semibold"
          >
            {previewUrl ? "Choose a different photo" : "Take / choose photo"}
          </button>
          {previewUrl && (
            <button
              type="button"
              onClick={onAnalyze}
              className="rounded-xl px-4 py-4 font-semibold text-white"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Analyze bookshelf
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface DetectionGroup {
  key: string;
  title: string;
  publisher: string | null;
  members: EditableDetection[];
  memberIds: string[];
  minConfidence: number;
}

function groupDetections(detections: EditableDetection[]): DetectionGroup[] {
  const map = new Map<string, EditableDetection[]>();
  for (const d of detections) {
    // Empty title → its own group so it stays visible/editable.
    const key = seriesMatchKey(d.seriesTitle) || `untitled:${d.id}`;
    const arr = map.get(key) ?? [];
    arr.push(d);
    map.set(key, arr);
  }
  return [...map.entries()].map(([key, members]) => ({
    key,
    title: members[0].seriesTitle,
    publisher: members[0].publisher,
    members,
    memberIds: members.map((m) => m.id),
    minConfidence: Math.min(...members.map((m) => m.confidence)),
  }));
}

function ReviewStage({
  provider,
  detections,
  onUpdate,
  onRemove,
  onUpdateGroup,
  onRemoveGroup,
  onContinue,
  onRescan,
}: {
  provider: ScanProviderName | null;
  detections: EditableDetection[];
  onUpdate: (id: string, patch: Partial<EditableDetection>) => void;
  onRemove: (id: string) => void;
  onUpdateGroup: (memberIds: readonly string[], patch: Partial<EditableDetection>) => void;
  onRemoveGroup: (memberIds: readonly string[]) => void;
  onContinue: () => void;
  onRescan: () => void;
}) {
  const groups = useMemo(() => groupDetections(detections), [detections]);

  if (detections.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
          No manga detected. Try a sharper photo or better lighting.
        </div>
        <button
          type="button"
          onClick={onRescan}
          className="rounded-xl border border-border bg-surface px-4 py-3 font-semibold"
        >
          Try another photo
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Review {groups.length} {groups.length === 1 ? "series" : "series"} · {detections.length}{" "}
          volumes
        </h2>
        {provider && <span className="text-xs text-muted">{PROVIDER_LABEL[provider]}</span>}
      </div>
      <p className="text-sm text-muted">
        Grouped by series. Fix a title once for the whole group, or expand to correct individual
        volumes.
      </p>

      <ul className="flex flex-col gap-3">
        {groups.map((group) => (
          <SeriesGroupCard
            key={group.key}
            group={group}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onUpdateGroup={onUpdateGroup}
            onRemoveGroup={onRemoveGroup}
          />
        ))}
      </ul>

      <div className="sticky bottom-20 flex gap-3">
        <button
          type="button"
          onClick={onContinue}
          className="flex-1 rounded-xl px-4 py-3 font-semibold text-white"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function SeriesGroupCard({
  group,
  onUpdate,
  onRemove,
  onUpdateGroup,
  onRemoveGroup,
}: {
  group: DetectionGroup;
  onUpdate: (id: string, patch: Partial<EditableDetection>) => void;
  onRemove: (id: string) => void;
  onUpdateGroup: (memberIds: readonly string[], patch: Partial<EditableDetection>) => void;
  onRemoveGroup: (memberIds: readonly string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const level = confidenceLevel(group.minConfidence);
  const levelColor = level === "high" ? "var(--owned)" : level === "medium" ? "#d97706" : "#dc2626";
  const sorted = [...group.members].sort(
    (a, b) => (a.volumeNumber ?? Infinity) - (b.volumeNumber ?? Infinity),
  );

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={group.title}
          onChange={(e) => onUpdateGroup(group.memberIds, { seriesTitle: e.target.value })}
          placeholder="Series"
          aria-label="Series title"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-base font-semibold outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => onRemoveGroup(group.memberIds)}
          className="shrink-0 text-xs text-muted active:opacity-70"
        >
          Remove all
        </button>
      </div>

      <div className="mb-2 flex items-center gap-3 text-xs text-muted">
        <span className="flex items-center gap-1.5" style={{ color: levelColor }}>
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: levelColor }}
          />
          {level} confidence
        </span>
        <span>
          {group.members.length} {group.members.length === 1 ? "volume" : "volumes"}
        </span>
      </div>

      {/* Volume chips — inline per-volume number edit + remove. */}
      <div className="flex flex-wrap gap-2">
        {sorted.map((d) => (
          <VolumeChip key={d.id} detection={d} onUpdate={onUpdate} onRemove={onRemove} />
        ))}
      </div>

      <input
        value={group.publisher ?? ""}
        onChange={(e) =>
          onUpdateGroup(group.memberIds, { publisher: e.target.value || null })
        }
        placeholder="Publisher / edition hint (optional)"
        aria-label="Publisher"
        className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 text-xs text-accent active:opacity-70"
        style={{ color: "var(--accent)" }}
      >
        {expanded ? "Hide individual edits" : "Edit individually (split / move a volume)"}
      </button>

      {expanded && (
        <ul className="mt-2 flex flex-col gap-2 border-t border-border pt-2">
          {sorted.map((d) => (
            <li key={d.id} className="flex gap-2">
              <input
                value={d.seriesTitle}
                onChange={(e) => onUpdate(d.id, { seriesTitle: e.target.value })}
                aria-label="Series title for this volume"
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <VolumeNumberInput detection={d} onUpdate={onUpdate} />
              <button
                type="button"
                onClick={() => onRemove(d.id)}
                className="shrink-0 px-2 text-xs text-muted active:opacity-70"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function VolumeChip({
  detection,
  onUpdate,
  onRemove,
}: {
  detection: EditableDetection;
  onUpdate: (id: string, patch: Partial<EditableDetection>) => void;
  onRemove: (id: string) => void;
}) {
  const missing = detection.volumeNumber === null;
  return (
    <span
      className="flex items-center gap-1 rounded-lg border px-1.5 py-1"
      style={{ borderColor: missing ? "#dc2626" : "var(--border)" }}
    >
      <VolumeNumberInput detection={detection} onUpdate={onUpdate} />
      <button
        type="button"
        onClick={() => onRemove(detection.id)}
        aria-label={`Remove volume ${detection.volumeNumber ?? ""}`}
        className="text-xs text-muted active:opacity-70"
      >
        ✕
      </button>
    </span>
  );
}

function VolumeNumberInput({
  detection,
  onUpdate,
}: {
  detection: EditableDetection;
  onUpdate: (id: string, patch: Partial<EditableDetection>) => void;
}) {
  return (
    <input
      value={detection.volumeNumber ?? ""}
      onChange={(e) => {
        const v = e.target.value.trim();
        const n = v === "" ? null : Number.parseInt(v, 10);
        onUpdate(detection.id, { volumeNumber: n !== null && Number.isFinite(n) ? n : null });
      }}
      inputMode="numeric"
      placeholder="?"
      aria-label="Volume number"
      className="w-12 rounded-md border border-border bg-background px-1 py-1 text-center text-sm outline-none focus:border-accent"
    />
  );
}

function ConfirmStage({
  summary,
  importing,
  onBack,
  onConfirm,
}: {
  summary: ResolutionSummary;
  importing: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Confirm import</h2>

      <ul className="rounded-xl border border-border bg-surface p-4 text-sm">
        <SummaryRow label="Detected" value={summary.total} />
        <SummaryRow label="New" value={summary.toAdd} color="var(--owned)" />
        <SummaryRow label="Already owned" value={summary.owned} />
        <SummaryRow label="Need review" value={summary.needsReview} color="#d97706" />
      </ul>

      {summary.needsReview > 0 && (
        <p className="text-xs text-muted">
          {summary.needsReview} detection(s) can’t be imported yet (missing volume number or an
          ambiguous match). Go back to fix them.
        </p>
      )}

      {summary.toAdd > 0 ? (
        <button
          type="button"
          onClick={onConfirm}
          disabled={importing}
          className="rounded-xl px-4 py-4 font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {importing ? "Adding…" : `Add ${summary.toAdd} new ${summary.toAdd === 1 ? "volume" : "volumes"}`}
        </button>
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-surface p-4 text-center text-sm text-muted">
          Nothing new to add — everything detected is already in your library or needs review.
        </p>
      )}

      <button
        type="button"
        onClick={onBack}
        disabled={importing}
        className="rounded-xl border border-border bg-surface px-4 py-3 font-semibold disabled:opacity-60"
      >
        Back to review
      </button>
    </div>
  );
}

function SummaryRow({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <li className="flex items-center justify-between py-1">
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular-nums" style={color ? { color } : undefined}>
        {value}
      </span>
    </li>
  );
}
