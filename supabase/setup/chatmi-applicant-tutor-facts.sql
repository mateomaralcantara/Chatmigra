-- ChatMi · memoria estructurada y verificada (Tutor fast facts).
-- Ejecutar DESPUÉS de chatmi-applicant-tutor.sql en el proyecto ChatMi.
-- No elimina ni reescribe documentos, historiales o expedientes existentes.

create table if not exists public.applicant_case_facts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.applicant_cases(id) on delete cascade,
  document_id uuid references public.applicant_case_documents(id) on delete cascade,
  fact_key text not null check (fact_key in
    ('applicant_name','date_of_birth','nationality','destination','visa_type','passport_number')),
  fact_value text not null check (char_length(trim(fact_value)) between 1 and 400),
  verification_status text not null default 'pending_review'
    check (verification_status in ('pending_review','verified','rejected')),
  verified_by uuid references auth.users(id) on delete cascade,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint applicant_case_facts_verification_consistency check (
    (verification_status = 'verified' and verified_by is not null and verified_at is not null)
    or (verification_status <> 'verified' and verified_by is null and verified_at is null)
  )
);
create unique index if not exists applicant_case_facts_dedup
  on public.applicant_case_facts (case_id,document_id,fact_key,fact_value) nulls not distinct;
create index if not exists applicant_case_facts_fast_lookup
  on public.applicant_case_facts (case_id,fact_key,verification_status);

alter table public.applicant_case_facts enable row level security;
revoke all on public.applicant_case_facts from public, anon, authenticated;
grant select on public.applicant_case_facts to authenticated;
grant update(verification_status,verified_by,verified_at) on public.applicant_case_facts to authenticated;
grant all on public.applicant_case_facts to service_role;

drop policy if exists ac_facts_read_members on public.applicant_case_facts;
create policy ac_facts_read_members on public.applicant_case_facts
  for select to authenticated using (
    exists (
      select 1 from public.applicant_cases c
      where c.id = case_id
    )
  );

-- Only the owner may review facts; ordinary members can see pending facts
-- but cannot approve facts or change the value, document or case.
drop policy if exists ac_facts_owner_review on public.applicant_case_facts;
create policy ac_facts_owner_review on public.applicant_case_facts
  for update to authenticated
  using (
    exists (
      select 1 from public.applicant_cases c
      where c.id = case_id and c.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.applicant_cases c
      where c.id = case_id and c.owner_id = (select auth.uid())
    )
    and (
      (verification_status = 'verified'
        and verified_by = (select auth.uid()) and verified_at is not null)
      or (verification_status <> 'verified'
        and verified_by is null and verified_at is null)
    )
  );

-- Read-only diagnostics: both must show enabled RLS and grants.
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename = 'applicant_case_facts';
select grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='applicant_case_facts';
