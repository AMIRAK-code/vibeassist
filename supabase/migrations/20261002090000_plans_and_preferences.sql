-- Plans, plain-language goals and launch checklist progress.
-- Additive: existing rows are kept; old goal values are mapped to the new list.

-- Goals: specific outcomes instead of slogans ------------------------------------

alter table public.profiles drop constraint profiles_goals_check;

update public.profiles
set goals = coalesce((
  select array_agg(distinct mapped order by mapped)
  from (
    select case g
      when 'Build a SaaS Empire' then 'Grow revenue'
      when 'Generate Passive Income' then 'Grow revenue'
      when 'Develop Viral Mobile Games' then 'Get more downloads'
      when 'Sell Micro-tools' then 'Launch a new app'
    end as mapped
    from unnest(goals) as g
  ) as m
  where mapped is not null
), '{}');

alter table public.profiles add constraint profiles_goals_check check (goals <@ array[
  'Grow revenue', 'Get more downloads', 'Spend less on ads', 'Launch a new app', 'Keep users coming back'
]::text[]);

-- Same list for new sign-ups
create or replace function public.handle_new_user()
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
  where g = any (array['Grow revenue', 'Get more downloads', 'Spend less on ads', 'Launch a new app', 'Keep users coming back']);

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

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Launch checklist progress: { "<item key>": "<ISO date ticked>" } -------------------

alter table public.profiles
  add column launch_checklist jsonb not null default '{}'::jsonb
  check (jsonb_typeof(launch_checklist) = 'object');

-- Advisor plans -------------------------------------------------------------------
-- Written only by the ai-advisor Edge Function (secret key) after it has checked the
-- caller; users can read and delete their own plans and change a step's status.

create table public.advisor_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_days smallint not null check (period_days in (7, 30, 90)),
  focus text check (focus in ('revenue', 'downloads', 'ads', 'retention')),
  summary text not null check (char_length(summary) <= 1200),
  missing_data text[] not null default '{}',
  context jsonb not null default '{}'::jsonb, -- exactly what the advisor was given
  model text not null,
  created_at timestamptz not null default now()
);

create index advisor_plans_user_created_idx on public.advisor_plans (user_id, created_at desc);

alter table public.advisor_plans enable row level security;

create policy "Users read their own plans" on public.advisor_plans
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users delete their own plans" on public.advisor_plans
  for delete to authenticated using (user_id = (select auth.uid()));

create table public.plan_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.advisor_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position smallint not null,
  title text not null check (char_length(title) between 1 and 160),
  detail text not null default '' check (char_length(detail) <= 600),
  based_on text not null default '' check (char_length(based_on) <= 400),
  effort text not null default 'medium' check (effort in ('small', 'medium', 'large')),
  status text not null default 'suggested' check (status in ('suggested', 'kept', 'dismissed', 'done')),
  updated_at timestamptz not null default now()
);

create index plan_steps_plan_idx on public.plan_steps (plan_id, position);
create index plan_steps_user_idx on public.plan_steps (user_id);

alter table public.plan_steps enable row level security;

create policy "Users read their own plan steps" on public.plan_steps
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users update their own plan steps" on public.plan_steps
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Generated text stays as Claude wrote it: users may only change a step's status
revoke update on public.plan_steps from anon, authenticated;
grant update (status) on public.plan_steps to authenticated;

create trigger plan_steps_touch_updated_at before update on public.plan_steps
  for each row execute function public.touch_updated_at();
