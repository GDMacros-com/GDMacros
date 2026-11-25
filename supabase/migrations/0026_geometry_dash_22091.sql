-- Apply before enabling uploads on the 2.2091 site.
begin;

alter table public.submissions add column game_version text
  check (game_version is null or game_version = '2.2091');

alter table public.submissions
  drop constraint if exists submissions_recorder_check;
alter table public.submissions
  add constraint submissions_recorder_check
    check (recorder in ('xdBot', 'Mega Hack', 'zBot', 'Silicate', 'Eclipse'));

alter table public.submission_notifications
  drop constraint if exists submission_notification_recorder_check;
alter table public.submission_notifications
  add constraint submission_notification_recorder_check
    check (recorder is null or recorder in ('xdBot', 'Mega Hack', 'zBot', 'Silicate', 'Eclipse'));

alter table public.published_submissions
  drop constraint if exists published_submission_recorder_check;
alter table public.published_submissions
  add constraint published_submission_recorder_check
    check (recorder in ('xdBot', 'Mega Hack', 'zBot', 'Silicate', 'Eclipse'));

alter table private.macro_quality_checks
  drop constraint if exists macro_quality_checks_recorder_check;
alter table private.macro_quality_checks
  add constraint macro_quality_checks_recorder_check
    check (recorder in ('xdBot', 'Mega Hack', 'zBot', 'Silicate', 'Eclipse'));

drop function public.create_submission(uuid, text, text, text, text, text, text, text, integer, double precision);
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
  p_fps           double precision,
  p_game_version  text
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

  if p_game_version is distinct from '2.2091' then
    raise exception 'confirm game version 2.2091';
  end if;
  if p_recorder is null or p_recorder not in ('Mega Hack', 'zBot', 'Silicate', 'Eclipse') then
    raise exception 'unsupported recorder';
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
    video_url, recorder, macro_author, notes, file_size, fps, game_version
  ) values (
    p_id, v_uid, p_level_name, p_level_id, p_level_creator,
    p_video_url, p_recorder, p_macro_author, p_notes, p_file_size, p_fps, p_game_version
  );

  return p_id;
end;
$$;
revoke all on function public.create_submission(uuid, text, text, text, text, text, text, text, integer, double precision, text) from public, anon;
grant execute on function public.create_submission(uuid, text, text, text, text, text, text, text, integer, double precision, text) to authenticated;

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
#variable_conflict use_column
declare
  v_game_version text;
  v_recorder text;
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  select s.game_version, s.recorder into v_game_version, v_recorder
    from public.submissions s
   where s.id = p_id
     and s.status = 'processing'
   for update;

  if not found then
    raise exception 'not found or not being processed';
  end if;

  -- An already-committed legacy publication can only finish its existing
  -- checkpoints. New asset and catalog writes require a confirmed upload.
  if v_game_version is distinct from '2.2091' then
    if not exists (
      select 1 from private.submission_publish_state ps
      where ps.submission_id = p_id and ps.state in ('catalog_committed', 'live_verified')
    ) then
      raise exception 'unconfirmed game version';
    end if;
  elsif v_recorder = 'xdBot' then
    raise exception 'unsupported recorder';
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
commit;
