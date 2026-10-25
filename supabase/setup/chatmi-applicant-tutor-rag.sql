-- ChatMi: private, lexical RAG for the applicant Tutor.
-- Run AFTER supabase/setup/chatmi-applicant-tutor.sql in ChatMi's own project.
-- Existing chat, files, users, and documents are preserved.
create table if not exists public.applicant_case_document_chunks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.applicant_cases(id) on delete cascade,
  document_id uuid not null references public.applicant_case_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0 and chunk_index < 200),
  content text not null check (length(content) between 1 and 3500),
  created_at timestamptz not null default now(),
  unique(document_id,chunk_index)
);
create index if not exists applicant_rag_case_documents_idx
 on public.applicant_case_document_chunks(case_id,document_id,chunk_index);
create index if not exists applicant_rag_content_search_idx
 on public.applicant_case_document_chunks using gin(to_tsvector('simple',content));

alter table public.applicant_case_document_chunks enable row level security;
revoke all on public.applicant_case_document_chunks from public,anon,authenticated;
grant select on public.applicant_case_document_chunks to authenticated;
grant all on public.applicant_case_document_chunks to service_role;

drop policy if exists applicant_rag_read_authorized on public.applicant_case_document_chunks;
create policy applicant_rag_read_authorized on public.applicant_case_document_chunks
 for select to authenticated
 using (
   exists (
     select 1 from public.applicant_cases c
     where c.id = case_id
   )
   and exists (
     select 1 from public.applicant_case_documents d
     where d.id = document_id and d.case_id = case_id
   )
 );

-- SECURITY INVOKER, not definer: the user JWT and case RLS constrain results.
create or replace function public.search_applicant_case_chunks(
 p_case_id uuid, p_document_ids uuid[], p_query text, p_limit integer default 8
)
returns table (
 document_id uuid, filename text, chunk_index integer, content text, score real
)
language sql stable security invoker
set search_path = ''
as $$
 with phrase as (
   select websearch_to_tsquery('simple',left(coalesce(p_query,''),500)) as query
 )
 select ch.document_id, doc.filename, ch.chunk_index, ch.content,
   ts_rank(to_tsvector('simple',ch.content), phrase.query) as score
 from public.applicant_case_document_chunks ch
 join public.applicant_case_documents doc on doc.id = ch.document_id
 cross join phrase
 where ch.case_id = p_case_id and doc.case_id = p_case_id
   and ch.document_id = any(p_document_ids)
 order by
   case when to_tsvector('simple',ch.content) @@ phrase.query then 0 else 1 end,
   score desc, ch.document_id, ch.chunk_index
 limit greatest(1,least(coalesce(p_limit,8),12));
$$;
revoke all on function public.search_applicant_case_chunks(uuid,uuid[],text,integer)
 from public,anon;
grant execute on function public.search_applicant_case_chunks(uuid,uuid[],text,integer)
 to authenticated,service_role;

-- Read-only installation check:
select tablename,rowsecurity from pg_tables
where schemaname='public' and tablename='applicant_case_document_chunks';
