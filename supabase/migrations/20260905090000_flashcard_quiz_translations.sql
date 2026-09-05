-- Track the language flashcards/quiz were generated in, and add on-demand
-- translation support mirroring `content_translations` (sources). Filled by
-- the `translate-study` Edge Function (Gemini runs in Singapore — Laos
-- geo-block, same rationale as `translate-source`).

ALTER TABLE public.flashcards ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS language TEXT;

CREATE TABLE public.flashcard_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  flashcard_id UUID NOT NULL REFERENCES public.flashcards(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
  error_message TEXT,
  front TEXT,
  back TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (flashcard_id, language)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcard_translations TO authenticated;
GRANT ALL ON public.flashcard_translations TO service_role;
ALTER TABLE public.flashcard_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own flashcard translations" ON public.flashcard_translations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_flashcard_translations_updated BEFORE UPDATE ON public.flashcard_translations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_flashcard_translations_lookup ON public.flashcard_translations(flashcard_id, language);

CREATE TABLE public.quiz_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','failed')),
  error_message TEXT,
  questions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, language)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_translations TO authenticated;
GRANT ALL ON public.quiz_translations TO service_role;
ALTER TABLE public.quiz_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own quiz translations" ON public.quiz_translations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_quiz_translations_updated BEFORE UPDATE ON public.quiz_translations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_quiz_translations_lookup ON public.quiz_translations(quiz_id, language);
