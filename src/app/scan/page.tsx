import { LOW_CONFIDENCE_THRESHOLD } from "@/domain/scan";

export const metadata = {
  title: "Scan — MangaLib",
};

const steps = [
  {
    title: "Take a photo",
    body: "Capture a bookshelf with the manga spines visible.",
  },
  {
    title: "Analyze",
    body: "A vision model reads spine text, volume numbers, publisher and design to detect volumes.",
  },
  {
    title: "Review & correct",
    body: "Every detection is shown with a confidence level. Low-confidence guesses are flagged so you can fix or ignore them.",
  },
  {
    title: "Validate",
    body: "Nothing is added automatically. Only volumes you confirm are imported.",
  },
  {
    title: "Added to your library",
    body: "Confirmed volumes are matched to the catalog and marked as owned.",
  },
];

export default function ScanPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Scan a bookshelf</h1>
        <p className="mt-1 text-sm text-muted">
          Take a photo of a bookshelf to identify manga volumes.
        </p>
      </header>

      <div
        className="rounded-xl border border-dashed border-border bg-surface p-8 text-center"
        role="note"
      >
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-background">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <p className="font-semibold">Photo scanning coming soon</p>
        <p className="mt-1 text-sm text-muted">
          The recognition layer is stubbed for now — no AI provider is wired up yet.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          How it will work
        </h2>
        <ol className="flex flex-col gap-3">
          {steps.map((step, i) => (
            <li key={step.title} className="flex gap-3 rounded-xl border border-border bg-surface p-3">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {i + 1}
              </span>
              <div>
                <p className="font-semibold">{step.title}</p>
                <p className="text-sm text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-xs text-muted">
        Detections below {Math.round(LOW_CONFIDENCE_THRESHOLD * 100)}% confidence will be marked for
        review. Detected volumes are never added to your library without your validation.
      </p>
    </div>
  );
}
