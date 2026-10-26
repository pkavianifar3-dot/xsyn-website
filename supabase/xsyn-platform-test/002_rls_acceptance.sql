-- PREPARED, NOT EXECUTED. Run only after approval in the authorized test project.
-- Replace the TWO UUID placeholders with two DIFFERENT disposable, email-verified
-- users from this project's Auth dashboard. Never use production accounts.
-- Run the whole file in one SQL Editor query as the database owner.
-- Tests use real anon/authenticated Postgres roles, NOT service_role RLS bypass.
-- Every content change is rolled back. On error, execute ROLLBACK before retrying.
begin;
select set_config('xsyn.test_a', '00000000-0000-0000-0000-00000000000a', true);
select set_config('xsyn.test_b', '00000000-0000-0000-0000-00000000000b', true);
do $$
begin
  if current_setting('xsyn.test_a') = current_setting('xsyn.test_b')
    or (select count(*) from auth.users where id in (
      current_setting('xsyn.test_a')::uuid, current_setting('xsyn.test_b')::uuid
    ) and email_confirmed_at is not null) <> 2 then
    raise exception 'Use two different verified test accounts from this project';
  end if;
  if (select count(*) from public.xsyn_profiles where user_id in (
    current_setting('xsyn.test_a')::uuid, current_setting('xsyn.test_b')::uuid
  )) <> 2 then raise exception 'Bootstrap/backfill missing'; end if;
end $$;
update public.xsyn_profiles set is_listed = true
  where user_id in (current_setting('xsyn.test_a')::uuid, current_setting('xsyn.test_b')::uuid);
update public.xsyn_profile_private set private_note = 'TEST-OWNER-ONLY'
  where user_id in (current_setting('xsyn.test_a')::uuid, current_setting('xsyn.test_b')::uuid);
delete from public.xsyn_follows
  where follower_id in (current_setting('xsyn.test_a')::uuid, current_setting('xsyn.test_b')::uuid);

select set_config('request.jwt.claims', json_build_object('sub',current_setting('xsyn.test_a'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('xsyn.test_a'),true);
set local role authenticated;
do $$
declare n integer;
begin
  if (select count(*) from public.xsyn_profile_private) <> 1 then raise exception 'A can read other private rows'; end if;
  if not exists(select 1 from public.xsyn_profile_private where user_id = auth.uid()) then raise exception 'A cannot read own private row'; end if;
  update public.xsyn_profile_private set private_note = 'A-OWN' where user_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'A cannot update own private row'; end if;
  update public.xsyn_profile_private set private_note = 'ATTACK' where user_id = current_setting('xsyn.test_b')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'A updated B private row'; end if;
  update public.xsyn_profiles set bio = 'ATTACK' where user_id = current_setting('xsyn.test_b')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'A updated B public row'; end if;
  begin
    update public.xsyn_profile_private set user_id = current_setting('xsyn.test_b')::uuid where user_id = auth.uid();
    raise exception 'Identity mutation allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.xsyn_profiles(user_id) values (current_setting('xsyn.test_b')::uuid);
    raise exception 'Profile identity insertion allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.xsyn_follows(follower_id,followee_id)
      values (current_setting('xsyn.test_b')::uuid,auth.uid());
    raise exception 'Forged follower allowed';
  exception when insufficient_privilege then null; end;
  insert into public.xsyn_follows(followee_id) values (current_setting('xsyn.test_b')::uuid);
  begin
    insert into public.xsyn_follows(followee_id) values (current_setting('xsyn.test_b')::uuid);
    raise exception 'Duplicate follow allowed';
  exception when unique_violation then null; end;
  begin
    insert into public.xsyn_follows(followee_id) values (auth.uid());
    raise exception 'Self-follow allowed';
  exception when check_violation then null; end;
  begin
    update public.xsyn_follows set followee_id = auth.uid();
    raise exception 'Follow update privilege unexpectedly allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub',current_setting('xsyn.test_b'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('xsyn.test_b'),true);
set local role authenticated;
do $$
declare n integer;
begin
  if (select count(*) from public.xsyn_profile_private) <> 1 then raise exception 'B can read other private rows'; end if;
  if exists(select 1 from public.xsyn_profile_private where user_id = current_setting('xsyn.test_a')::uuid) then raise exception 'B read A private row'; end if;
  update public.xsyn_profile_private set private_note = 'B-ATTACK' where user_id = current_setting('xsyn.test_a')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B updated A private row'; end if;
  if exists(select 1 from public.xsyn_follows where follower_id = current_setting('xsyn.test_a')::uuid) then raise exception 'B read A following'; end if;
  delete from public.xsyn_follows where follower_id = current_setting('xsyn.test_a')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B deleted A follow'; end if;
  begin
    insert into public.xsyn_follows(follower_id,followee_id)
      values(current_setting('xsyn.test_a')::uuid,auth.uid());
    raise exception 'B forged A identity';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims','{"role":"anon"}',true);
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$
begin
  if (select count(*) from public.xsyn_profiles where user_id in (
    current_setting('xsyn.test_a')::uuid,current_setting('xsyn.test_b')::uuid
  )) <> 2 then raise exception 'Anonymous public-profile read failed'; end if;
  begin
    perform private_note from public.xsyn_profile_private;
    raise exception 'Anonymous private read allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.xsyn_follows;
    raise exception 'Anonymous following read allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.xsyn_profiles set bio='ATTACK' where user_id=current_setting('xsyn.test_a')::uuid;
    raise exception 'Anonymous update allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

update public.xsyn_profiles set is_listed=false where user_id=current_setting('xsyn.test_b')::uuid;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('xsyn.test_a'),'role','authenticated')::text,true);
select set_config('request.jwt.claim.sub',current_setting('xsyn.test_a'),true);
set local role authenticated;
do $$
begin
  if exists(select 1 from public.xsyn_profiles where user_id=current_setting('xsyn.test_b')::uuid) then raise exception 'Hidden B visible to A'; end if;
  delete from public.xsyn_follows where followee_id=current_setting('xsyn.test_b')::uuid;
  if exists(select 1 from public.xsyn_follows where followee_id=current_setting('xsyn.test_b')::uuid) then raise exception 'Owner unfollow failed'; end if;
  begin
    insert into public.xsyn_follows(followee_id) values(current_setting('xsyn.test_b')::uuid);
    raise exception 'Follow of hidden target allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: two-account and anonymous RLS checks; test changes rolled back' as result;
