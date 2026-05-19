-- Keep only one Ali profile: prefer the one that has subject data for
-- "Grundlagen der IT" with BS/KS naming. Remove other Ali duplicates.
do $$
declare
  keep_ali_id uuid;
begin
  -- Candidate priority:
  -- 1) Ali profile with at least one subject containing "grundlagen" and "it"
  --    plus BS/KS marker in subject name.
  -- 2) Otherwise newest Ali profile by updated_at.
  select p.id
    into keep_ali_id
  from public.profiles p
  left join public.subjects s on s.user_id = p.id
  where p.name = 'Ali'
  group by p.id, p.updated_at
  order by
    max(case
      when lower(coalesce(s.name, '')) like '%grundlagen%'
       and lower(coalesce(s.name, '')) like '%it%'
       and (
         lower(coalesce(s.name, '')) like '%bs%'
         or lower(coalesce(s.name, '')) like '%ks%'
       )
      then 1 else 0
    end) desc,
    max(p.updated_at) desc nulls last
  limit 1;

  if keep_ali_id is null then
    return;
  end if;

  delete from public.ai_chat_messages
   where user_id in (select id from public.profiles where name = 'Ali' and id <> keep_ali_id);
  delete from public.sessions
   where user_id in (select id from public.profiles where name = 'Ali' and id <> keep_ali_id);
  delete from public.todos
   where user_id in (select id from public.profiles where name = 'Ali' and id <> keep_ali_id);
  delete from public.error_log
   where user_id in (select id from public.profiles where name = 'Ali' and id <> keep_ali_id);
  delete from public.mocks
   where user_id in (select id from public.profiles where name = 'Ali' and id <> keep_ali_id);
  delete from public.weekly_reviews
   where user_id in (select id from public.profiles where name = 'Ali' and id <> keep_ali_id);
  delete from public.subjects
   where user_id in (select id from public.profiles where name = 'Ali' and id <> keep_ali_id);
  delete from public.profiles
   where name = 'Ali' and id <> keep_ali_id;
end $$;
