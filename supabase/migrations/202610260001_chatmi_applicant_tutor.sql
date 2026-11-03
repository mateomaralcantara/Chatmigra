-- ChatMi · Tutor Personal del Aplicante
-- Idempotente: se puede ejecutar de nuevo sin perder datos.
-- Expedientes y documentos PRIVADOS. Autorización: dueño o miembro invitado.
-- No reemplaza ni modifica el chat general.

create table if not exists public.applicant_cases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  applicant_name text not null check (length(trim(applicant_name)) between 2 and 160),
  nationality text not null default '' check (length(nationality) <= 120),
  destination text not null default '' check (length(destination) <= 120),
  visa_type text not null default '' check (length(visa_type) <= 120),
  profile_notes text not null default '' check (length(profile_notes) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.applicant_case_members (
  case_id uuid not null references public.applicant_cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'applicant'
    check (member_role in ('applicant', 'advisor')),
  created_at timestamptz not null default now(),
  primary key (case_id, user_id)
);

create index if not exists applicant_case_members_by_user
  on public.applicant_case_members (user_id, case_id);
create index if not exists applicant_cases_owner_idx
  on public.applicant_cases (owner_id);

create table if not exists public.applicant_case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.applicant_cases(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  filename text not null check (length(filename) between 1 and 180),
  mime_type text not null check (mime_type in (
    'application/pdf','image/jpeg','image/png','image/webp'
  )),
  category text not null default 'otro'
    check (category in ('perfil','carta','foto','formulario','otro')),
  size_bytes integer not null check (size_bytes between 1 and 2097152),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  constraint applicant_document_path_check check (
    storage_path like case_id::text || '/' || uploaded_by::text || '/%'
  )
);
create index if not exists applicant_case_documents_by_case
  on public.applicant_case_documents (case_id, created_at desc);

create table if not exists public.applicant_case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.applicant_cases(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  role text not null check (role in ('user','model')),
  content text not null check (length(content) between 1 and 15000),
  created_at timestamptz not null default now()
);
create index if not exists applicant_case_messages_by_case
  on public.applicant_case_messages (case_id, created_at);

create table if not exists public.applicant_case_invites (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.applicant_cases(id) on delete cascade,
  invited_by uuid not null references auth.users(id),
  invite_email text not null,
  member_role text not null check (member_role in ('applicant','advisor')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.applicant_cases enable row level security;
alter table public.applicant_case_members enable row level security;
alter table public.applicant_case_documents enable row level security;
alter table public.applicant_case_messages enable row level security;
alter table public.applicant_case_invites enable row level security;

-- Membership's policy refers ONLY to itself, preventing policy recursion.
drop policy if exists "ac_members_read_self" on public.applicant_case_members;
create policy "ac_members_read_self" on public.applicant_case_members
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "ac_cases_read_access" on public.applicant_cases;
create policy "ac_cases_read_access" on public.applicant_cases
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.applicant_case_members m
      where m.case_id = id and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "ac_cases_create_own" on public.applicant_cases;
create policy "ac_cases_create_own" on public.applicant_cases
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "ac_cases_update_own" on public.applicant_cases;
create policy "ac_cases_update_own" on public.applicant_cases
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "ac_documents_read_case" on public.applicant_case_documents;
create policy "ac_documents_read_case" on public.applicant_case_documents
  for select to authenticated
  using (exists (select 1 from public.applicant_cases c where c.id = case_id));

drop policy if exists "ac_documents_upload_case" on public.applicant_case_documents;
create policy "ac_documents_upload_case" on public.applicant_case_documents
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (select 1 from public.applicant_cases c where c.id = case_id)
  );

drop policy if exists "ac_documents_delete_case" on public.applicant_case_documents;
create policy "ac_documents_delete_case" on public.applicant_case_documents
  for delete to authenticated
  using (
    uploaded_by = (select auth.uid())
    or exists (
      select 1 from public.applicant_cases c
      where c.id = case_id and c.owner_id = (select auth.uid())
    )
  );

drop policy if exists "ac_messages_read_case" on public.applicant_case_messages;
create policy "ac_messages_read_case" on public.applicant_case_messages
  for select to authenticated
  using (exists (select 1 from public.applicant_cases c where c.id = case_id));

drop policy if exists "ac_messages_insert_case" on public.applicant_case_messages;
create policy "ac_messages_insert_case" on public.applicant_case_messages
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.applicant_cases c where c.id = case_id)
  );

-- Deny Data API access by anon; authenticated receives strictly scoped grants.
revoke all on public.applicant_cases,
  public.applicant_case_members,
  public.applicant_case_documents,
  public.applicant_case_messages,
  public.applicant_case_invites
  from public, anon, authenticated;
grant select, insert, update on public.applicant_cases to authenticated;
grant select on public.applicant_case_members to authenticated;
grant select, insert, delete on public.applicant_case_documents to authenticated;
grant select, insert on public.applicant_case_messages to authenticated;
grant all on public.applicant_cases, public.applicant_case_members,
  public.applicant_case_documents, public.applicant_case_messages,
  public.applicant_case_invites to service_role;

-- Private storage bucket; never use a public bucket for applicant documents.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chatmi-applicant-cases','chatmi-applicant-cases',false,2097152,
  array['application/pdf','image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Object path: <case UUID>/<uploader UUID>/<random UUID>.<extension>
drop policy if exists "ac_storage_read_authorized_case" on storage.objects;
create policy "ac_storage_read_authorized_case" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chatmi-applicant-cases'
    and exists (
      select 1 from public.applicant_cases c
      where c.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "ac_storage_upload_authorized_case" on storage.objects;
create policy "ac_storage_upload_authorized_case" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chatmi-applicant-cases'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and lower(storage.extension(name)) in ('pdf','jpg','png','webp')
    and exists (
      select 1 from public.applicant_cases c
      where c.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "ac_storage_delete_authorized_case" on storage.objects;
create policy "ac_storage_delete_authorized_case" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chatmi-applicant-cases'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or exists (
        select 1 from public.applicant_cases c
        where c.id::text = (storage.foldername(name))[1]
          and c.owner_id = (select auth.uid())
      )
    )
  );

-- Read-only installation verification.
select id, public, file_size_limit from storage.buckets
where id = 'chatmi-applicant-cases';
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename like 'applicant_case%';
