-- Apply before deploying FPS support. Pause submissions during the rollout:
-- old clients deliberately cannot submit without an explicit recording rate.
begin;

alter table public.submissions add column fps double precision not null default 240;
alter table public.submissions alter column fps drop default;
alter table public.submissions add constraint submission_fps_valid
  check (fps > 0 and fps < 'Infinity'::double precision);

drop function public.create_submission(uuid, text, text, text, text, text, text, text, integer);
create or replace function public.create_submission(
  p_id            uuid,
  p_level_name    text,
  p_level_id      text,
  p_level_creator text,
  p_video_url     text,
  p_recorder      text,
  p_macro_author  text,
  p_notes         text,
  p_file_size     integer,
  p_fps           double precision
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'choose a username first';
  end if;

  -- The message is deliberately the same one the visitor sees, and says
  -- nothing about why or for how long.
  if private.is_submission_banned() then
    raise exception 'submission ban';
  end if;

  if not private.submission_object_exists(v_uid, p_id) then
    raise exception 'no uploaded file for this submission';
  end if;

  insert into public.submissions (
    id, submitted_by, level_name, level_id, level_creator,
    video_url, recorder, macro_author, notes, file_size, fps
  ) values (
    p_id, v_uid, p_level_name, p_level_id, p_level_creator,
    p_video_url, p_recorder, p_macro_author, p_notes, p_file_size, p_fps
  );

  return p_id;
end;
$$;
revoke all on function public.create_submission(uuid, text, text, text, text, text, text, text, integer, double precision) from public, anon;
grant execute on function public.create_submission(uuid, text, text, text, text, text, text, text, integer, double precision) to authenticated;

create or replace function private.freeze_submission_fields()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  -- Set only by public.admin_update_submission, and only after it has verified
  -- the caller is an admin and that publishing has not begun.
  v_editing boolean := coalesce(
    current_setting('gdmacros.content_edit', true), ''
  ) = 'on';
begin
  -- storage_path is deliberately NOT compared: it is a generated column, so in
  -- a BEFORE trigger NEW holds null for it rather than the computed value. It
  -- is derived from submitted_by and id, both frozen here, and Postgres forbids
  -- writing a generated column directly, so it is protected either way.
  --
  -- Always frozen, flag or no flag. None of these is a "detail" a reviewer
  -- corrects: reassigning a submission, rewriting the submitter's notes or
  -- restating the file's size would each be a different thing entirely.
  if new.id           is distinct from old.id
  or new.submitted_by is distinct from old.submitted_by
  or new.notes        is distinct from old.notes
  or new.file_size    is distinct from old.file_size
  or new.created_at   is distinct from old.created_at
  then
    raise exception 'submission content is immutable';
  end if;

  -- Frozen unless an admin correction is in progress.
  if not v_editing then
    if new.level_name    is distinct from old.level_name
    or new.level_id      is distinct from old.level_id
    or new.level_creator is distinct from old.level_creator
    or new.video_url     is distinct from old.video_url
    or new.fps          is distinct from old.fps
    or new.recorder      is distinct from old.recorder
    or new.macro_author  is distinct from old.macro_author
    then
      raise exception 'submission content is immutable';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop function public.admin_update_submission(uuid, text, text, text, text, text, text);
create or replace function public.admin_update_submission(
  p_id            uuid,
  p_level_name    text default null,
  p_level_id      text default null,
  p_level_creator text default null,
  p_video_url     text default null,
  p_recorder      text default null,
  p_macro_author  text default null,
  p_fps           double precision default null
)
  returns table (
    id uuid,
    level_name text,
    level_id text,
    level_creator text,
    video_url text,
    recorder text,
    macro_author text,
    status text
  )
  language plpgsql
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  v_status text;
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  -- The lock is the concurrency boundary shared with start_processing's
  -- pending -> processing UPDATE. Do not split this check from the lock.
  select s.status into v_status
    from public.submissions s
   where s.id = p_id
     for update;

  if v_status is null then
    raise exception 'not found';
  end if;

  if v_status <> 'pending' then
    raise exception 'this submission can no longer be edited';
  end if;

  if exists (
    select 1
      from private.submission_publish_state ps
     where ps.submission_id = p_id
  ) then
    raise exception 'publishing has already started, so the details are fixed';
  end if;

  -- This transaction-local flag opens the narrow exception in
  -- private.freeze_submission_fields() for this update only.
  perform set_config('gdmacros.content_edit', 'on', true);

  update public.submissions s
     set level_name    = coalesce(nullif(trim(p_level_name), ''), s.level_name),
         level_id      = coalesce(nullif(trim(p_level_id), ''), s.level_id),
         level_creator = case
                           when p_level_creator is null then s.level_creator
                           when trim(p_level_creator) = '' then null
                           else trim(p_level_creator)
                         end,
         video_url     = case
                           when p_video_url is null then s.video_url
                           when trim(p_video_url) = '' then null
                           else trim(p_video_url)
                         end,
         fps           = coalesce(p_fps, s.fps),
         recorder      = coalesce(nullif(trim(p_recorder), ''), s.recorder),
         macro_author  = coalesce(nullif(trim(p_macro_author), ''), s.macro_author),
         updated_at    = now()
   where s.id = p_id;

  perform set_config('gdmacros.content_edit', 'off', true);

  return query
  select s.id, s.level_name, s.level_id, s.level_creator,
         s.video_url, s.recorder, s.macro_author, s.status
    from public.submissions s
   where s.id = p_id;
end;
$$;
revoke all on function public.admin_update_submission(uuid, text, text, text, text, text, text, double precision) from public, anon;
grant execute on function public.admin_update_submission(uuid, text, text, text, text, text, text, double precision) to authenticated;

drop function public.begin_publish(uuid);
create or replace function public.begin_publish(p_id uuid)
  returns table (
    submission_id uuid,
    level_name text,
    level_id text,
    level_creator text,
    video_url text,
    recorder text,
    fps double precision,
    macro_author text,
    storage_path text,
    submitted_by uuid,
    state text,
    release_id bigint,
    release_tag text,
    asset_id bigint,
    asset_name text,
    asset_url text,
    asset_sha256 text,
    catalog_commit_sha text,
    attempts integer
  )
  language plpgsql
  security definer
  set search_path = ''
as $$
-- This function RETURNS TABLE, so every output column name is also a PL/pgSQL
-- variable in scope: `state`, `submission_id`, `attempts` and the rest. Any
-- unqualified use of one of those names inside the body would be ambiguous, and
-- by default PL/pgSQL raises that as a RUNTIME error the first time the
-- statement executes, which is exactly the kind of failure that passes every
-- static check and then breaks the feature.
--
-- Every reference below is table-qualified, so this directive changes nothing
-- today. It is here so that a later edit which forgets to qualify one resolves
-- to the column, which is always what is meant in this function, instead of
-- silently comparing an output variable against itself.
#variable_conflict use_column
declare
  v_exists boolean;
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  select true into v_exists
    from public.submissions s
   where s.id = p_id
     and s.status = 'processing';

  if v_exists is not true then
    raise exception 'not found or not being processed';
  end if;

  insert into private.submission_publish_state as ps (submission_id)
  values (p_id)
  on conflict (submission_id) do update
     set attempts = ps.attempts + 1,
         updated_at = now();

  return query
  select s.id,
         s.level_name,
         s.level_id,
         s.level_creator,
         s.video_url,
         s.recorder,
         s.fps,
         s.macro_author,
         s.storage_path,
         s.submitted_by,
         ps2.state,
         ps2.release_id,
         ps2.release_tag,
         ps2.asset_id,
         ps2.asset_name,
         ps2.asset_url,
         ps2.asset_sha256,
         ps2.catalog_commit_sha,
         ps2.attempts
    from public.submissions s
    join private.submission_publish_state ps2 on ps2.submission_id = s.id
   where s.id = p_id;
end;
$$;
revoke all on function public.begin_publish(uuid) from public, anon;
grant execute on function public.begin_publish(uuid) to authenticated;

commit;
