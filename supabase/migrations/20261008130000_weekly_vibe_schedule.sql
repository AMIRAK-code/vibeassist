-- Sends the Weekly Vibe on Monday mornings.
--
-- PROJECT-WIDE CHANGE: this turns on the pg_cron and pg_net extensions for the whole Supabase
-- project, which VibeAssist shares with EXAMassist. They add the cron and net schemas and a
-- background worker; nothing in the examer schema is touched. The job name is prefixed
-- vibeassist- so it can't clash with anything else.
--
-- Before applying, let the database make the shared secret once (so it never lands in git or a
-- chat), then copy it into the weekly-digest function's CRON_SECRET:
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'vibeassist_cron_secret', 'VibeAssist: weekly digest cron');
--   select decrypted_secret from vault.decrypted_secrets where name = 'vibeassist_cron_secret';

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Every 10 minutes from 08:00 to 11:50 UTC on Mondays (09:00–12:50 in Rome in winter).
-- The first run creates the issue and sends; later runs finish a long list or retry failures.
-- The unique issue and send rows mean a repeated run never emails anyone twice.
select cron.schedule(
  'vibeassist-weekly-vibe',
  '*/10 8-11 * * 1',
  $$
  select net.http_post(
    url := 'https://thwxxgibcbxkfodzoedb.supabase.co/functions/v1/weekly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'vibeassist_cron_secret')
    ),
    body := '{"action": "run"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Rollback:
-- select cron.unschedule('vibeassist-weekly-vibe');
-- (Leave the extensions on if anything else in the project uses them.)
