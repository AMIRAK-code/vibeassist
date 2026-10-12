-- Which AI the Anti-Fragile Engine's checks use (Red Team, Context & Drift written rules,
-- rule suggestions, Vision Grounding): one of the user's own Smart Token Gateway keys and a
-- model, or VibeAssist's shared Claude key. Writes go through the engine function, which checks
-- that the key belongs to the user; the browser only reads.
--
-- No row: the engine keeps its earlier behaviour (the newest Anthropic gateway key, else the
-- shared key). A row with provider_key_id null: the user picked the shared key. When the chosen
-- key is removed, the engine falls back to the shared key.

create table public.engine_ai_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider_key_id uuid references public.gateway_provider_keys (id) on delete set null,
  model text check (model ~ '^[A-Za-z0-9._:/-]{1,100}$'),
  updated_at timestamptz not null default now()
);

alter table public.engine_ai_settings enable row level security;

create policy "Users read their own engine AI settings" on public.engine_ai_settings
  for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete on public.engine_ai_settings from anon, authenticated;

-- Rollback:
-- drop table public.engine_ai_settings;
