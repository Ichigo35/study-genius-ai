import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserSettings {
  user_id: string;
  ui_language: string;
  ai_output_language: string;
  study_level: string;
  detail_level: string;
  notifications_enabled: boolean;
  delete_audio_after_transcription: boolean;
}

export function useSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["user_settings"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      if (data) return data as unknown as UserSettings;
      const { data: created, error: insertError } = await supabase
        .from("user_settings")
        .insert({ user_id: auth.user.id })
        .select("*")
        .single();
      if (insertError) throw insertError;
      return created as unknown as UserSettings;
    },
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<UserSettings>) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("not authenticated");
      const { error } = await supabase.from("user_settings").update(patch).eq("user_id", auth.user.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user_settings"] }),
  });

  return { settings: query.data ?? null, isLoading: query.isLoading, update };
}
