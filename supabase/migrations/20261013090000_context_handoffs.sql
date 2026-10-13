-- Context Handoffs: short, structured notes that carry a conversation from one AI, account or
-- device to another, and links that share one read-only for a limited time.
-- Only touches public: two new tables, three functions and one allowed value on ai_usage.feature.
-- Chats themselves are never stored; only the handoff written from them.

create table public.handoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  source text not null default 'other'
    check (source in ('chatgpt', 'claude', 'claude_code', 'gemini', 'deepseek', 'copilot', 'grok', 'meta', 'cursor', 'other')),
  -- 'ai': condensed from a chat by the handoffs function; 'self': written by the user's own AI and pasted in
  method text not null check (method in ('ai', 'self')),
  sections jsonb not null check (jsonb_typeof(sections) = 'array' and octet_length(sections::text) <= 100000),
  conversation_date timestamptz,
  message_count integer check (message_count is null or message_count >= 0),
  model text check (char_length(model) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index handoffs_user_idx on public.handoffs (user_id, created_at desc);

alter table public.handoffs enable row level security;

-- Free accounts keep up to 3 handoffs; Premium up to 500. The handoffs function checks the same
-- limits for the ones it writes. Counted here rather than in the insert policy: a policy that
-- queries its own table fails with "infinite recursion detected in policy".
create function public.can_add_handoff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.handoffs where user_id = (select auth.uid()))
    < (case when public.has_premium() then 500 else 3 end);
$$;

revoke execute on function public.can_add_handoff() from public, anon;
grant execute on function public.can_add_handoff() to authenticated;

create policy "Users read their own handoffs" on public.handoffs
  for select to authenticated using (user_id = (select auth.uid()));
-- This also lets Undo put back a handoff that was just deleted
create policy "Users add their own handoffs within their plan" on public.handoffs
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.can_add_handoff()));
create policy "Users edit their own handoffs" on public.handoffs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users delete their own handoffs" on public.handoffs
  for delete to authenticated using (user_id = (select auth.uid()));

-- Users edit the title and wording; where it came from stays as it was
revoke update on public.handoffs from anon, authenticated;
grant update (title, sections) on public.handoffs to authenticated;

create trigger handoffs_touch_updated_at before update on public.handoffs
  for each row execute function public.touch_updated_at();

-- Share links. Only a hash of the token is stored: the link is shown once when it's made, and a
-- copy of the database can't be used to open anyone's handoffs.
create table public.handoff_links (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references public.handoffs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  views integer not null default 0,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '30 days 1 minute')
);

create index handoff_links_handoff_idx on public.handoff_links (handoff_id, created_at desc);

alter table public.handoff_links enable row level security;

create policy "Users read their own handoff links" on public.handoff_links
  for select to authenticated using (user_id = (select auth.uid()));

-- Links are made and revoked through the functions below; the browser never sees the hash
revoke all on public.handoff_links from anon, authenticated;
grant select (id, handoff_id, user_id, expires_at, revoked_at, views, last_viewed_at, created_at)
  on public.handoff_links to authenticated;

-- A new link for one of the caller's handoffs. Returns the token once; only its hash is kept.
create function public.create_handoff_link(p_handoff uuid, p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_token text;
  v_link public.handoff_links;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public.has_premium() then
    raise exception 'Share links are part of Premium' using errcode = '42501';
  end if;
  if p_days is null or p_days not in (1, 7, 30) then
    raise exception 'Links last 1, 7 or 30 days' using errcode = '22023';
  end if;
  if not exists (select 1 from public.handoffs where id = p_handoff and user_id = v_user) then
    raise exception 'That handoff was not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.handoff_links
      where handoff_id = p_handoff and revoked_at is null and expires_at > now()) >= 10 then
    raise exception 'This handoff already has 10 active links. Revoke one first.' using errcode = '54000';
  end if;

  -- 32 random bytes as URL-safe base64 (43 characters)
  v_token := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  insert into public.handoff_links (handoff_id, user_id, token_hash, expires_at)
  values (p_handoff, v_user, extensions.digest(v_token, 'sha256'), now() + make_interval(days => p_days))
  returning * into v_link;

  return jsonb_build_object('id', v_link.id, 'token', v_token, 'expires_at', v_link.expires_at);
end;
$$;

create function public.revoke_handoff_link(p_link uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.handoff_links set revoked_at = now()
  where id = p_link and user_id = auth.uid() and revoked_at is null;
$$;

-- Opens a shared handoff for anyone holding the link, signed in or not. Answers with a status
-- instead of an error so the page can say why a link no longer works, and never returns who
-- shared it. Callable without signing in on purpose: the 256-bit token is the permission.
create function public.get_shared_handoff(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.handoff_links;
  v_handoff public.handoffs;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_link from public.handoff_links where token_hash = extensions.digest(p_token, 'sha256');
  if v_link.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_link.revoked_at is not null then
    return jsonb_build_object('status', 'revoked');
  end if;
  if v_link.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  select * into v_handoff from public.handoffs where id = v_link.handoff_id;
  if v_handoff.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.handoff_links set views = views + 1, last_viewed_at = now() where id = v_link.id;
  return jsonb_build_object(
    'status', 'ok',
    'expires_at', v_link.expires_at,
    'handoff', jsonb_build_object(
      'title', v_handoff.title,
      'source', v_handoff.source,
      'sections', v_handoff.sections,
      'conversation_date', v_handoff.conversation_date,
      'created_at', v_handoff.created_at,
      'updated_at', v_handoff.updated_at
    )
  );
end;
$$;

revoke execute on function public.create_handoff_link(uuid, integer) from public, anon;
revoke execute on function public.revoke_handoff_link(uuid) from public, anon;
revoke execute on function public.get_shared_handoff(text) from public;
grant execute on function public.create_handoff_link(uuid, integer) to authenticated;
grant execute on function public.revoke_handoff_link(uuid) to authenticated;
grant execute on function public.get_shared_handoff(text) to anon, authenticated;

-- AI condensing is logged like the advisor and the engine
alter table public.ai_usage drop constraint ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('advisor', 'engine', 'handoff'));

-- Rollback:
-- drop function public.get_shared_handoff(text);
-- drop function public.revoke_handoff_link(uuid);
-- drop function public.create_handoff_link(uuid, integer);
-- drop table public.handoff_links;
-- drop table public.handoffs;
-- drop function public.can_add_handoff();
-- delete from public.ai_usage where feature = 'handoff';
-- alter table public.ai_usage drop constraint ai_usage_feature_check;
-- alter table public.ai_usage add constraint ai_usage_feature_check check (feature in ('advisor', 'engine'));
