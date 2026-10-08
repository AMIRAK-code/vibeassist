-- News & Newsletter: a shared cache for the community and AI news feeds, and the Weekly Vibe
-- email (double opt-in subscribers, one issue per week, one send row per subscriber).
-- Only touches public.*; nothing in the examer schema. The Monday schedule lives in a separate
-- migration because it needs the project-wide pg_cron and pg_net extensions.

-- Feed cache ---------------------------------------------------------------------------------
-- One row per feed, refreshed at most every 30 minutes and shared by every user.
-- Read and written only by Edge Functions (no policies).

create table public.feed_cache (
  feed text primary key check (feed in ('threads', 'ai_news')),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  sources jsonb not null default '{}'::jsonb,
  fetched_at timestamptz,
  refreshing_until timestamptz
);

alter table public.feed_cache enable row level security;

-- True for exactly one caller when the feed is due for a refresh
create function public.claim_feed_refresh(p_feed text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  insert into public.feed_cache (feed) values (p_feed) on conflict (feed) do nothing;
  update public.feed_cache
  set refreshing_until = now() + interval '2 minutes'
  where feed = p_feed
    and (fetched_at is null or fetched_at < now() - interval '30 minutes')
    and (refreshing_until is null or refreshing_until < now())
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

-- Subscribers ----------------------------------------------------------------------------------
-- Signed-in users only for now; the email always goes to the account's current address.

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed', 'bounced', 'complained')),
  include_numbers boolean not null default true,
  confirm_token_hash text,
  confirm_sent_at timestamptz,
  consent_text text not null check (char_length(consent_text) <= 500),
  requested_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  updated_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;

create policy "Users read their own subscription" on public.newsletter_subscribers
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users change their own subscription settings" on public.newsletter_subscribers
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Users only choose whether their numbers are included; status changes go through the
-- newsletter function (confirm links) or newsletter_unsubscribe()
revoke update on public.newsletter_subscribers from anon, authenticated;
grant update (include_numbers) on public.newsletter_subscribers to authenticated;
-- The confirm token's hash is never readable from the browser
revoke select on public.newsletter_subscribers from anon, authenticated;
grant select (id, user_id, status, include_numbers, confirm_sent_at, requested_at, confirmed_at, unsubscribed_at, updated_at)
  on public.newsletter_subscribers to authenticated;

create trigger newsletter_subscribers_touch_updated_at before update on public.newsletter_subscribers
  for each row execute function public.touch_updated_at();

create function public.newsletter_unsubscribe()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.newsletter_subscribers
  set status = 'unsubscribed', unsubscribed_at = now(), confirm_token_hash = null
  where user_id = auth.uid() and status in ('pending', 'active');
$$;

-- Issues and sends -------------------------------------------------------------------------------
-- Written only by the weekly-digest function. One issue per week (unique), one send per
-- subscriber per issue (primary key), so a repeated run can never email someone twice.

create table public.newsletter_issues (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  content jsonb not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  sent integer not null default 0,
  failed integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.newsletter_sends (
  issue_id uuid not null references public.newsletter_issues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  batch_key uuid,
  attempts smallint not null default 0,
  resend_id text,
  error text,
  updated_at timestamptz not null default now(),
  primary key (issue_id, user_id)
);

create index newsletter_sends_batch_idx on public.newsletter_sends (issue_id, batch_key);

alter table public.newsletter_issues enable row level security;
alter table public.newsletter_sends enable row level security;

-- A subscriber's own numbers for the week before p_week_start (Monday to Sunday) and the week
-- before that, leaving out sample data. Revenue minus fees and ad spend is profit.
create function public.newsletter_numbers(p_user uuid, p_week_start date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'currency', coalesce((select currency from public.profiles where id = p_user), 'USD'),
    'current', (
      select jsonb_build_object(
        'revenue', coalesce(sum(revenue), 0), 'fees', coalesce(sum(fees), 0), 'ad_spend', coalesce(sum(ad_spend), 0),
        'downloads', coalesce(sum(organic_downloads + paid_downloads), 0), 'days', count(distinct day))
      from public.daily_metrics
      where user_id = p_user and source <> 'sample' and day between p_week_start - 7 and p_week_start - 1),
    'previous', (
      select jsonb_build_object(
        'revenue', coalesce(sum(revenue), 0), 'fees', coalesce(sum(fees), 0), 'ad_spend', coalesce(sum(ad_spend), 0),
        'downloads', coalesce(sum(organic_downloads + paid_downloads), 0), 'days', count(distinct day))
      from public.daily_metrics
      where user_id = p_user and source <> 'sample' and day between p_week_start - 14 and p_week_start - 8)
  );
$$;

-- Creates this week's issue (once) and queues every active subscriber (once), snapshotting
-- their numbers and unsubscribe link so a retry sends exactly the same email.
create function public.newsletter_enqueue(p_week_start date, p_content jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issue uuid;
begin
  insert into public.newsletter_issues (week_start, content) values (p_week_start, p_content)
  on conflict (week_start) do nothing;
  select id into v_issue from public.newsletter_issues where week_start = p_week_start;

  insert into public.newsletter_sends (issue_id, user_id, email, payload)
  select v_issue, s.user_id, u.email,
    jsonb_build_object(
      'include_numbers', s.include_numbers,
      'unsubscribe_token', s.unsubscribe_token,
      'name', p.name
    ) || case when s.include_numbers then public.newsletter_numbers(s.user_id, p_week_start) else '{}'::jsonb end
  from public.newsletter_subscribers s
  join auth.users u on u.id = s.user_id
  left join public.profiles p on p.id = s.user_id
  where s.status = 'active' and u.email is not null
  on conflict (issue_id, user_id) do nothing;

  return v_issue;
end;
$$;

-- Hands out the next batch to send. A batch that went to Resend but was never confirmed goes
-- again with the same key, so Resend's idempotency stops it arriving twice.
create function public.newsletter_claim(p_issue uuid, p_limit integer)
returns setof public.newsletter_sends
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key uuid;
begin
  select batch_key into v_key
  from public.newsletter_sends
  where issue_id = p_issue and status = 'sending' and batch_key is not null and updated_at < now() - interval '15 minutes'
  limit 1;
  if v_key is not null then
    return query
      update public.newsletter_sends set attempts = attempts + 1, updated_at = now()
      where issue_id = p_issue and batch_key = v_key
      returning *;
    return;
  end if;

  v_key := gen_random_uuid();
  return query
    update public.newsletter_sends s
    set status = 'sending', batch_key = v_key, attempts = s.attempts + 1, updated_at = now()
    from (
      select issue_id, user_id from public.newsletter_sends
      where issue_id = p_issue and (status = 'queued' or (status = 'failed' and attempts < 3))
      order by user_id
      limit p_limit
      for update skip locked
    ) picked
    where s.issue_id = picked.issue_id and s.user_id = picked.user_id
    returning s.*;
end;
$$;

revoke execute on function public.claim_feed_refresh(text) from public, anon, authenticated;
revoke execute on function public.newsletter_numbers(uuid, date) from public, anon, authenticated;
revoke execute on function public.newsletter_enqueue(date, jsonb) from public, anon, authenticated;
revoke execute on function public.newsletter_claim(uuid, integer) from public, anon, authenticated;
revoke execute on function public.newsletter_unsubscribe() from public, anon;
grant execute on function public.claim_feed_refresh(text) to service_role;
grant execute on function public.newsletter_numbers(uuid, date) to service_role;
grant execute on function public.newsletter_enqueue(date, jsonb) to service_role;
grant execute on function public.newsletter_claim(uuid, integer) to service_role;
grant execute on function public.newsletter_unsubscribe() to authenticated;

-- Rollback:
-- drop function public.newsletter_claim(uuid, integer);
-- drop function public.newsletter_enqueue(date, jsonb);
-- drop function public.newsletter_numbers(uuid, date);
-- drop function public.newsletter_unsubscribe();
-- drop function public.claim_feed_refresh(text);
-- drop table public.newsletter_sends;
-- drop table public.newsletter_issues;
-- drop table public.newsletter_subscribers;
-- drop table public.feed_cache;
