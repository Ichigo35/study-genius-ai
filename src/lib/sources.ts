import { supabase } from "@/integrations/supabase/client";

/**
 * An analysis is one long synchronous server call. If the Worker is killed or the
 * connection drops mid-run the `sources` row stays in `processing` forever with no
 * error. Anything still `processing` after this delay is treated as interrupted so
 * the UI can offer a retry instead of spinning indefinitely.
 */
export const STALE_ANALYSIS_MS = 10 * 60 * 1000;

export const INTERRUPTED_MESSAGE = "L'analyse a été interrompue. Relance-la.";

type SourceRow = { id: string; status: string; updated_at: string; error_message?: string | null };

/**
 * Flags stale `processing` rows as `failed` (RLS lets the owner update its own
 * sources) and returns the list with those rows patched locally.
 */
export async function reclaimStaleSources<T extends SourceRow>(rows: T[]): Promise<T[]> {
  const now = Date.now();
  const stale = rows.filter(
    (s) => s.status === "processing" && now - new Date(s.updated_at).getTime() > STALE_ANALYSIS_MS,
  );
  if (stale.length === 0) return rows;
  await supabase
    .from("sources")
    .update({ status: "failed", progress_step: null, error_message: INTERRUPTED_MESSAGE })
    .in(
      "id",
      stale.map((s) => s.id),
    );
  const staleIds = new Set(stale.map((s) => s.id));
  return rows.map((s) =>
    staleIds.has(s.id) ? { ...s, status: "failed", error_message: INTERRUPTED_MESSAGE } : s,
  );
}

export async function deleteSource(sourceId: string) {
  const { error } = await supabase.from("sources").delete().eq("id", sourceId);
  if (error) throw error;
}

export async function deleteSpace(spaceId: string) {
  const { error } = await supabase.from("study_spaces").delete().eq("id", spaceId);
  if (error) throw error;
}
