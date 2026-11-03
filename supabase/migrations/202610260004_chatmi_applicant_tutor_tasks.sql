-- ChatMi tutor: seguimiento persistente por expediente.
-- Ejecutar DESPUÉS de supabase/migrations/202610260001_chatmi_applicant_tutor.sql
create table if not exists public.applicant_case_tasks (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.applicant_cases(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 title text not null check (char_length(trim(title)) between 2 and 240),
 description text not null default '' check (char_length(description) <= 4000),
 status text not null default 'pending' check (status in ('pending','in_progress','completed')),
 due_date date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists applicant_case_tasks_case_idx on public.applicant_case_tasks(case_id,created_at desc);
alter table public.applicant_case_tasks enable row level security;
revoke all on public.applicant_case_tasks from public,anon,authenticated;
grant select,insert,update,delete on public.applicant_case_tasks to authenticated;
grant all on public.applicant_case_tasks to service_role;
drop policy if exists ac_tasks_select on public.applicant_case_tasks;
create policy ac_tasks_select on public.applicant_case_tasks for select to authenticated
 using (exists(select 1 from public.applicant_cases c where c.id=case_id));
drop policy if exists ac_tasks_insert on public.applicant_case_tasks;
create policy ac_tasks_insert on public.applicant_case_tasks for insert to authenticated
 with check (created_by=(select auth.uid()) and exists(select 1 from public.applicant_cases c where c.id=case_id));
drop policy if exists ac_tasks_update on public.applicant_case_tasks;
create policy ac_tasks_update on public.applicant_case_tasks for update to authenticated
 using (exists(select 1 from public.applicant_cases c where c.id=case_id))
 with check (exists(select 1 from public.applicant_cases c where c.id=case_id));
drop policy if exists ac_tasks_delete on public.applicant_case_tasks;
create policy ac_tasks_delete on public.applicant_case_tasks for delete to authenticated
 using (created_by=(select auth.uid()) or exists(select 1 from public.applicant_cases c where c.id=case_id and c.owner_id=(select auth.uid())));
-- La eliminación del expediente cascada elimina las tareas relacionales.
