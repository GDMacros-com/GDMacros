-- Run in the Supabase SQL Editor after migration 0019.
-- Replace REPLACE_WITH_USERNAME with the account's exact site username.
-- This adds mod only; it never grants admin or removes an existing role.
begin;
do $$
declare
  v_username text := 'REPLACE_WITH_USERNAME';
  v_user uuid;
begin
  select id into v_user from public.profiles
    where username_lower = lower(btrim(v_username));
  if v_user is null then
    raise exception 'No account with username %. Ask them to finish signup first.', v_username;
  end if;
  if exists (select 1 from public.user_roles where user_id = v_user and role = 'admin') then
    raise exception 'That account is already an admin. Granting mod would not remove admin access.';
  end if;
  insert into public.user_roles (user_id, role) values (v_user, 'mod')
    on conflict (user_id, role) do nothing;
end;
$$;
commit;

select p.username, r.role
from public.user_roles r join public.profiles p on p.id = r.user_id
where r.role = 'mod'
order by p.username;
