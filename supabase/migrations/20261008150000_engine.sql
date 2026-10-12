-- Anti-Fragile Engine: repo checks (Pre-flight, Red Team, Context & Drift), reports from the
-- VibeAssist GitHub Action (Mutation, Vision, Snapshots) and the Smart Token Gateway.
-- Only touches public.* and VibeAssist's own Vault secrets (github_token:… / gateway_key:…).
-- Nothing in the examer schema, no extensions.

-- Scoped API keys ------------------------------------------------------------------------------
-- Metrics keys (Custom API) work exactly as before. Engine keys (one per user) authenticate the
-- GitHub Action; gateway keys (up to five) authenticate apps calling the token gateway.

alter table public.api_keys
  add column scope text not null default 'metrics' check (scope in ('metrics', 'engine', 'gateway')),
  add column label text check (label is null or char_length(label) <= 60);
grant select (scope, label) on public.api_keys to authenticated;
create index api_keys_user_scope_idx on public.api_keys (user_id, scope) where revoked_at is null;

create or replace function public.create_api_key()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_key text;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public.has_premium() then
    raise exception 'The Custom API is part of Premium' using errcode = '42501';
  end if;

  update public.api_keys set revoked_at = now()
  where user_id = v_user and scope = 'metrics' and revoked_at is null;

  v_key := 'va_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.api_keys (user_id, key_hash, key_prefix, scope)
  values (v_user, extensions.digest(v_key, 'sha256'), left(v_key, 11), 'metrics');

  insert into public.integrations (user_id, provider, status, account_label, last_error, connected_at, updated_at)
  values (v_user, 'custom_api', 'connected', 'Key ' || left(v_key, 11) || '…', null, now(), now())
  on conflict (user_id, provider) do update set
    status = 'connected', account_label = excluded.account_label, last_error = null, connected_at = now(), updated_at = now();

  return v_key;
end;
$$;

create or replace function public.revoke_api_key()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  update public.api_keys set revoked_at = now()
  where user_id = v_user and scope = 'metrics' and revoked_at is null;
  update public.integrations set status = 'disconnected', account_label = null, updated_at = now()
  where user_id = v_user and provider = 'custom_api';
end;
$$;

-- Same as before, except that only metrics keys can send numbers
create or replace function public.ingest_metrics(p_api_key text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_keys;
  v_count integer;
begin
  select * into v_key from public.api_keys
  where key_hash = extensions.digest(coalesce(p_api_key, ''), 'sha256') and scope = 'metrics' and revoked_at is null;
  if v_key.id is null then
    raise exception 'Invalid or revoked API key' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.subscriptions
    where user_id = v_key.user_id and plan = 'premium' and (current_period_end is null or current_period_end > now())
  ) then
    raise exception 'The Custom API needs an active Premium plan' using errcode = '42501';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 366 then
    raise exception 'p_rows must be an array of 1 to 366 days' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) as e(r)
    where r->>'date' is null or (r->>'date')::date > current_date + 1
  ) then
    raise exception 'Every row needs a "date" that is not in the future' using errcode = '22023';
  end if;

  insert into public.daily_metrics as m (
    user_id, day, source, revenue, ad_spend, organic_downloads, paid_downloads, purchases, active_users, updated_at
  )
  select distinct on (x.day)
    v_key.user_id, x.day, 'custom_api', x.revenue, x.ad_spend, x.organic_downloads,
    x.paid_downloads, x.purchases, x.active_users, now()
  from (
    select
      (r->>'date')::date as day,
      coalesce((r->>'revenue')::numeric, 0) as revenue,
      coalesce((r->>'ad_spend')::numeric, 0) as ad_spend,
      coalesce((r->>'organic_downloads')::integer, 0) as organic_downloads,
      coalesce((r->>'paid_downloads')::integer, 0) as paid_downloads,
      coalesce((r->>'purchases')::integer, 0) as purchases,
      (r->>'active_users')::integer as active_users,
      ord
    from jsonb_array_elements(p_rows) with ordinality as e(r, ord)
  ) as x
  order by x.day, x.ord desc
  on conflict (user_id, day, source) do update set
    revenue = excluded.revenue, ad_spend = excluded.ad_spend, organic_downloads = excluded.organic_downloads,
    paid_downloads = excluded.paid_downloads, purchases = excluded.purchases, active_users = excluded.active_users,
    updated_at = now();
  get diagnostics v_count = row_count;

  update public.api_keys set last_used_at = now() where id = v_key.id;
  update public.integrations set last_synced_at = now(), last_error = null, updated_at = now()
  where user_id = v_key.user_id and provider = 'custom_api';

  return v_count;
end;
$$;

-- Creates an engine key (replacing the previous one) or a gateway key (up to five). Shown once.
create function public.create_scoped_api_key(p_scope text, p_label text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_key text;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public.has_premium() then
    raise exception 'The Anti-Fragile Engine is part of Premium' using errcode = '42501';
  end if;
  if p_scope not in ('engine', 'gateway') then
    raise exception 'Unknown key type' using errcode = '22023';
  end if;
  if p_scope = 'engine' then
    update public.api_keys set revoked_at = now() where user_id = v_user and scope = 'engine' and revoked_at is null;
  elsif (select count(*) from public.api_keys where user_id = v_user and scope = 'gateway' and revoked_at is null) >= 5 then
    raise exception 'You already have 5 gateway keys. Revoke one first.' using errcode = '54000';
  end if;

  v_key := 'va_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.api_keys (user_id, key_hash, key_prefix, scope, label)
  values (v_user, extensions.digest(v_key, 'sha256'), left(v_key, 11), p_scope, left(nullif(btrim(p_label), ''), 60));
  return v_key;
end;
$$;

create function public.revoke_scoped_api_key(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.api_keys set revoked_at = now()
  where id = p_id and user_id = auth.uid() and scope in ('engine', 'gateway') and revoked_at is null;
$$;

-- For the engine-ingest and gateway functions: who a key belongs to, if it's live and Premium
create function public.resolve_api_key(p_key text, p_scope text)
returns table (key_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    update public.api_keys k set last_used_at = now()
    where k.key_hash = extensions.digest(coalesce(p_key, ''), 'sha256') and k.scope = p_scope and k.revoked_at is null
      and exists (
        select 1 from public.subscriptions s
        where s.user_id = k.user_id and s.plan = 'premium' and (s.current_period_end is null or s.current_period_end > now())
      )
    returning k.id, k.user_id;
end;
$$;

-- GitHub connection and engine secrets ----------------------------------------------------------

alter table public.integrations drop constraint integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check
  check (provider in ('stripe', 'custom_api', 'app_store', 'google_play', 'github'));
alter table public.integrations add column expires_at timestamptz;

-- Vault secrets for the engine: a GitHub token per user, and one secret per gateway provider key
create function public.engine_secret_store(p_name text, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_name !~ '^(github_token|gateway_key):[0-9a-f-]{36}$' then
    raise exception 'Unknown secret name' using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_secret, p_name, 'VibeAssist: Anti-Fragile Engine');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
end;
$$;

create function public.engine_secret_get(p_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = p_name and p_name ~ '^(github_token|gateway_key):[0-9a-f-]{36}$';
$$;

create function public.engine_secret_delete(p_name text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where name = p_name and p_name ~ '^(github_token|gateway_key):[0-9a-f-]{36}$';
$$;

-- Engine data -------------------------------------------------------------------------------------

create table public.engine_repos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null check (full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  github_id bigint,
  default_branch text not null default 'main',
  private boolean not null default true,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, full_name)
);

create table public.engine_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  repo_id uuid not null references public.engine_repos (id) on delete cascade,
  module text not null check (module in ('red_team', 'preflight', 'drift', 'mutation', 'vision', 'snapshot')),
  trigger text not null default 'manual' check (trigger in ('manual', 'backtest', 'action')),
  target_kind text check (target_kind in ('branch', 'commit', 'pr')),
  target_ref text check (char_length(target_ref) <= 200),
  commit_sha text check (commit_sha is null or commit_sha ~ '^[0-9a-f]{7,40}$'),
  pr_number integer,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'timed_out', 'skipped')),
  outcome text check (outcome in ('pass', 'warn', 'fail')),
  summary text check (char_length(summary) <= 2000),
  stats jsonb not null default '{}'::jsonb,
  model text,
  error text check (char_length(error) <= 500),
  external_url text check (external_url is null or external_url ~ '^https://'),
  backtest_of uuid references public.engine_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index engine_runs_repo_idx on public.engine_runs (repo_id, module, created_at desc);
create index engine_runs_user_idx on public.engine_runs (user_id, created_at desc);

create table public.engine_run_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.engine_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  level text not null default 'info' check (level in ('info', 'ok', 'warn', 'error')),
  message text not null check (char_length(message) <= 300)
);
create index engine_run_events_run_idx on public.engine_run_events (run_id, id);

create table public.engine_context_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  repo_id uuid not null references public.engine_repos (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null default '' check (char_length(body) <= 1000),
  kind text not null default 'ai' check (kind in ('ai', 'forbid_pattern', 'require_pattern')),
  pattern text check (char_length(pattern) <= 300),
  paths text[] not null default '{}',
  severity text not null default 'medium' check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index engine_context_rules_repo_idx on public.engine_context_rules (repo_id);

create table public.engine_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.engine_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  repo_id uuid not null references public.engine_repos (id) on delete cascade,
  module text not null,
  rule_id uuid references public.engine_context_rules (id) on delete set null,
  severity text not null check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  category text check (char_length(category) <= 60),
  title text not null check (char_length(title) <= 200),
  file text check (char_length(file) <= 500),
  line_start integer,
  line_end integer,
  evidence text check (char_length(evidence) <= 600),
  explanation text check (char_length(explanation) <= 2000),
  fix text check (char_length(fix) <= 2000),
  confidence text not null default 'high' check (confidence in ('high', 'medium', 'low')),
  verified boolean not null default true,
  fingerprint text not null,
  status text not null default 'open' check (status in ('open', 'dismissed', 'fixed')),
  created_at timestamptz not null default now()
);
create index engine_findings_run_idx on public.engine_findings (run_id);
create index engine_findings_repo_fp_idx on public.engine_findings (repo_id, fingerprint);

create table public.engine_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  repo_id uuid not null references public.engine_repos (id) on delete cascade,
  tag text not null check (tag ~ '^vibe-snapshot-[A-Za-z0-9._-]+$'),
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{7,40}$'),
  branch text,
  run_url text check (run_url is null or run_url ~ '^https://'),
  checks jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (repo_id, tag)
);

-- Smart Token Gateway ------------------------------------------------------------------------------

create table public.gateway_provider_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('anthropic', 'openai', 'openrouter', 'groq', 'gemini', 'mistral', 'deepseek')),
  label text check (char_length(label) <= 60),
  key_prefix text not null,
  last_used_at timestamptz,
  last_error text check (char_length(last_error) <= 300),
  created_at timestamptz not null default now()
);

create table public.gateway_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  alias text not null check (alias ~ '^[a-z0-9][a-z0-9._-]{0,39}$'),
  api_format text not null check (api_format in ('openai', 'anthropic')),
  targets jsonb not null check (jsonb_typeof(targets) = 'array' and jsonb_array_length(targets) between 1 and 4),
  timeout_ms integer not null default 60000 check (timeout_ms between 5000 and 120000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, alias)
);

create table public.gateway_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  api_key_id uuid,
  route_alias text,
  provider text,
  model text,
  status integer,
  attempts smallint not null default 1,
  fallback_used boolean not null default false,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  streamed boolean not null default false,
  error text check (char_length(error) <= 300),
  created_at timestamptz not null default now()
);
create index gateway_usage_user_idx on public.gateway_usage (user_id, created_at desc);

-- Engine runs share the AI request pool with the advisor, but are counted separately too
alter table public.ai_usage add column feature text not null default 'advisor' check (feature in ('advisor', 'engine'));

-- Starts a gateway request: checks the key, Premium and the rate limits (60 a minute, 5,000 a day)
create function public.gateway_begin(p_key text)
returns table (key_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key_id uuid;
  v_user uuid;
begin
  select r.key_id, r.user_id into v_key_id, v_user from public.resolve_api_key(p_key, 'gateway') r;
  if v_user is null then
    raise exception 'invalid_key' using errcode = '28000';
  end if;
  if (select count(*) from public.gateway_usage g where g.user_id = v_user and g.created_at > now() - interval '1 minute') >= 60 then
    raise exception 'rate_limited_minute' using errcode = '54000';
  end if;
  if (select count(*) from public.gateway_usage g where g.user_id = v_user and g.created_at > now() - interval '1 day') >= 5000 then
    raise exception 'rate_limited_day' using errcode = '54000';
  end if;
  return query select v_key_id, v_user;
end;
$$;

-- Keeps the engine's history small: logs and gateway usage for 30 days, runs for 180
create function public.engine_prune()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.engine_run_events where at < now() - interval '30 days';
  delete from public.gateway_usage where created_at < now() - interval '30 days';
  delete from public.engine_runs where created_at < now() - interval '180 days';
$$;

-- Row level security: users read their own rows; rules and routes are theirs to edit while they
-- have Premium; findings can only be dismissed or reopened; everything else is written by the
-- engine functions with the service role.

alter table public.engine_repos enable row level security;
alter table public.engine_runs enable row level security;
alter table public.engine_run_events enable row level security;
alter table public.engine_context_rules enable row level security;
alter table public.engine_findings enable row level security;
alter table public.engine_snapshots enable row level security;
alter table public.gateway_provider_keys enable row level security;
alter table public.gateway_routes enable row level security;
alter table public.gateway_usage enable row level security;

create policy "Users read their own repos" on public.engine_repos for select to authenticated using (user_id = (select auth.uid()));
create policy "Users remove their own repos" on public.engine_repos for delete to authenticated using (user_id = (select auth.uid()));
create policy "Users read their own runs" on public.engine_runs for select to authenticated using (user_id = (select auth.uid()));
create policy "Users read their own run logs" on public.engine_run_events for select to authenticated using (user_id = (select auth.uid()));
create policy "Users read their own snapshots" on public.engine_snapshots for select to authenticated using (user_id = (select auth.uid()));
create policy "Users read their own provider keys" on public.gateway_provider_keys for select to authenticated using (user_id = (select auth.uid()));
create policy "Users read their own gateway usage" on public.gateway_usage for select to authenticated using (user_id = (select auth.uid()));

create policy "Users read their own findings" on public.engine_findings for select to authenticated using (user_id = (select auth.uid()));
create policy "Users triage their own findings" on public.engine_findings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.engine_findings from anon, authenticated;
grant update (status) on public.engine_findings to authenticated;

create policy "Users read their own rules" on public.engine_context_rules for select to authenticated using (user_id = (select auth.uid()));
create policy "Premium users add rules" on public.engine_context_rules for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_premium())
    and exists (select 1 from public.engine_repos r where r.id = repo_id and r.user_id = (select auth.uid())));
create policy "Premium users edit rules" on public.engine_context_rules for update to authenticated
  using (user_id = (select auth.uid()) and (select public.has_premium())) with check (user_id = (select auth.uid()));
create policy "Users delete their own rules" on public.engine_context_rules for delete to authenticated using (user_id = (select auth.uid()));

create policy "Users read their own routes" on public.gateway_routes for select to authenticated using (user_id = (select auth.uid()));
create policy "Premium users add routes" on public.gateway_routes for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_premium()));
create policy "Premium users edit routes" on public.gateway_routes for update to authenticated
  using (user_id = (select auth.uid()) and (select public.has_premium())) with check (user_id = (select auth.uid()));
create policy "Users delete their own routes" on public.gateway_routes for delete to authenticated using (user_id = (select auth.uid()));

create trigger engine_context_rules_touch_updated_at before update on public.engine_context_rules
  for each row execute function public.touch_updated_at();
create trigger gateway_routes_touch_updated_at before update on public.gateway_routes
  for each row execute function public.touch_updated_at();

revoke execute on function public.create_scoped_api_key(text, text) from public, anon;
revoke execute on function public.revoke_scoped_api_key(uuid) from public, anon;
revoke execute on function public.resolve_api_key(text, text) from public, anon, authenticated;
revoke execute on function public.engine_secret_store(text, text) from public, anon, authenticated;
revoke execute on function public.engine_secret_get(text) from public, anon, authenticated;
revoke execute on function public.engine_secret_delete(text) from public, anon, authenticated;
revoke execute on function public.gateway_begin(text) from public, anon, authenticated;
revoke execute on function public.engine_prune() from public, anon, authenticated;
grant execute on function public.create_scoped_api_key(text, text) to authenticated;
grant execute on function public.revoke_scoped_api_key(uuid) to authenticated;
grant execute on function public.resolve_api_key(text, text) to service_role;
grant execute on function public.engine_secret_store(text, text) to service_role;
grant execute on function public.engine_secret_get(text) to service_role;
grant execute on function public.engine_secret_delete(text) to service_role;
grant execute on function public.gateway_begin(text) to service_role;
grant execute on function public.engine_prune() to service_role;

-- Rollback:
-- drop function public.engine_prune(); drop function public.gateway_begin(text);
-- drop table public.gateway_usage, public.gateway_routes, public.gateway_provider_keys;
-- drop table public.engine_snapshots, public.engine_findings, public.engine_context_rules, public.engine_run_events, public.engine_runs, public.engine_repos;
-- drop function public.engine_secret_delete(text), public.engine_secret_get(text), public.engine_secret_store(text, text);
-- delete from vault.secrets where name like 'github_token:%' or name like 'gateway_key:%';
-- alter table public.integrations drop column expires_at; (and restore integrations_provider_check without 'github')
-- drop function public.resolve_api_key(text, text), public.revoke_scoped_api_key(uuid), public.create_scoped_api_key(text, text);
-- alter table public.ai_usage drop column feature;
-- delete from public.api_keys where scope <> 'metrics'; alter table public.api_keys drop column label, drop column scope;
-- (then re-apply create_api_key / revoke_api_key / ingest_metrics from 20261003090000_stripe_billing.sql)
