import { Scanner } from "@/components/scan/scanner";

export const metadata = {
  title: "Scan — MangaLib",
};

/**
 * The /scan route is protected server-side by src/proxy.ts (auth required).
 * The scan API routes independently re-check the session, so the AI providers
 * can never be reached by an unauthenticated request.
 */
export default function ScanPage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold">Scan a bookshelf</h1>
        <p className="mt-1 text-sm text-muted">
          Take a photo of a bookshelf to identify manga volumes. Nothing is added to your library
          until you review and confirm.
        </p>
      </header>

      <Scanner />
    </div>
  );
}
