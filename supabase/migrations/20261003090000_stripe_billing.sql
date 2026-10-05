-- Real billing: Premium is bought through Stripe Checkout and kept up to date by the
-- billing and stripe-webhook Edge Functions (service role). Clients can no longer grant
-- themselves Premium, and Premium features are enforced in the database too.

alter table public.subscriptions
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text,
  add column status text,
  add column cancel_at_period_end boolean not null default false;

comment on column public.subscriptions.status is 'Stripe subscription status (active, trialing, past_due, canceled, …); null for demo plans';

-- True when the signed-in user has Premium right now
create function public.has_premium()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = (select auth.uid())
      and plan = 'premium'
      and (current_period_end is null or current_period_end > now())
  );
$$;

revoke execute on function public.has_premium() from public, anon;
grant execute on function public.has_premium() to authenticated;

-- choose_plan() used to switch anyone to Premium for free. Now it can only turn a leftover
-- demo plan off; Premium comes from Stripe.
create or replace function public.choose_plan(p_plan text, p_billing_cycle text default 'monthly')
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
  if p_plan is distinct from 'free' then
    raise exception 'Premium is bought through checkout' using errcode = '42501';
  end if;

  update public.subscriptions
  set plan = 'free', billing_cycle = null, current_period_end = null, updated_at = now()
  where user_id = v_user and source = 'demo'
  returning * into v_row;

  if v_row.user_id is null then
    select * into v_row from public.subscriptions where user_id = v_user;
  end if;
  return v_row;
end;
$$;

-- Campaigns are a Premium feature: anyone can read or delete their own, only Premium can
-- add or change them
drop policy "Users add their own campaigns" on public.ad_campaigns;
drop policy "Users edit their own campaigns" on public.ad_campaigns;

create policy "Premium users add their own campaigns" on public.ad_campaigns
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.has_premium()));
create policy "Premium users edit their own campaigns" on public.ad_campaigns
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.has_premium()))
  with check (user_id = (select auth.uid()));

-- The Custom API is a Premium feature: creating a key needs Premium
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

-- …and sending data with a key needs the key owner to still have Premium
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
  where key_hash = extensions.digest(coalesce(p_api_key, ''), 'sha256') and revoked_at is null;
  if v_key.id is null then
    raise exception 'Invalid or revoked API key' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.subscriptions
    where user_id = v_key.user_id
      and plan = 'premium'
      and (current_period_end is null or current_period_end > now())
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
