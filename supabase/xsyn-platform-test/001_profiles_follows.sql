-- REVIEW ONLY. Target: xsyn-platform-test / awfnvhlytiwckkkwfgbc.
-- Verify the project in the Supabase dashboard before executing the ENTIRE file.
-- SQL Editor cannot reliably infer the dashboard project name. This comment is NOT
-- an automatic project-identity check. Never run this in any other project.
-- First-run migration, deliberately not IF NOT EXISTS: collisions fail atomically.
begin;

create schema xsyn_internal;
revoke all on schema xsyn_internal from public, anon, authenticated;

create table public.xsyn_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  bio text not null default '' check (char_length(bio) <= 500),
  is_listed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.xsyn_profiles is
  'Opt-in public identity only. No email, roles, credentials or private notes.';
comment on column public.xsyn_profiles.is_listed is
  'False by default. Owner can read their row; other users/anon only listed rows.';

create table public.xsyn_profile_private (
  user_id uuid primary key references public.xsyn_profiles(user_id) on delete cascade,
  private_note text not null default '' check (char_length(private_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.xsyn_profile_private is
  'Owner-only test data. Auth email stays exclusively in auth.users.';

create table public.xsyn_follows (
  follower_id uuid not null default auth.uid()
    references public.xsyn_profiles(user_id) on delete cascade,
  followee_id uuid not null references public.xsyn_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint xsyn_no_self_follow check (follower_id <> followee_id)
);
comment on table public.xsyn_follows is
  'Private following list. Only the follower may read/create/delete their edges.';
create index xsyn_follows_followee_idx on public.xsyn_follows(followee_id);
create index xsyn_profiles_listed_idx on public.xsyn_profiles(created_at desc) where is_listed;

alter table public.xsyn_profiles enable row level security;
alter table public.xsyn_profile_private enable row level security;
alter table public.xsyn_follows enable row level security;

-- Strip implicit API grants, including column mutation, delete, truncate and trigger.
revoke all on public.xsyn_profiles, public.xsyn_profile_private, public.xsyn_follows
  from public, anon, authenticated;
grant select on public.xsyn_profiles to anon, authenticated;
grant update (display_name, bio, is_listed) on public.xsyn_profiles to authenticated;
grant select on public.xsyn_profile_private to authenticated;
grant update (private_note) on public.xsyn_profile_private to authenticated;
grant select, delete on public.xsyn_follows to authenticated;
grant insert (follower_id, followee_id) on public.xsyn_follows to authenticated;

create policy xsyn_profiles_read on public.xsyn_profiles for select to anon, authenticated
  using (is_listed or user_id = (select auth.uid()));
create policy xsyn_profiles_update_self on public.xsyn_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy xsyn_private_read_self on public.xsyn_profile_private for select to authenticated
  using (user_id = (select auth.uid()));
create policy xsyn_private_update_self on public.xsyn_profile_private for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy xsyn_follows_read_self on public.xsyn_follows for select to authenticated
  using (follower_id = (select auth.uid()));
create policy xsyn_follows_insert_self on public.xsyn_follows for insert to authenticated
  with check (
    follower_id = (select auth.uid())
    and exists (
      select 1 from public.xsyn_profiles as target
      where target.user_id = followee_id and target.is_listed
    )
  );
create policy xsyn_follows_delete_self on public.xsyn_follows for delete to authenticated
  using (follower_id = (select auth.uid()));
-- No INSERT/DELETE on profiles, no UPDATE on follows, no identity/timestamp writes.

create function xsyn_internal.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function xsyn_internal.touch_updated_at() from public, anon, authenticated;
create trigger xsyn_profiles_updated before update on public.xsyn_profiles
  for each row execute function xsyn_internal.touch_updated_at();
create trigger xsyn_private_updated before update on public.xsyn_profile_private
  for each row execute function xsyn_internal.touch_updated_at();

-- Identity always comes from auth.users.id, never editable user_metadata.
-- Definer privileges are needed only to bootstrap the two rows from Auth.
-- No email or auth metadata is copied into either profile table.
create function xsyn_internal.bootstrap_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.xsyn_profiles(user_id) values (new.id);
  insert into public.xsyn_profile_private(user_id) values (new.id);
  return new;
end;
$$;
revoke all on function xsyn_internal.bootstrap_profile() from public, anon, authenticated;
create trigger xsyn_bootstrap_profile after insert on auth.users
  for each row execute function xsyn_internal.bootstrap_profile();

-- Backfill existing users in THIS TEST PROJECT only; no user is made public.
insert into public.xsyn_profiles(user_id) select id from auth.users;
insert into public.xsyn_profile_private(user_id) select user_id from public.xsyn_profiles;
commit;
