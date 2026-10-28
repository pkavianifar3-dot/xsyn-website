begin;
select set_config('xsyn.test_a', gen_random_uuid()::text, true);
select set_config('xsyn.test_b', gen_random_uuid()::text, true);
insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at)
select current_setting(setting)::uuid, 'authenticated', 'authenticated',
  'xsyn-preferences-' || current_setting(setting) || '@example.test', now(), now(), now()
from unnest(array['xsyn.test_a', 'xsyn.test_b']) as setting;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('xsyn.test_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.xsyn_member_preferences(presence_mode) values ('busy');
insert into public.xsyn_member_preferences(user_id, presence_mode)
values (auth.uid(), 'away') on conflict (user_id) do update set presence_mode = excluded.presence_mode;
do $$
begin
  if (select presence_mode from public.xsyn_member_preferences where user_id = auth.uid()) <> 'away'
    then raise exception 'Owner upsert failed'; end if;
  begin
    insert into public.xsyn_member_preferences(user_id) values (current_setting('xsyn.test_b')::uuid);
    raise exception 'Forged identity accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.xsyn_member_preferences set presence_mode = 'invalid' where user_id = auth.uid();
    raise exception 'Invalid presence accepted';
  exception when check_violation then null; end;
  begin
    update public.xsyn_member_preferences set user_id = current_setting('xsyn.test_b')::uuid;
    raise exception 'Identity mutation accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('xsyn.test_b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare affected integer;
begin
  if exists (select 1 from public.xsyn_member_preferences) then raise exception 'B read A preferences'; end if;
  update public.xsyn_member_preferences set presence_mode = 'auto'
    where user_id = current_setting('xsyn.test_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'B modified A preferences'; end if;
end $$;
insert into public.xsyn_member_preferences(presence_mode) values ('auto');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('xsyn.test_a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.xsyn_member_preferences) <> 1 then raise exception 'A read B preferences'; end if;
  if not exists(select 1 from public.xsyn_member_preferences where user_id = auth.uid() and presence_mode = 'away')
    then raise exception 'A preferences changed'; end if;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.xsyn_member_preferences;
    raise exception 'Anonymous read allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'XSYN_PREFS_RLS_PASS' as result;
rollback;
