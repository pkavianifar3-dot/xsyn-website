begin;

create table public.xsyn_member_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  presence_mode text not null default 'auto'
    check (presence_mode in ('auto', 'busy', 'away'))
);

alter table public.xsyn_member_preferences enable row level security;
alter table public.xsyn_member_preferences force row level security;
revoke all on public.xsyn_member_preferences from public, anon, authenticated;
grant select on public.xsyn_member_preferences to authenticated;
grant insert (user_id, presence_mode), update (user_id, presence_mode)
  on public.xsyn_member_preferences to authenticated;

create policy xsyn_preferences_read_self on public.xsyn_member_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy xsyn_preferences_insert_self on public.xsyn_member_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy xsyn_preferences_update_self on public.xsyn_member_preferences
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

commit;
