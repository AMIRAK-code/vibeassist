-- Additive migration for expanded Legal Document Studio kinds and client-side BYOK plans.
-- Note: the frontend remains backwards-compatible with databases that have not yet run this migration.

do $$
declare
  v_constraint text;
begin
  select conname into v_constraint
  from pg_constraint
  where conrelid = 'public.legal_documents'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%kind in%';

  if v_constraint is not null then
    execute format('alter table public.legal_documents drop constraint %I', v_constraint);
  end if;
end $$;

alter table public.legal_documents
  add constraint legal_documents_kind_check
  check (kind in ('privacy', 'terms', 'eula', 'cookies', 'dpa', 'ai_policy', 'refunds'));

create policy "Users insert their own advisor plans" on public.advisor_plans
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users insert their own plan steps" on public.plan_steps
  for insert to authenticated
  with check (user_id = (select auth.uid()));
