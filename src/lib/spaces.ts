import { supabase } from "@/integrations/supabase/client";

export interface StudySpace {
  id: string;
  name: string;
  description: string | null;
  emoji: string;
  color: string;
  last_activity_at: string;
  created_at: string;
}

export async function fetchSpaces(): Promise<StudySpace[]> {
  const { data, error } = await supabase
    .from("study_spaces")
    .select("*")
    .order("last_activity_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as StudySpace[];
}

export async function createSpace(input: { name: string; description?: string; emoji?: string }) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("not authenticated");
  const { data, error } = await supabase
    .from("study_spaces")
    .insert({
      user_id: auth.user.id,
      name: input.name,
      description: input.description ?? null,
      emoji: input.emoji ?? "📘",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as StudySpace;
}

export async function fetchSpaceCounts(spaceIds: string[]) {
  if (spaceIds.length === 0) return {} as Record<string, number>;
  const { data, error } = await supabase.from("sources").select("space_id").in("space_id", spaceIds);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) counts[row.space_id as string] = (counts[row.space_id as string] ?? 0) + 1;
  return counts;
}

export function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const MAX_UPLOAD_BYTES = 18 * 1024 * 1024;
