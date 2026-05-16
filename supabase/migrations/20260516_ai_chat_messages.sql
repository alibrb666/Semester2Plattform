-- AI chatbot conversation history per PDF source.
-- One row per user message or assistant response.

create table if not exists public.ai_chat_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  source_id   text not null,
  pdf_name    text,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists ai_chat_messages_user_source_created_idx
  on public.ai_chat_messages (user_id, source_id, created_at);

alter table public.ai_chat_messages enable row level security;

drop policy if exists "owner can read own ai_chat_messages" on public.ai_chat_messages;
create policy "owner can read own ai_chat_messages"
  on public.ai_chat_messages for select
  using (auth.uid() = user_id);

drop policy if exists "owner can insert own ai_chat_messages" on public.ai_chat_messages;
create policy "owner can insert own ai_chat_messages"
  on public.ai_chat_messages for insert
  with check (auth.uid() = user_id);

drop policy if exists "owner can delete own ai_chat_messages" on public.ai_chat_messages;
create policy "owner can delete own ai_chat_messages"
  on public.ai_chat_messages for delete
  using (auth.uid() = user_id);
