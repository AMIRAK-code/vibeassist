-- Admin Premium: Premium given to an account by hand, with no billing and no end date.
-- Stripe syncs and choose_plan() leave these rows alone, and checkout refuses them, so an
-- admin account can't be charged or downgraded by accident.

alter table public.subscriptions drop constraint subscriptions_source_check;
alter table public.subscriptions add constraint subscriptions_source_check
  check (source in ('demo', 'stripe', 'admin'));

comment on column public.subscriptions.source is
  'demo: old free demo plan; stripe: paid through Stripe; admin: Premium granted by hand with set_admin_premium()';

-- Turns admin Premium on or off for one account. Only the database owner and the secret
-- key can run it (SQL editor or service role), never a signed-in user.
create function public.set_admin_premium(p_email text, p_on boolean default true)
returns public.subscriptions
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid;
  v_row public.subscriptions;
begin
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'No account with the email %', p_email using errcode = 'P0002';
  end if;
  select * into v_row from public.subscriptions where user_id = v_user;

  if p_on then
    -- Someone paying through Stripe would keep being charged: cancel that first
    if v_row.source = 'stripe' and v_row.plan = 'premium' then
      raise exception '% has a paid Stripe subscription; cancel it before granting admin Premium', p_email
        using errcode = '55000';
    end if;
    insert into public.subscriptions as s (user_id, plan, billing_cycle, source, status, current_period_end, cancel_at_period_end, stripe_subscription_id, updated_at)
    values (v_user, 'premium', null, 'admin', null, null, false, null, now())
    on conflict (user_id) do update set
      plan = 'premium',
      billing_cycle = null,
      source = 'admin',
      status = null,
      current_period_end = null,
      cancel_at_period_end = false,
      stripe_subscription_id = null,
      updated_at = now()
    returning * into v_row;
  else
    update public.subscriptions
    set plan = 'free', billing_cycle = null, source = 'demo', status = null, current_period_end = null,
        cancel_at_period_end = false, updated_at = now()
    where user_id = v_user and source = 'admin'
    returning * into v_row;
    if v_row.user_id is null then
      select * into v_row from public.subscriptions where user_id = v_user;
    end if;
  end if;
  return v_row;
end;
$$;

revoke execute on function public.set_admin_premium(text, boolean) from public, anon, authenticated;
