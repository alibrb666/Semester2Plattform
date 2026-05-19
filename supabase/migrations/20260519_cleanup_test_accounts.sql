-- One-time cleanup: keep only Ali and YNS accounts and their related data.
do $$
declare
  keep_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into keep_ids
  from public.profiles
  where name in ('Ali', 'YNS');

  delete from public.ai_chat_messages where not (user_id = any(keep_ids));
  delete from public.sessions where not (user_id = any(keep_ids));
  delete from public.todos where not (user_id = any(keep_ids));
  delete from public.error_log where not (user_id = any(keep_ids));
  delete from public.mocks where not (user_id = any(keep_ids));
  delete from public.weekly_reviews where not (user_id = any(keep_ids));
  delete from public.subjects where not (user_id = any(keep_ids));
  delete from public.profiles where not (id = any(keep_ids));
end $$;
