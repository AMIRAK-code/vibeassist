-- Legal Document Generator: privacy policies, terms and EULAs drafted by Claude for the
-- user's own apps. Only touches public.legal_documents.

create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('privacy', 'terms', 'eula')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  inputs jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs) = 'object'),
  sections jsonb not null check (jsonb_typeof(sections) = 'array' and octet_length(sections::text) <= 200000),
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index legal_documents_user_idx on public.legal_documents (user_id, created_at desc);

alter table public.legal_documents enable row level security;

create policy "Users read their own legal documents" on public.legal_documents
  for select to authenticated using (user_id = (select auth.uid()));
-- Drafts are written by the legal-docs function; users can put back one they just deleted (Undo)
create policy "Users add back their own legal documents" on public.legal_documents
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users edit their own legal documents" on public.legal_documents
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete their own legal documents" on public.legal_documents
  for delete to authenticated using (user_id = (select auth.uid()));

-- Users edit the wording; what the draft was generated from stays as it was
revoke update on public.legal_documents from anon, authenticated;
grant update (title, sections) on public.legal_documents to authenticated;

create trigger legal_documents_touch_updated_at before update on public.legal_documents
  for each row execute function public.touch_updated_at();

-- Rollback:
-- drop table public.legal_documents;
