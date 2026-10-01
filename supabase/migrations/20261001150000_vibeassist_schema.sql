-- VibeAssist schema.
-- Lives in `public`, next to EXAMassist's separate `examer` schema (untouched).
-- Every table belongs to one user and is protected by row level security (RLS).
-- Answer lists below must stay in sync with src/lib/options.js.

-- Shared helpers ---------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profiles: onboarding answers, one row per user --------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text check (char_length(name) <= 80),
  age smallint check (age between 13 and 120),
  goals text[] not null default '{}' check (goals <@ array[
    'Build a SaaS Empire', 'Develop Viral Mobile Games', 'Generate Passive Income',
    'Automate Workflows with AI', 'Freelance App Development', 'Sell Micro-tools'
  ]::text[]),
  experience text not null default 'Beginner'
    check (experience in ('Beginner', 'Intermediate', 'Pro')),
  profit_expectancy text not null default '$0 - $1,000'
    check (profit_expectancy in ('$0 - $1,000', '$1,000 - $10,000', '$10k - $50k', '$50k+')),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users read their own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Users update their own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Subscriptions: the user's plan ------------------------------------------------
-- Clients can read their row but never write it. It changes only through
-- choose_plan() below (or, later, a Stripe webhook using the secret key).

create table public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  billing_cycle text check (billing_cycle in ('monthly', 'yearly', 'promo')),
  source text not null default 'demo' check (source in ('demo', 'stripe')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Users read their own subscription" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- Demo checkout: switches the caller's plan without taking a payment. Replace
-- with Stripe Checkout + a webhook before charging real money. Never overwrites
-- a subscription that came from Stripe.
create function public.choose_plan(p_plan text, p_billing_cycle text default 'monthly')
returns public.subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_row public.subscriptions;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_plan is null or p_plan not in ('free', 'premium') then
    raise exception 'Unknown plan %', p_plan using errcode = '22023';
  end if;
  if p_plan = 'premium' and (p_billing_cycle is null or p_billing_cycle not in ('monthly', 'yearly', 'promo')) then
    raise exception 'Unknown billing cycle %', p_billing_cycle using errcode = '22023';
  end if;

  insert into public.subscriptions as s (user_id, plan, billing_cycle, source, current_period_end, updated_at)
  values (
    v_user,
    p_plan,
    case when p_plan = 'premium' then p_billing_cycle end,
    'demo',
    case when p_plan = 'premium' then now() + case p_billing_cycle
      when 'yearly' then interval '1 year'
      when 'promo' then interval '2 months'
      else interval '1 month'
    end end,
    now()
  )
  on conflict (user_id) do update set
    plan = excluded.plan,
    billing_cycle = excluded.billing_cycle,
    source = excluded.source,
    current_period_end = excluded.current_period_end,
    updated_at = now()
  where s.source = 'demo'
  returning * into v_row;

  if v_row.user_id is null then
    select * into v_row from public.subscriptions where user_id = v_user;
  end if;
  return v_row;
end;
$$;

-- Daily metrics: one row per user, day and data source -----------------------
-- Clients may write only their own 'manual' and 'sample' rows. 'stripe' and
-- 'custom_api' rows are written by the stripe-sync function and ingest_metrics().

create table public.daily_metrics (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null check (day between date '2000-01-01' and date '2100-01-01'),
  source text not null check (source in ('manual', 'sample', 'stripe', 'custom_api')),
  revenue numeric(14, 2) not null default 0,
  fees numeric(14, 2) not null default 0,
  ad_spend numeric(14, 2) not null default 0 check (ad_spend >= 0),
  organic_downloads integer not null default 0 check (organic_downloads >= 0),
  paid_downloads integer not null default 0 check (paid_downloads >= 0),
  purchases integer not null default 0 check (purchases >= 0),
  active_users integer check (active_users >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day, source)
);

alter table public.daily_metrics enable row level security;

create policy "Users read their own metrics" on public.daily_metrics
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users add their own manual or sample metrics" on public.daily_metrics
  for insert to authenticated
  with check (user_id = (select auth.uid()) and source in ('manual', 'sample'));
create policy "Users edit their own manual or sample metrics" on public.daily_metrics
  for update to authenticated
  using (user_id = (select auth.uid()) and source in ('manual', 'sample'))
  with check (user_id = (select auth.uid()) and source in ('manual', 'sample'));
create policy "Users delete their own metrics" on public.daily_metrics
  for delete to authenticated using (user_id = (select auth.uid()));

create trigger daily_metrics_touch_updated_at before update on public.daily_metrics
  for each row execute function public.touch_updated_at();

-- Ad campaigns: tracked by hand in the Ad Manager -------------------------------

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  network text not null check (network in ('meta', 'google', 'youtube', 'tiktok', 'x', 'apple_search')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  spend numeric(14, 2) not null default 0 check (spend >= 0),
  revenue numeric(14, 2) not null default 0 check (revenue >= 0),
  installs integer not null default 0 check (installs >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ad_campaigns_user_id_idx on public.ad_campaigns (user_id, created_at);

alter table public.ad_campaigns enable row level security;

create policy "Users read their own campaigns" on public.ad_campaigns
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users add their own campaigns" on public.ad_campaigns
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users edit their own campaigns" on public.ad_campaigns
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete their own campaigns" on public.ad_campaigns
  for delete to authenticated using (user_id = (select auth.uid()));

create trigger ad_campaigns_touch_updated_at before update on public.ad_campaigns
  for each row execute function public.touch_updated_at();

-- Integrations: connection status per data source ------------------------------
-- Read-only for clients; written by the functions that actually connect.

create table public.integrations (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('stripe', 'custom_api')),
  status text not null default 'disconnected' check (status in ('connected', 'error', 'disconnected')),
  account_label text,
  last_error text,
  connected_at timestamptz,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.integrations enable row level security;

create policy "Users read their own integrations" on public.integrations
  for select to authenticated using (user_id = (select auth.uid()));

-- API keys for the Custom API ---------------------------------------------------
-- Only a SHA-256 hash is stored; the key itself is shown once when created.

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key_hash bytea not null unique,
  key_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index api_keys_user_id_idx on public.api_keys (user_id);

alter table public.api_keys enable row level security;

create policy "Users read their own API keys" on public.api_keys
  for select to authenticated using (user_id = (select auth.uid()));

-- The hash never leaves the database, even to its owner
revoke select on public.api_keys from anon, authenticated;
grant select (id, user_id, key_prefix, created_at, last_used_at, revoked_at) on public.api_keys to authenticated;

-- Creates a new key (revoking any previous one) and returns it. This is the
-- only time the full key is visible.
create function public.create_api_key()
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

  update public.api_keys set revoked_at = now()
  where user_id = v_user and revoked_at is null;

  v_key := 'va_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.api_keys (user_id, key_hash, key_prefix)
  values (v_user, extensions.digest(v_key, 'sha256'), left(v_key, 11));

  insert into public.integrations (user_id, provider, status, account_label, last_error, connected_at, updated_at)
  values (v_user, 'custom_api', 'connected', 'Key ' || left(v_key, 11) || '…', null, now(), now())
  on conflict (user_id, provider) do update set
    status = 'connected',
    account_label = excluded.account_label,
    last_error = null,
    connected_at = now(),
    updated_at = now();

  return v_key;
end;
$$;

create function public.revoke_api_key()
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
  where user_id = v_user and revoked_at is null;

  update public.integrations set status = 'disconnected', account_label = null, updated_at = now()
  where user_id = v_user and provider = 'custom_api';
end;
$$;

-- Public endpoint for the user's own apps:
--   POST /rest/v1/rpc/ingest_metrics  {"p_api_key": "va_…", "p_rows": [{"date": "2026-10-01", "revenue": 120.5, ...}]}
-- Each day replaces the previous Custom API values for that day.
create function public.ingest_metrics(p_api_key text, p_rows jsonb)
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
  where key_hash = extensions.digest(coalesce(p_api_key, ''), 'sha256') and revoked_at is null;
  if v_key.id is null then
    raise exception 'Invalid or revoked API key' using errcode = '28000';
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
  -- If a day appears twice in one request, the last occurrence wins
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
    revenue = excluded.revenue,
    ad_spend = excluded.ad_spend,
    organic_downloads = excluded.organic_downloads,
    paid_downloads = excluded.paid_downloads,
    purchases = excluded.purchases,
    active_users = excluded.active_users,
    updated_at = now();
  get diagnostics v_count = row_count;

  update public.api_keys set last_used_at = now() where id = v_key.id;
  update public.integrations set last_synced_at = now(), last_error = null, updated_at = now()
  where user_id = v_key.user_id and provider = 'custom_api';

  return v_count;
end;
$$;

-- Stripe keys: stored encrypted in Supabase Vault ------------------------------
-- Callable only by the stripe-sync Edge Function (secret key / service_role).

create function public.stripe_store_key(p_user uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'stripe_key:' || p_user;
  if v_id is null then
    perform vault.create_secret(p_key, 'stripe_key:' || p_user, 'VibeAssist: Stripe restricted key');
  else
    perform vault.update_secret(v_id, p_key);
  end if;
end;
$$;

create function public.stripe_get_key(p_user uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'stripe_key:' || p_user;
$$;

create function public.stripe_delete_key(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where name = 'stripe_key:' || p_user;
$$;

-- AI advisor usage: used for the daily request cap ------------------------------

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;

create policy "Users read their own AI usage" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

-- New users: create profile + free plan from the sign-up form ------------------
-- Every value is sanitised, so a bad answer can never block a sign-up.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_age smallint;
  v_goals text[];
begin
  begin
    v_age := nullif(v_meta->>'age', '')::smallint;
    if v_age not between 13 and 120 then
      v_age := null;
    end if;
  exception when others then
    v_age := null;
  end;

  select coalesce(array_agg(distinct g), '{}') into v_goals
  from jsonb_array_elements_text(
    case when jsonb_typeof(v_meta->'goals') = 'array' then v_meta->'goals' else '[]'::jsonb end
  ) as g
  where g = any (array[
    'Build a SaaS Empire', 'Develop Viral Mobile Games', 'Generate Passive Income',
    'Automate Workflows with AI', 'Freelance App Development', 'Sell Micro-tools'
  ]);

  insert into public.profiles (id, name, age, goals, experience, profit_expectancy)
  values (
    new.id,
    left(nullif(btrim(v_meta->>'name'), ''), 80),
    v_age,
    v_goals,
    case when v_meta->>'experience' in ('Beginner', 'Intermediate', 'Pro')
      then v_meta->>'experience' else 'Beginner' end,
    case when v_meta->>'profit_expectancy' in ('$0 - $1,000', '$1,000 - $10,000', '$10k - $50k', '$50k+')
      then v_meta->>'profit_expectancy' else '$0 - $1,000' end
  );

  insert into public.subscriptions (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Function permissions -------------------------------------------------------------
-- Supabase grants EXECUTE on new functions to everyone by default; narrow it.

revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.choose_plan(text, text) from public, anon;
revoke execute on function public.create_api_key() from public, anon;
revoke execute on function public.revoke_api_key() from public, anon;
grant execute on function public.choose_plan(text, text) to authenticated;
grant execute on function public.create_api_key() to authenticated;
grant execute on function public.revoke_api_key() to authenticated;

-- Called by the user's own apps with their VibeAssist API key, so anon may call it
revoke execute on function public.ingest_metrics(text, jsonb) from public;
grant execute on function public.ingest_metrics(text, jsonb) to anon, authenticated;

revoke execute on function public.stripe_store_key(uuid, text) from public, anon, authenticated;
revoke execute on function public.stripe_get_key(uuid) from public, anon, authenticated;
revoke execute on function public.stripe_delete_key(uuid) from public, anon, authenticated;
grant execute on function public.stripe_store_key(uuid, text) to service_role;
grant execute on function public.stripe_get_key(uuid) to service_role;
grant execute on function public.stripe_delete_key(uuid) to service_role;
