-- The weekly-digest function checks the Monday job's x-cron-secret against Vault directly, so the
-- secret lives in one place and never has to be copied into the function's settings.
-- Only the service role (the Edge Functions) can read it.

create function public.newsletter_cron_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vibeassist_cron_secret';
$$;

revoke execute on function public.newsletter_cron_secret() from public, anon, authenticated;
grant execute on function public.newsletter_cron_secret() to service_role;

-- Rollback:
-- drop function public.newsletter_cron_secret();
