-- App Store Connect and Google Play imports.
-- Only touches public.daily_metrics, public.integrations and VibeAssist's own Vault secrets
-- (names starting with app_store_secret: / google_play_secret:). Nothing in the examer schema.

alter table public.daily_metrics drop constraint daily_metrics_source_check;
alter table public.daily_metrics add constraint daily_metrics_source_check
  check (source in ('manual', 'sample', 'stripe', 'custom_api', 'app_store', 'google_play'));

alter table public.integrations drop constraint integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check
  check (provider in ('stripe', 'custom_api', 'app_store', 'google_play'));

-- Non-secret connection settings (vendor number, bucket, packages, fee rate, sync cursor).
-- Readable by the owner through the existing integrations policy; written by store-sync.
alter table public.integrations
  add column settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object');

-- Store credentials, kept encrypted in Supabase Vault ------------------------------
-- Callable only by the store-sync Edge Function (secret key / service_role).

create function public.integration_secret_name(p_provider text, p_user uuid)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_provider not in ('app_store', 'google_play') then
    raise exception 'Unknown provider %', p_provider using errcode = '22023';
  end if;
  return p_provider || '_secret:' || p_user;
end;
$$;

create function public.integration_store_secret(p_user uuid, p_provider text, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := public.integration_secret_name(p_provider, p_user);
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_secret, v_name, 'VibeAssist: ' || p_provider || ' credentials');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end;
$$;

create function public.integration_get_secret(p_user uuid, p_provider text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = public.integration_secret_name(p_provider, p_user);
$$;

create function public.integration_delete_secret(p_user uuid, p_provider text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where name = public.integration_secret_name(p_provider, p_user);
$$;

-- Replaces a store's rows for exactly the days that were fetched, in one transaction,
-- so running a sync twice gives the same result and a failed day keeps its old numbers.
create function public.replace_imported_metrics(p_user uuid, p_source text, p_days date[], p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_source not in ('app_store', 'google_play') then
    raise exception 'Unknown source %', p_source using errcode = '22023';
  end if;

  delete from public.daily_metrics
  where user_id = p_user and source = p_source and day = any (p_days);

  insert into public.daily_metrics (user_id, day, source, revenue, fees, ad_spend, organic_downloads, paid_downloads, purchases, active_users)
  select p_user, r.day, p_source, coalesce(r.revenue, 0), coalesce(r.fees, 0), 0,
         coalesce(r.organic_downloads, 0), 0, coalesce(r.purchases, 0), null
  from jsonb_to_recordset(p_rows) as r(day date, revenue numeric, fees numeric, organic_downloads integer, purchases integer)
  where r.day = any (p_days);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.integration_secret_name(text, uuid) from public, anon, authenticated;
revoke execute on function public.integration_store_secret(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.integration_get_secret(uuid, text) from public, anon, authenticated;
revoke execute on function public.integration_delete_secret(uuid, text) from public, anon, authenticated;
revoke execute on function public.replace_imported_metrics(uuid, text, date[], jsonb) from public, anon, authenticated;
grant execute on function public.integration_secret_name(text, uuid) to service_role;
grant execute on function public.integration_store_secret(uuid, text, text) to service_role;
grant execute on function public.integration_get_secret(uuid, text) to service_role;
grant execute on function public.integration_delete_secret(uuid, text) to service_role;
grant execute on function public.replace_imported_metrics(uuid, text, date[], jsonb) to service_role;

-- Rollback:
-- delete from public.daily_metrics where source in ('app_store', 'google_play');
-- delete from public.integrations where provider in ('app_store', 'google_play');
-- delete from vault.secrets where name like 'app_store_secret:%' or name like 'google_play_secret:%';
-- drop function public.replace_imported_metrics(uuid, text, date[], jsonb);
-- drop function public.integration_delete_secret(uuid, text);
-- drop function public.integration_get_secret(uuid, text);
-- drop function public.integration_store_secret(uuid, text, text);
-- drop function public.integration_secret_name(text, uuid);
-- alter table public.integrations drop column settings;
-- alter table public.integrations drop constraint integrations_provider_check;
-- alter table public.integrations add constraint integrations_provider_check check (provider in ('stripe', 'custom_api'));
-- alter table public.daily_metrics drop constraint daily_metrics_source_check;
-- alter table public.daily_metrics add constraint daily_metrics_source_check check (source in ('manual', 'sample', 'stripe', 'custom_api'));
