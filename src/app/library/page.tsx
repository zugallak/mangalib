import { getLibrarySummaries } from "@/data/library";
import { isSupabaseConfigured } from "@/lib/env";
import { LibraryList } from "@/components/library-list";
import { Notice } from "@/components/notice";

export const metadata = {
  title: "Library — MangaLib",
};

export default async function LibraryPage() {
  const summaries = await getLibrarySummaries();

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Library</h1>
        <p className="mt-1 text-sm text-muted">
          {summaries.length} series in your collection.
        </p>
      </header>

      {!isSupabaseConfigured ? (
        <Notice title="Supabase not configured yet">
          Configure your environment variables to load your library.
        </Notice>
      ) : summaries.length === 0 ? (
        <Notice title="Your library is empty">
          Volumes you add will appear here.
        </Notice>
      ) : (
        <LibraryList summaries={summaries} />
      )}
    </div>
  );
}
