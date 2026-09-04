-- Run this ONCE in the Supabase dashboard → SQL Editor.
-- (The MCP agent can't create pg_cron jobs / SECURITY DEFINER fns.)
--
-- It makes the analysis pipeline self-healing: every minute it nudges the
-- `process-source` Edge Function for any analysis that's stuck — a step still
-- pending, or a claim gone stale — even if the app stopped polling.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.kick_stuck_sources()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id, coalesce(language, 'same') as lang
    from public.sources
    where status = 'processing'
      and (
        progress_step in ('transcript_pending', 'notes_pending')
        or (progress_step in ('transcript_running', 'notes_running')
            and updated_at < now() - interval '4 minutes')
      )
      and created_at > now() - interval '3 hours'
  loop
    perform net.http_post(
      url     := 'https://knqcmptpejylvlnhmssx.supabase.co/functions/v1/process-source',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := jsonb_build_object('sourceId', r.id::text, 'outputLanguage', r.lang)
    );
  end loop;
end;
$$;

select cron.schedule('kick-stuck-sources', '* * * * *', $$select public.kick_stuck_sources()$$);

-- To remove later:  select cron.unschedule('kick-stuck-sources');
