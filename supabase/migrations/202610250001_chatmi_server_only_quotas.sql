-- ChatMi post-migration hardening.
-- SECURITY: billing RPCs must only be callable by the server service role.
-- IMPORTANT ROLLOUT ORDER: deploy the updated fail-closed /api/gemini endpoint
-- (with SUPABASE_SERVICE_ROLE_KEY in the server environment) before db push.
-- This migration does not drop or rewrite existing quota data.

create table if not exists public.chatmi_token_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reserved_tokens integer not null check (reserved_tokens > 0 and reserved_tokens <= 3000),
  actual_tokens integer check (actual_tokens is null or actual_tokens >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'finalized')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);

create index if not exists chatmi_token_reservations_user_status_idx
  on public.chatmi_token_reservations (user_id, status, created_at);

alter table public.chatmi_token_reservations enable row level security;

-- No browser-originated access to reservation state.
revoke all on public.chatmi_token_reservations from public, anon, authenticated;
grant select, insert, update on public.chatmi_token_reservations to service_role;

create or replace function public.chatmi_reserve_tokens_server(
  p_user_id uuid,
  p_tokens integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $reserve$
declare
  v_email text;
  v_remaining integer;
  v_reservation_id uuid;
begin
  if p_user_id is null or p_tokens is null or p_tokens < 1 or p_tokens > 3000 then
    raise exception 'invalid_reservation';
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = p_user_id;

  if v_email is null then
    raise exception 'quota_user_not_found';
  end if;

  -- The original ChatMi account_quotas table requires legacy NOT NULL fields.
  -- Its legacy email PK and newer unique(user_id) index remain untouched.
  insert into public.account_quotas (
    user_id, user_email, tokens_max, tokens_remaining,
    messages_max, messages_remaining, tokens_used, tokens_reserved
  )
  values (p_user_id, v_email, 3000, 3000, 0, 0, 0, 0)
  on conflict (user_id) do nothing;

  update public.account_quotas
  set
    tokens_reserved = tokens_reserved + p_tokens,
    tokens_remaining = greatest(tokens_max - tokens_used - tokens_reserved - p_tokens, 0),
    updated_at = now()
  where user_id = p_user_id
    and tokens_used + tokens_reserved + p_tokens <= tokens_max
  returning tokens_remaining into v_remaining;

  if not found then
    select greatest(tokens_max - tokens_used - tokens_reserved, 0)
    into v_remaining
    from public.account_quotas
    where user_id = p_user_id;

    return jsonb_build_object('ok', false, 'remaining', coalesce(v_remaining, 0));
  end if;

  insert into public.chatmi_token_reservations(user_id, reserved_tokens)
  values (p_user_id, p_tokens)
  returning id into v_reservation_id;

  return jsonb_build_object(
    'ok', true,
    'remaining', greatest(v_remaining, 0),
    'reservation_id', v_reservation_id
  );
end;
$reserve$;

create or replace function public.chatmi_finalize_tokens_server(
  p_reservation_id uuid,
  p_actual integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $finalize$
declare
  v_user_id uuid;
  v_reserved integer;
  v_status text;
  v_actual integer;
  v_remaining integer;
begin
  -- Each reservation can be finalized only once, even after a network retry.
  select r.user_id, r.reserved_tokens, r.status
  into v_user_id, v_reserved, v_status
  from public.chatmi_token_reservations r
  where r.id = p_reservation_id
  for update;

  if not found then
    raise exception 'reservation_not_found';
  end if;

  if v_status = 'finalized' then
    select greatest(q.tokens_max - q.tokens_used - q.tokens_reserved, 0)
    into v_remaining
    from public.account_quotas q
    where q.user_id = v_user_id;

    return jsonb_build_object(
      'ok', true,
      'remaining', coalesce(v_remaining, 0),
      'already_finalized', true
    );
  end if;

  v_actual := greatest(0, least(coalesce(p_actual, 0), v_reserved));

  update public.account_quotas
  set
    tokens_reserved = greatest(tokens_reserved - v_reserved, 0),
    tokens_used = least(tokens_max, tokens_used + v_actual),
    tokens_remaining = greatest(
      tokens_max - least(tokens_max, tokens_used + v_actual)
      - greatest(tokens_reserved - v_reserved, 0), 0
    ),
    updated_at = now()
  where user_id = v_user_id
  returning tokens_remaining into v_remaining;

  if not found then
    raise exception 'quota_row_missing';
  end if;

  update public.chatmi_token_reservations
  set status = 'finalized', actual_tokens = v_actual, finalized_at = now()
  where id = p_reservation_id;

  return jsonb_build_object(
    'ok', true,
    'remaining', coalesce(v_remaining, 0),
    'used', v_actual
  );
end;
$finalize$;

-- Revoke existing user-callable billing RPCs and restrict both new server RPCs.
-- service_role calls the new functions from /api/gemini after JWT validation.
revoke all on function public.chatmi_reserve_tokens(integer)
  from public, anon, authenticated;
revoke all on function public.chatmi_finalize_tokens(integer, integer)
  from public, anon, authenticated;

revoke all on function public.chatmi_reserve_tokens_server(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.chatmi_finalize_tokens_server(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.chatmi_reserve_tokens_server(uuid, integer)
  to service_role;
grant execute on function public.chatmi_finalize_tokens_server(uuid, integer)
  to service_role;
