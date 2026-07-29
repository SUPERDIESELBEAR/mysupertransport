
create extension if not exists vector;

create table if not exists public.staff_help_knowledge (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text not null,
  title text not null,
  route text,
  section text,
  content text not null,
  token_count int,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source, source_id, section)
);

grant select on public.staff_help_knowledge to authenticated;
grant all on public.staff_help_knowledge to service_role;

alter table public.staff_help_knowledge enable row level security;

create policy "Staff can read help knowledge"
  on public.staff_help_knowledge
  for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'owner')
    or public.has_role(auth.uid(), 'management')
    or public.has_role(auth.uid(), 'onboarding_staff')
    or public.has_role(auth.uid(), 'dispatcher')
  );

create index if not exists staff_help_knowledge_embedding_idx
  on public.staff_help_knowledge
  using hnsw (embedding vector_cosine_ops);

create index if not exists staff_help_knowledge_source_idx
  on public.staff_help_knowledge (source);

create or replace function public.match_staff_help_knowledge(
  query_embedding vector(1536),
  match_count int default 8,
  min_similarity float default 0.3
)
returns table (
  id uuid,
  source text,
  source_id text,
  title text,
  route text,
  section text,
  content text,
  similarity float
)
language sql
stable
security definer
set search_path = public
as $$
  select
    k.id, k.source, k.source_id, k.title, k.route, k.section, k.content,
    1 - (k.embedding <=> query_embedding) as similarity
  from public.staff_help_knowledge k
  where 1 - (k.embedding <=> query_embedding) >= min_similarity
  order by k.embedding <=> query_embedding
  limit match_count;
$$;

revoke all on function public.match_staff_help_knowledge(vector, int, float) from public;
grant execute on function public.match_staff_help_knowledge(vector, int, float) to authenticated, service_role;
