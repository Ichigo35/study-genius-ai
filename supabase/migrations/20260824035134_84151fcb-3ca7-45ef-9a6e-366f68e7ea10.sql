
-- helpers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- user settings
CREATE TABLE public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  ui_language TEXT NOT NULL DEFAULT 'fr',
  ai_output_language TEXT NOT NULL DEFAULT 'same',
  study_level TEXT NOT NULL DEFAULT 'university',
  detail_level TEXT NOT NULL DEFAULT 'standard',
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  delete_audio_after_transcription BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.user_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- new user hook
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- study spaces
CREATE TABLE public.study_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  emoji TEXT NOT NULL DEFAULT '📘',
  color TEXT NOT NULL DEFAULT 'indigo',
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_spaces TO authenticated;
GRANT ALL ON public.study_spaces TO service_role;
ALTER TABLE public.study_spaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own spaces" ON public.study_spaces FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_spaces_updated BEFORE UPDATE ON public.study_spaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_spaces_user ON public.study_spaces(user_id, last_activity_at DESC);

-- sources
CREATE TABLE public.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES public.study_spaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('audio','recording','youtube','text','pdf','image')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  progress_step TEXT,
  error_message TEXT,
  language TEXT,
  duration_seconds INTEGER,
  original_url TEXT,
  storage_path TEXT,
  raw_text TEXT,
  detail_level TEXT NOT NULL DEFAULT 'standard',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sources TO authenticated;
GRANT ALL ON public.sources TO service_role;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sources" ON public.sources FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_sources_updated BEFORE UPDATE ON public.sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_sources_space ON public.sources(space_id, created_at DESC);

-- transcripts
CREATE TABLE public.transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  full_text TEXT NOT NULL DEFAULT '',
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  language TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcripts TO authenticated;
GRANT ALL ON public.transcripts TO service_role;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own transcripts" ON public.transcripts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_transcripts_source ON public.transcripts(source_id);

-- study notes
CREATE TABLE public.study_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES public.study_spaces(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  detail_level TEXT NOT NULL DEFAULT 'standard',
  language TEXT,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_notes TO authenticated;
GRANT ALL ON public.study_notes TO service_role;
ALTER TABLE public.study_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notes" ON public.study_notes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_notes_updated BEFORE UPDATE ON public.study_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_notes_space ON public.study_notes(space_id, created_at DESC);

-- flashcards
CREATE TABLE public.flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES public.study_spaces(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  difficulty TEXT,
  ease_factor NUMERIC NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.flashcards TO authenticated;
GRANT ALL ON public.flashcards TO service_role;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own flashcards" ON public.flashcards FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_flashcards_updated BEFORE UPDATE ON public.flashcards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_flashcards_due ON public.flashcards(user_id, due_at);

-- quizzes
CREATE TABLE public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES public.study_spaces(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  question_count INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated;
GRANT ALL ON public.quizzes TO service_role;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own quizzes" ON public.quizzes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'mcq',
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer TEXT NOT NULL,
  explanation TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own quiz questions" ON public.quiz_questions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_qq_quiz ON public.quiz_questions(quiz_id, position);

CREATE TABLE public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quiz_attempts TO authenticated;
GRANT ALL ON public.quiz_attempts TO service_role;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own attempts" ON public.quiz_attempts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- chat
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES public.study_spaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own chat" ON public.chat_messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_chat_space ON public.chat_messages(space_id, created_at);

-- study sessions
CREATE TABLE public.study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  space_id UUID REFERENCES public.study_spaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'flashcards',
  cards_reviewed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_sessions TO authenticated;
GRANT ALL ON public.study_sessions TO service_role;
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions" ON public.study_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- configurable quotas (server-side config)
CREATE TABLE public.usage_limits (
  plan TEXT PRIMARY KEY,
  daily_analyses INTEGER NOT NULL DEFAULT 10,
  daily_audio_minutes INTEGER NOT NULL DEFAULT 60,
  daily_videos INTEGER NOT NULL DEFAULT 5,
  daily_quizzes INTEGER NOT NULL DEFAULT 10,
  daily_chat_messages INTEGER NOT NULL DEFAULT 50,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.usage_limits TO authenticated;
GRANT ALL ON public.usage_limits TO service_role;
ALTER TABLE public.usage_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read limits" ON public.usage_limits FOR SELECT TO authenticated USING (true);
INSERT INTO public.usage_limits (plan) VALUES ('free');

CREATE TABLE public.usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 1,
  day DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.usage_events TO authenticated;
GRANT ALL ON public.usage_events TO service_role;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own usage" ON public.usage_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "insert own usage" ON public.usage_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_usage_day ON public.usage_events(user_id, day, kind);
