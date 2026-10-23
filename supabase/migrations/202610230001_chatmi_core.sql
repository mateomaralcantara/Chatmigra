-- ChatMi core schema: auth-owned rows, quotas and payment records.
-- Apply this migration to the Supabase project used by ChatMi.

create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  user_email text,
  title text,
  created_at timestamptz not null default now()
);

alter table public.conversations add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.conversations add column if not exists user_email text;
alter table public.conversations add column if not exists title text;
alter table public.conversations add column if not exists created_at timestamptz not null default now();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'model')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.messages add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.messages add column if not exists created_at timestamptz not null default now();

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  user_email text,
  provider text,
  provider_subscription_id text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'premium')),
  status text not null default 'active',
  has_used_free boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.subscriptions add column if not exists user_email text;
alter table public.subscriptions add column if not exists provider text;
alter table public.subscriptions add column if not exists provider_subscription_id text;
alter table public.subscriptions add column if not exists plan text not null default 'free';
alter table public.subscriptions add column if not exists status text not null default 'active';
alter table public.subscriptions add column if not exists has_used_free boolean not null default false;
alter table public.subscriptions add column if not exists created_at timestamptz not null default now();
alter table public.subscriptions add column if not exists updated_at timestamptz not null default now();

-- Deliberately no UNIQUE(user_id) migration here: legacy installations may
-- contain more than one historical subscription row per email/user. The
-- server updates the current row without deleting historical records.

create table if not exists public.account_quotas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tokens_max integer not null default 3000 check (tokens_max >= 0),
  tokens_used integer not null default 0 check (tokens_used >= 0),
  tokens_reserved integer not null default 0 check (tokens_reserved >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_quotas add column if not exists tokens_max integer not null default 3000;
alter table public.account_quotas add column if not exists tokens_used integer not null default 0;
alter table public.account_quotas add column if not exists tokens_reserved integer not null default 0;
alter table public.account_quotas add column if not exists created_at timestamptz not null default now();
alter table public.account_quotas add column if not exists updated_at timestamptz not null default now();

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  user_email text,
  provider text not null,
  provider_subscription_id text,
  provider_capture_id text,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  status text not null,
  created_at timestamptz not null default now()
);

alter table public.payments add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.payments add column if not exists user_email text;
alter table public.payments add column if not exists provider text;
alter table public.payments add column if not exists provider_subscription_id text;
alter table public.payments add column if not exists provider_capture_id text;
alter table public.payments add column if not exists created_at timestamptz not null default now();

create table if not exists public.user_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  user_email text,
  type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.user_activity add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.user_activity add column if not exists user_email text;
alter table public.user_activity add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.user_activity add column if not exists created_at timestamptz not null default now();

-- Backfill legacy email-owned rows when possible.
update public.conversations c
set user_id = u.id
from auth.users u
where c.user_id is null
  and c.user_email is not null
  and lower(c.user_email) = lower(u.email);

update public.subscriptions s
set user_id = u.id
from auth.users u
where s.user_id is null
  and s.user_email is not null
  and lower(s.user_email) = lower(u.email);

update public.payments p
set user_id = u.id
from auth.users u
where p.user_id is null
  and p.user_email is not null
  and lower(p.user_email) = lower(u.email);

update public.user_activity a
set user_id = u.id
from auth.users u
where a.user_id is null
  and a.user_email is not null
  and lower(a.user_email) = lower(u.email);

update public.messages m
set user_id = c.user_id
from public.conversations c
where m.user_id is null
  and m.conversation_id = c.id
  and c.user_id is not null;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.subscriptions enable row level security;
alter table public.account_quotas enable row level security;
alter table public.payments enable row level security;
alter table public.user_activity enable row level security;

drop policy if exists conversations_select_own on public.conversations;
drop policy if exists conversations_insert_own on public.conversations;
drop policy if exists conversations_update_own on public.conversations;
drop policy if exists conversations_delete_own on public.conversations;

create policy conversations_select_own on public.conversations
for select to authenticated
using ((select auth.uid()) = user_id);

create policy conversations_insert_own on public.conversations
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy conversations_update_own on public.conversations
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy conversations_delete_own on public.conversations
for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists messages_select_own on public.messages;
drop policy if exists messages_insert_own on public.messages;

create policy messages_select_own on public.messages
for select to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and c.user_id = (select auth.uid())
  )
);

create policy messages_insert_own on public.messages
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and c.user_id = (select auth.uid())
  )
);

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists account_quotas_select_own on public.account_quotas;
create policy account_quotas_select_own on public.account_quotas
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists activity_select_own on public.user_activity;
drop policy if exists activity_insert_own on public.user_activity;

create policy activity_select_own on public.user_activity
for select to authenticated
using ((select auth.uid()) = user_id);

create policy activity_insert_own on public.user_activity
for insert to authenticated
with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant select on public.subscriptions to authenticated;
grant select on public.account_quotas to authenticated;
grant select on public.payments to authenticated;
grant select, insert on public.user_activity to authenticated;

create or replace function public.chatmi_reserve_tokens(p_tokens integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_remaining integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_tokens is null or p_tokens <= 0 then
    raise exception 'invalid_reservation';
  end if;

  insert into public.account_quotas(user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  update public.account_quotas
  set
    tokens_reserved = tokens_reserved + p_tokens,
    updated_at = now()
  where user_id = v_uid
    and tokens_used + tokens_reserved + p_tokens <= tokens_max
  returning tokens_max - tokens_used - tokens_reserved
  into v_remaining;

  if not found then
    select greatest(tokens_max - tokens_used - tokens_reserved, 0)
    into v_remaining
    from public.account_quotas
    where user_id = v_uid;

    return jsonb_build_object(
      'ok', false,
      'remaining', coalesce(v_remaining, 0)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'remaining', greatest(v_remaining, 0),
    'reserved', p_tokens
  );
end;
$$;

revoke all on function public.chatmi_reserve_tokens(integer) from public;
revoke all on function public.chatmi_reserve_tokens(integer) from anon;
grant execute on function public.chatmi_reserve_tokens(integer) to authenticated;

create or replace function public.chatmi_finalize_tokens(
  p_reserved integer,
  p_actual integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_actual integer;
  v_remaining integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_actual := greatest(0, least(coalesce(p_actual, 0), greatest(coalesce(p_reserved, 0), 0)));

  update public.account_quotas
  set
    tokens_reserved = greatest(tokens_reserved - greatest(coalesce(p_reserved, 0), 0), 0),
    tokens_used = least(tokens_max, tokens_used + v_actual),
    updated_at = now()
  where user_id = v_uid
  returning greatest(tokens_max - tokens_used - tokens_reserved, 0)
  into v_remaining;

  return jsonb_build_object(
    'ok', true,
    'remaining', coalesce(v_remaining, 0),
    'used', v_actual
  );
end;
$$;

revoke all on function public.chatmi_finalize_tokens(integer, integer) from public;
revoke all on function public.chatmi_finalize_tokens(integer, integer) from anon;
grant execute on function public.chatmi_finalize_tokens(integer, integer) to authenticated;
