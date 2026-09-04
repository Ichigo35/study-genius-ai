-- On-demand translations of a source's study note / transcript into other
-- languages. One row per (source_id, kind, language). Filled by the
-- `translate-source` Edge Function (Gemini runs in Singapore — Laos geo-block).
CREATE TABLE public.content_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('note','transcript')),
  language TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
  error_message TEXT,
  content JSONB,
  text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, kind, language)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_translations TO authenticated;
GRANT ALL ON public.content_translations TO service_role;
ALTER TABLE public.content_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own translations" ON public.content_translations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_content_translations_updated BEFORE UPDATE ON public.content_translations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_content_translations_lookup ON public.content_translations(source_id, language);
