begin;

alter table public.user_roles drop constraint user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin', 'mod', 'trial_mod'));

create function public.can_manage_staff_roles() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and username_lower = 'chesszdc'
  );
$$;

create function public.list_staff_roles()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(staff) order by lower(staff.username), staff.user_id), '[]'::jsonb)
  from (
    select r.user_id, p.username, array_agg(r.role order by r.role) as roles
    from public.user_roles r left join public.profiles p on p.id = r.user_id
    where public.can_manage_staff_roles()
    group by r.user_id, p.username
  ) staff;
$$;

create function public.set_staff_role(p_user_id uuid, p_expected text[], p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_roles text[];
begin
  if not public.can_manage_staff_roles() then raise exception 'not authorised'; end if;
  if p_user_id = (select auth.uid()) then raise exception 'the owner role is protected'; end if;
  if p_role is not null and p_role not in ('trial_mod', 'mod', 'admin') then
    raise exception 'invalid staff role';
  end if;

  -- Serialize updates for this account, including users without role rows yet.
  perform 1 from auth.users where id = p_user_id for update;
  if not found then raise exception 'account not found'; end if;
  select coalesce(array_agg(role order by role), '{}') into v_roles
  from public.user_roles where user_id = p_user_id;
  if v_roles is distinct from p_expected then raise exception 'roles changed; reload the account'; end if;

  delete from public.user_roles where user_id = p_user_id and role is distinct from p_role;
  if p_role is not null then
    insert into public.user_roles(user_id, role) values (p_user_id, p_role) on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.can_manage_staff_roles(), public.list_staff_roles(),
  public.set_staff_role(uuid, text[], text) from public, anon;
grant execute on function public.can_manage_staff_roles(), public.list_staff_roles(),
  public.set_staff_role(uuid, text[], text) to authenticated;

create function private.is_trial_mod(p_actor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles where user_id = p_actor and role = 'trial_mod')
    and not exists (select 1 from public.user_roles where user_id = p_actor and role in ('admin', 'mod'));
$$;
revoke all on function private.is_trial_mod(uuid) from public, anon, authenticated;

create function private.can_review_submissions() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_moderate() or private.is_trial_mod((select auth.uid()));
$$;
revoke all on function private.can_review_submissions() from public, anon;
grant execute on function private.can_review_submissions() to authenticated;

-- Cross-account reads for trial mods go through the application's audited tools.
grant select on public.submissions to service_role;

-- Keep sensitive reads and publishing checkpoints on the server for trial mods.
create function private.can_use_trusted_review_tools() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_moderate() or (
    current_setting('role', true) = 'service_role' and private.is_trial_mod((select auth.uid()))
  );
$$;
revoke all on function private.can_use_trusted_review_tools() from public, anon, authenticated;

-- Preserve the review and publishing implementations (including their locks,
-- validations and grants). Upgrade only the authorization in these signatures.
do $$
declare
  routine regprocedure;
  definition text;
  permission text;
begin
  for routine, permission in select * from (values
    ('public.start_processing(uuid)'::regprocedure, 'private.can_review_submissions()'),
    ('public.release_processing(uuid)'::regprocedure, 'private.can_review_submissions()'),
    ('public.reject_submission(uuid,text)'::regprocedure, 'private.can_review_submissions()'),
    ('public.admin_update_submission(uuid,text,text,text,text,text,text,double precision)'::regprocedure, 'private.can_review_submissions()'),
    ('public.get_publish_state(uuid)'::regprocedure, 'private.can_use_trusted_review_tools()'),
    ('public.list_macro_quality_checks(integer)'::regprocedure, 'private.can_use_trusted_review_tools()'),
    ('public.begin_publish(uuid)'::regprocedure, 'private.can_use_trusted_review_tools()'),
    ('public.record_publish_intent(uuid,bigint,text,text,text)'::regprocedure, 'private.can_use_trusted_review_tools()'),
    ('public.record_publish_asset(uuid,bigint,text,bigint,text,text,text)'::regprocedure, 'private.can_use_trusted_review_tools()'),
    ('public.record_publish_commit(uuid,text)'::regprocedure, 'private.can_use_trusted_review_tools()'),
    ('public.record_publish_live(uuid)'::regprocedure, 'private.can_use_trusted_review_tools()'),
    ('public.record_publish_error(uuid,text,text)'::regprocedure, 'private.can_use_trusted_review_tools()'),
    ('public.finish_processing(uuid)'::regprocedure, 'private.can_use_trusted_review_tools()')
  ) as rules(routine, permission) loop
    definition := pg_get_functiondef(routine);
    if strpos(definition, 'private.can_moderate()') = 0 then
      raise exception 'Expected moderation check in %', routine;
    end if;
    execute replace(definition, 'private.can_moderate()', permission);
  end loop;
end;
$$;

create function public.trial_mod_staff_rpc(p_actor uuid, p_operation text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := (p_args->>'p_id')::uuid;
  v_result jsonb;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
begin
  if not private.is_trial_mod(p_actor) then raise exception 'not authorised'; end if;
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  case p_operation
    when 'get_publish_state' then
      select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into v_result from public.get_publish_state(v_id) s;
    when 'list_macro_quality_checks' then
      select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc), '[]'::jsonb) into v_result
      from public.list_macro_quality_checks((p_args->>'p_limit')::integer) q;
    when 'begin_publish' then
      select jsonb_agg(to_jsonb(s)) into v_result from public.begin_publish(v_id) s;
    when 'record_publish_intent' then
      perform public.record_publish_intent(v_id, (p_args->>'p_release_id')::bigint,
        p_args->>'p_release_tag', p_args->>'p_asset_name', p_args->>'p_asset_sha256');
    when 'record_publish_asset' then
      perform public.record_publish_asset(v_id, (p_args->>'p_release_id')::bigint,
        p_args->>'p_release_tag', (p_args->>'p_asset_id')::bigint, p_args->>'p_asset_name',
        p_args->>'p_asset_url', p_args->>'p_asset_sha256');
    when 'record_publish_commit' then
      perform public.record_publish_commit(v_id, p_args->>'p_commit_sha');
    when 'record_publish_live' then
      perform public.record_publish_live(v_id);
    when 'record_publish_error' then
      perform public.record_publish_error(v_id, p_args->>'p_stage', p_args->>'p_error');
    when 'finish_processing' then
      select to_jsonb(public.finish_processing(v_id)) into v_result;
    else raise exception 'invalid publish operation';
  end case;
  perform set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
  return v_result;
end;
$$;
revoke all on function public.trial_mod_staff_rpc(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.trial_mod_staff_rpc(uuid, text, jsonb) to service_role;

-- The web server verifies current-catalog membership before recording a trial check.
create function public.record_trial_mod_quality_check(
  p_actor uuid, p_download_url text, p_level_name text, p_level_id text,
  p_macro_author text, p_recorder text, p_outcome text, p_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_trial_mod(p_actor) then raise exception 'not authorised'; end if;
  insert into private.macro_quality_checks (
    download_url, level_name, level_id, macro_author, recorder, outcome, note, checked_by
  ) values (
    p_download_url, p_level_name, p_level_id, p_macro_author, p_recorder, p_outcome, p_note, p_actor
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_trial_mod_quality_check(uuid, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_trial_mod_quality_check(uuid, text, text, text, text, text, text, text)
  to service_role;

create table public.trial_mod_log_jobs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  actor_username text not null,
  action text not null,
  target_id text,
  level_name text,
  detail text,
  created_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  lease_id uuid
);
alter table public.trial_mod_log_jobs enable row level security;
revoke all on public.trial_mod_log_jobs from public, anon, authenticated;
grant select, update, delete on public.trial_mod_log_jobs to service_role;
create index trial_mod_log_jobs_available_idx on public.trial_mod_log_jobs (available_at, created_at);

create function private.enqueue_trial_mod_log(
  p_actor uuid, p_action text, p_target text, p_level text, p_detail text
) returns void language sql security definer set search_path = '' as $$
  insert into public.trial_mod_log_jobs(actor_id, actor_username, action, target_id, level_name, detail)
  select p_actor, coalesce((select username from public.profiles where id = p_actor), p_actor::text),
    p_action, left(p_target, 100), left(p_level, 100), left(p_detail, 1000)
  where private.is_trial_mod(p_actor);
$$;
revoke all on function private.enqueue_trial_mod_log(uuid, text, text, text, text) from public, anon, authenticated;

create function private.capture_trial_mod_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.event <> 'submitted' then
    perform private.enqueue_trial_mod_log(new.actor_id, new.event, new.submission_id::text, new.level_name,
      case when new.event = 'publish_error' then null else new.detail end);
  end if;
  return new;
end;
$$;
create trigger capture_trial_mod_review after insert on private.admin_review_activity
for each row execute function private.capture_trial_mod_review();

-- Capture FPS changes through the same activity stream as other edits.
do $$
declare definition text := pg_get_functiondef('private.capture_submission_activity()'::regprocedure);
begin
  execute replace(definition, 'or old.notes is distinct from new.notes',
    'or old.notes is distinct from new.notes or old.fps is distinct from new.fps');
end;
$$;

create function private.capture_trial_mod_quality() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.enqueue_trial_mod_log(new.checked_by, 'quality_check_' || new.outcome,
    new.level_id, new.level_name, concat_ws(' · ', new.macro_author, new.recorder, new.note));
  return new;
end;
$$;
create trigger capture_trial_mod_quality after insert on private.macro_quality_checks
for each row execute function private.capture_trial_mod_quality();
revoke all on function private.capture_trial_mod_review(), private.capture_trial_mod_quality() from public, anon, authenticated;

create function public.log_trial_mod_view(p_actor uuid, p_action text, p_target text, p_level text, p_detail text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_trial_mod(p_actor) then raise exception 'not authorised'; end if;
  if p_action not in ('review_queue_viewed', 'submission_inspected', 'submission_download_requested',
    'publish_status_viewed', 'quality_macro_selected', 'quality_history_viewed') then
    raise exception 'invalid view action';
  end if;
  perform private.enqueue_trial_mod_log(p_actor, p_action, p_target, p_level, p_detail);
end;
$$;

create function public.claim_trial_mod_log(p_actor uuid default null)
returns setof public.trial_mod_log_jobs language sql security definer set search_path = '' as $$
  update public.trial_mod_log_jobs set lease_id = gen_random_uuid(), available_at = now() + interval '5 minutes'
  where id = (
    select id from public.trial_mod_log_jobs where available_at <= now() and (p_actor is null or actor_id = p_actor)
    order by created_at, id for update skip locked limit 1
  ) returning *;
$$;
revoke all on function public.log_trial_mod_view(uuid, text, text, text, text), public.claim_trial_mod_log(uuid)
  from public, anon, authenticated;
grant execute on function public.log_trial_mod_view(uuid, text, text, text, text), public.claim_trial_mod_log(uuid)
  to service_role;

commit;
