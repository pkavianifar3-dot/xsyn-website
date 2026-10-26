-- DESTRUCTIVE rollback: deletes ONLY the XSYN feature data below.
-- Requires separate approval and a private backup first.
-- Target must be xsyn-platform-test / awfnvhlytiwckkkwfgbc.
-- Leaves auth.users, emails, SMTP, existing public site and other objects alone.
-- No CASCADE: unknown dependent objects cause a safe transaction failure.
begin;
drop trigger xsyn_bootstrap_profile on auth.users;
drop table public.xsyn_follows;
drop table public.xsyn_profile_private;
drop table public.xsyn_profiles;
drop function xsyn_internal.bootstrap_profile();
drop function xsyn_internal.touch_updated_at();
drop schema xsyn_internal;
commit;
