-- The "Limited Time Offer": a one-time $12.99 payment for 60 days of Premium, once per account,
-- with no renewal. Only touches public.subscriptions and public.premium_passes.

alter table public.subscriptions drop constraint subscriptions_source_check;
alter table public.subscriptions add constraint subscriptions_source_check
  check (source in ('demo', 'stripe', 'admin', 'pass'));

create table public.premium_passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  checkout_session_id text not null unique,
  payment_intent_id text unique,
  amount_total integer,
  currency text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'open' check (status in ('open', 'paid', 'expired', 'refunded', 'refunded_ineligible')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One pass per account, ever (a refunded pass still counts), and one checkout open at a time
create unique index premium_passes_one_per_user on public.premium_passes (user_id) where status in ('paid', 'refunded');
create unique index premium_passes_one_open on public.premium_passes (user_id) where status = 'open';

alter table public.premium_passes enable row level security;
create policy "Users read their own passes" on public.premium_passes
  for select to authenticated using (user_id = (select auth.uid()));

create trigger premium_passes_touch_updated_at before update on public.premium_passes
  for each row execute function public.touch_updated_at();

-- Turns a paid pass checkout into 60 days of Premium. Returns 'granted', 'already' (this
-- checkout was handled before) or 'ineligible' (admin Premium, a live subscription, or a
-- pass used before), in which case the caller refunds the payment.
create function public.grant_premium_pass(
  p_session text, p_user uuid, p_payment_intent text, p_amount integer, p_currency text, p_days integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass public.premium_passes;
  v_sub public.subscriptions;
  v_end timestamptz := now() + make_interval(days => p_days);
begin
  select * into v_pass from public.premium_passes where checkout_session_id = p_session for update;
  if v_pass.status = 'paid' then
    return 'already';
  end if;

  select * into v_sub from public.subscriptions where user_id = p_user for update;
  if v_sub.plan = 'premium' and v_sub.source = 'admin' then
    return 'ineligible';
  end if;
  if v_sub.plan = 'premium' and v_sub.source = 'stripe' and (v_sub.current_period_end is null or v_sub.current_period_end > now()) then
    return 'ineligible';
  end if;
  if exists (
    select 1 from public.premium_passes
    where user_id = p_user and status in ('paid', 'refunded') and checkout_session_id <> p_session
  ) then
    return 'ineligible';
  end if;

  insert into public.premium_passes (user_id, checkout_session_id, payment_intent_id, amount_total, currency, starts_at, ends_at, status)
  values (p_user, p_session, p_payment_intent, p_amount, p_currency, now(), v_end, 'paid')
  on conflict (checkout_session_id) do update
    set status = 'paid', payment_intent_id = excluded.payment_intent_id, amount_total = excluded.amount_total,
        currency = excluded.currency, starts_at = excluded.starts_at, ends_at = excluded.ends_at;

  update public.subscriptions
  set plan = 'premium', source = 'pass', billing_cycle = null, status = 'paid', current_period_end = v_end,
      cancel_at_period_end = true, stripe_subscription_id = null, updated_at = now()
  where user_id = p_user;

  return 'granted';
end;
$$;

-- A refunded pass ends Premium straight away (unless a subscription has taken over since)
create function public.revoke_premium_pass(p_payment_intent text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  update public.premium_passes set status = 'refunded'
  where payment_intent_id = p_payment_intent and status = 'paid'
  returning user_id into v_user;
  if v_user is null then
    return false;
  end if;
  update public.subscriptions
  set plan = 'free', status = 'refunded', current_period_end = now(), cancel_at_period_end = false, updated_at = now()
  where user_id = v_user and source = 'pass';
  return true;
end;
$$;

revoke execute on function public.grant_premium_pass(text, uuid, text, integer, text, integer) from public, anon, authenticated;
revoke execute on function public.revoke_premium_pass(text) from public, anon, authenticated;
grant execute on function public.grant_premium_pass(text, uuid, text, integer, text, integer) to service_role;
grant execute on function public.revoke_premium_pass(text) to service_role;

-- Rollback (only once no row uses source 'pass'):
-- drop function public.revoke_premium_pass(text);
-- drop function public.grant_premium_pass(text, uuid, text, integer, text, integer);
-- drop table public.premium_passes;
-- alter table public.subscriptions drop constraint subscriptions_source_check;
-- alter table public.subscriptions add constraint subscriptions_source_check check (source in ('demo', 'stripe', 'admin'));
