-- Mods may manage submissions, support tickets and quality checks only.
-- Apply after 0018. Existing admin-only functions keep private.is_admin().
begin;

alter table public.user_roles drop constraint user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin', 'mod'));

create or replace function private.can_moderate()
  returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role in ('admin', 'mod')
  );
$$;
revoke all on function private.can_moderate() from public, anon;
grant execute on function private.can_moderate() to authenticated;

alter policy "read your own submissions, or all as an admin" on public.submissions
  using ((select auth.uid()) = submitted_by or private.can_moderate());
alter policy "read your support tickets, or all as admin" on public.support_tickets
  using ((delete_after is null or delete_after > now())
    and ((select auth.uid()) = opened_by or private.can_moderate()));
alter policy "read messages in your support tickets, or all as admin" on public.support_ticket_messages
  using (exists (select 1 from public.support_tickets t
    where t.id = ticket_id and (t.delete_after is null or t.delete_after > now())
      and (t.opened_by = (select auth.uid()) or private.can_moderate())));

alter table public.support_ticket_messages drop constraint support_ticket_messages_author_role_check;
alter table public.support_ticket_messages add constraint support_ticket_messages_author_role_check
  check (author_role in ('user', 'admin', 'mod'));


create or replace function public.start_processing(p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  update public.submissions
     set status = 'processing',
         processing_by = (select auth.uid()),
         processing_started_at = now()
   where id = p_id
     and status = 'pending';

  if not found then
    raise exception 'not found or already being handled';
  end if;
end;
$$;

create or replace function public.release_processing(p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_state text;
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  select ps.state into v_state
    from private.submission_publish_state ps
   where ps.submission_id = p_id;

  if v_state is not null and v_state <> 'not_started' then
    raise exception 'publishing has already started for this submission';
  end if;

  update public.submissions
     set status = 'pending',
         processing_by = null,
         processing_started_at = null
   where id = p_id
     and status = 'processing';

  if not found then
    raise exception 'not found or not being processed';
  end if;

  -- A row that never got past not_started carries no useful history.
  delete from private.submission_publish_state
   where submission_id = p_id
     and state = 'not_started';
end;
$$;

create or replace function public.finish_processing(p_id uuid)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_path         text;
  v_owner        uuid;
  v_name         text;
  v_level_id     text;
  v_macro_author text;
  v_recorder     text;
  v_state        text;
  v_download_url text;
  v_notification uuid;
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  -- Lock the submission first. Two finalisers cannot both pass this point, and
  -- every value copied into the durable ledger comes from trusted database
  -- state rather than from the browser.
  select s.storage_path, s.submitted_by, s.level_name, s.level_id,
         s.macro_author, s.recorder
    into v_path, v_owner, v_name, v_level_id, v_macro_author, v_recorder
    from public.submissions s
   where s.id = p_id
     and s.status = 'processing'
   for update;

  if v_path is null then
    raise exception 'not found or not being processed';
  end if;

  -- Lock and verify the durable publish checkpoint before recording acceptance.
  select ps.state, ps.asset_url
    into v_state, v_download_url
    from private.submission_publish_state ps
   where ps.submission_id = p_id
   for update;

  if v_state is distinct from 'live_verified' then
    raise exception 'not published yet';
  end if;

  -- History and notification are deliberately written BEFORE the live row is
  -- removed. They are still in this transaction, so any later failure rolls
  -- them back together with the deletion.
  insert into public.published_submissions (
    submission_id, user_id, level_name, level_id,
    macro_author, recorder, download_url
  ) values (
    p_id, v_owner, v_name, v_level_id,
    v_macro_author, v_recorder, v_download_url
  );

  insert into public.submission_notifications (
    user_id, submission_id, level_name, level_id,
    macro_author, recorder, outcome
  ) values (
    v_owner, p_id, v_name, v_level_id,
    v_macro_author, v_recorder, 'accepted'
  )
  returning id into v_notification;

  delete from public.submissions s
   where s.id = p_id
     and s.status = 'processing';

  if not found then
    raise exception 'not found or not being processed';
  end if;

  return jsonb_build_object(
    'storage_path', v_path,
    'notification_id', v_notification
  )::text;
end;
$$;

create or replace function public.reject_submission(p_id uuid, p_reason text)
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_reason       text := btrim(coalesce(p_reason, ''));
  v_path         text;
  v_owner        uuid;
  v_name         text;
  v_level_id     text;
  v_macro_author text;
  v_recorder     text;
  v_notification uuid;
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  if char_length(v_reason) < 3 then
    raise exception 'a rejection reason is required';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'that reason is too long';
  end if;

  delete from public.submissions s
   where s.id = p_id
     and s.status = 'pending'
  returning s.storage_path, s.submitted_by, s.level_name, s.level_id,
            s.macro_author, s.recorder
       into v_path, v_owner, v_name, v_level_id, v_macro_author, v_recorder;

  if v_path is null then
    raise exception 'not found or already reviewed';
  end if;

  insert into public.submission_notifications (
    user_id, submission_id, level_name, level_id,
    macro_author, recorder, outcome, rejection_reason
  ) values (
    v_owner, p_id, v_name, v_level_id,
    v_macro_author, v_recorder, 'rejected', v_reason
  )
  returning id into v_notification;

  return jsonb_build_object(
    'storage_path', v_path,
    'notification_id', v_notification
  )::text;
end;
$$;

create or replace function public.ban_submission_email(p_email text, p_reason text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_user   uuid;
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'that does not look like an email address';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'a reason of 3 to 500 characters is required';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = v_email;

  -- An administrator cannot be banned from submitting. Removing the role is a
  -- separate, deliberate act, and this stops a mistake locking out an owner.
  if v_user is not null and exists (
    select 1 from public.user_roles r where r.user_id = v_user and r.role = 'admin'
  ) then
    raise exception 'that account is an administrator';
  end if;

  -- Aliased, because ON CONFLICT DO UPDATE refers to the existing row by
  -- relation name or alias rather than by a schema-qualified name.
  insert into private.submission_bans as existing (email_lower, user_id, reason, banned_by)
  values (v_email, v_user, v_reason, (select auth.uid()))
  on conflict (email_lower) do update
    set reason    = excluded.reason,
        banned_by = excluded.banned_by,
        -- Never lose an id already recorded, but fill one in if the account
        -- has been created since the ban was first written.
        user_id   = coalesce(existing.user_id, excluded.user_id);
end;
$$;

create or replace function public.unban_submission_email(p_email text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  delete from private.submission_bans where email_lower = v_email;

  if not found then
    raise exception 'that address is not banned';
  end if;
end;
$$;

create or replace function public.list_submission_bans()
  returns table (
    email_lower text,
    reason      text,
    created_at  timestamptz,
    banned_by_username text,
    has_account boolean
  )
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  return query
    select b.email_lower,
           b.reason,
           b.created_at,
           coalesce(p.username, 'unknown'),
           b.user_id is not null
    from private.submission_bans b
    left join public.profiles p on p.id = b.banned_by
    order by b.created_at desc;
end;
$$;

create or replace function public.begin_publish(p_id uuid)
  returns table (
    submission_id uuid,
    level_name text,
    level_id text,
    level_creator text,
    video_url text,
    recorder text,
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

create or replace function public.record_publish_intent(
  p_id           uuid,
  p_release_id   bigint,
  p_release_tag  text,
  p_asset_name   text,
  p_asset_sha256 text
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  update private.submission_publish_state
     set release_id = p_release_id,
         release_tag = p_release_tag,
         asset_name = p_asset_name,
         asset_sha256 = p_asset_sha256,
         updated_at = now()
   where submission_id = p_id
     and state = 'not_started';

  if not found then
    raise exception 'no publish state for that submission, or it has already progressed';
  end if;
end;
$$;

create or replace function public.record_publish_asset(
  p_id       uuid,
  p_release_id bigint,
  p_release_tag text,
  p_asset_id bigint,
  p_asset_name text,
  p_asset_url text,
  p_asset_sha256 text
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  update private.submission_publish_state
     set release_id = p_release_id,
         release_tag = p_release_tag,
         asset_id = p_asset_id,
         asset_name = p_asset_name,
         asset_url = p_asset_url,
         asset_sha256 = p_asset_sha256,
         state = case when state = 'not_started' then 'asset_uploaded' else state end,
         last_error = null,
         last_error_stage = null,
         updated_at = now()
   where submission_id = p_id;

  if not found then
    raise exception 'no publish state for that submission';
  end if;
end;
$$;

create or replace function public.record_publish_commit(p_id uuid, p_commit_sha text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  update private.submission_publish_state
     set catalog_commit_sha = p_commit_sha,
         state = case when state in ('not_started', 'asset_uploaded')
                      then 'catalog_committed' else state end,
         last_error = null,
         last_error_stage = null,
         updated_at = now()
   where submission_id = p_id;

  if not found then
    raise exception 'no publish state for that submission';
  end if;
end;
$$;

create or replace function public.record_publish_live(p_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  update private.submission_publish_state
     set state = 'live_verified',
         last_error = null,
         last_error_stage = null,
         updated_at = now()
   where submission_id = p_id
     and state = 'catalog_committed';

  if not found then
    raise exception 'not ready to be marked live';
  end if;
end;
$$;

create or replace function public.record_publish_error(
  p_id uuid,
  p_stage text,
  p_error text
)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  update private.submission_publish_state
     set last_error = left(coalesce(p_error, ''), 500),
         last_error_stage = left(coalesce(p_stage, ''), 60),
         updated_at = now()
   where submission_id = p_id;
end;
$$;

create or replace function public.get_publish_state(p_id uuid)
  returns table (
    state text,
    asset_name text,
    asset_url text,
    catalog_commit_sha text,
    last_error text,
    last_error_stage text,
    attempts integer,
    updated_at timestamptz
  )
  language plpgsql
  security definer
  set search_path = ''
as $$
-- Same reasoning as begin_publish: RETURNS TABLE puts every output column name
-- into scope as a variable, so resolve any ambiguity to the column.
#variable_conflict use_column
begin
  if not private.can_moderate() then
    raise exception 'not authorised';
  end if;

  return query
  select ps.state,
         ps.asset_name,
         ps.asset_url,
         ps.catalog_commit_sha,
         ps.last_error,
         ps.last_error_stage,
         ps.attempts,
         ps.updated_at
    from private.submission_publish_state ps
   where ps.submission_id = p_id;
end;
$$;

create or replace function public.admin_update_submission(
  p_id            uuid,
  p_level_name    text default null,
  p_level_id      text default null,
  p_level_creator text default null,
  p_video_url     text default null,
  p_recorder      text default null,
  p_macro_author  text default null
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

create or replace function public.add_support_ticket_message(p_ticket uuid, p_body text)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_staff boolean;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if char_length(v_body) not between 1 and 5000 then raise exception 'invalid message'; end if;
  v_staff := private.can_moderate();

  if not exists (
    select 1 from public.support_tickets t
     where t.id = p_ticket and t.status = 'open'
       and (t.opened_by = v_uid or v_staff)
  ) then
    raise exception 'ticket unavailable or closed';
  end if;
  if (select count(*) from public.support_ticket_messages m where m.ticket_id = p_ticket) >= 500 then
    raise exception 'ticket message limit';
  end if;
  if (
    select count(*) from public.support_ticket_messages m
     where m.ticket_id = p_ticket and m.author_id = v_uid
       and m.created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'message rate limit';
  end if;

  insert into public.support_ticket_messages (ticket_id, author_id, author_role, body)
  values (p_ticket, v_uid, case when private.is_admin() then 'admin' when v_staff then 'mod' else 'user' end, v_body)
  returning id into v_id;

  update public.support_tickets set updated_at = now() where id = p_ticket;
  return v_id;
end;
$$;

create or replace function public.close_support_ticket(
  p_ticket uuid,
  p_status text,
  p_reason text
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_owner uuid;
  v_number bigint;
  v_expiry timestamptz := now() + interval '30 days';
  v_notification uuid;
begin
  if not private.can_moderate() then raise exception 'not authorised'; end if;
  if v_status not in ('resolved', 'closed') then raise exception 'invalid close status'; end if;
  if char_length(v_reason) not between 3 and 500 then raise exception 'invalid close reason'; end if;

  update public.support_tickets t
     set status = v_status,
         close_reason = v_reason,
         closed_by = (select auth.uid()),
         closed_at = now(),
         delete_after = v_expiry,
         updated_at = now()
   where t.id = p_ticket and t.status = 'open'
  returning t.opened_by, t.ticket_number into v_owner, v_number;

  if v_owner is null then raise exception 'ticket not found or already closed'; end if;

  insert into public.account_notifications (
    user_id, kind, ticket_id, title, message, expires_at
  ) values (
    v_owner,
    'support_ticket_closed',
    p_ticket,
    'Support ticket #' || v_number::text || ' ' || v_status,
    'Your ticket was ' || v_status || '. The transcript is available for 30 days, then it is permanently deleted.',
    v_expiry
  ) returning id into v_notification;

  return v_notification;
end;
$$;

create or replace function public.ban_support_ticket_user(p_ticket uuid, p_reason text)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare v_uid uuid; v_id uuid;
begin
  if not private.can_moderate() then raise exception 'not authorised'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'invalid reason'; end if;
  select t.opened_by into v_uid from public.support_tickets t where t.id = p_ticket;
  if v_uid is null then raise exception 'ticket not found'; end if;
  if exists (select 1 from public.user_roles r where r.user_id = v_uid and r.role = 'admin') then
    raise exception 'cannot ban an administrator';
  end if;
  insert into private.support_ticket_bans (user_id, reason, banned_by)
  values (v_uid, btrim(p_reason), (select auth.uid()))
  on conflict (user_id) do update
    set reason = excluded.reason, banned_by = excluded.banned_by, created_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.unban_support_ticket_user(p_ban uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not private.can_moderate() then raise exception 'not authorised'; end if;
  delete from private.support_ticket_bans b where b.id = p_ban;
  return found;
end;
$$;

create or replace function public.list_support_ticket_bans()
  returns table (ban_id uuid, username text, reason text, created_at timestamptz)
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select b.id, coalesce(p.username, '(no username)'), b.reason, b.created_at
    from private.support_ticket_bans b
    left join public.profiles p on p.id = b.user_id
   where private.can_moderate()
   order by b.created_at desc;
$$;

create or replace function public.record_macro_quality_check(
  p_download_url text, p_level_name text, p_level_id text,
  p_macro_author text, p_recorder text, p_outcome text, p_note text
)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare v_id uuid; v_outcome text := lower(btrim(coalesce(p_outcome, '')));
begin
  if not private.can_moderate() then raise exception 'not authorised'; end if;
  if v_outcome not in ('good', 'issue') then raise exception 'invalid outcome'; end if;
  insert into private.macro_quality_checks (
    download_url, level_name, level_id, macro_author, recorder, outcome, note, checked_by
  ) values (
    btrim(p_download_url), btrim(p_level_name), btrim(p_level_id), btrim(p_macro_author),
    btrim(p_recorder), v_outcome, nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid())
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_macro_quality_checks(p_limit integer default 20)
  returns table (
    check_id uuid, download_url text, level_name text, level_id text,
    macro_author text, recorder text, outcome text, note text,
    checked_by_username text, created_at timestamptz
  )
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select q.id, q.download_url, q.level_name, q.level_id, q.macro_author, q.recorder,
         q.outcome, q.note, coalesce(p.username, 'Admin'), q.created_at
    from private.macro_quality_checks q
    left join public.profiles p on p.id = q.checked_by
   where private.can_moderate()
   order by q.created_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

create or replace function private.queue_support_ticket_reply_notification()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_owner uuid;
  v_number bigint;
  v_ticket_title text;
  v_author_username text;
begin
  select t.opened_by, t.ticket_number, t.title
    into v_owner, v_number, v_ticket_title
    from public.support_tickets t
   where t.id = new.ticket_id;

  if v_owner is null then return new; end if;

  -- The first message opens the ticket. It is already represented by the admin
  -- inbox and is not a reply to an existing conversation.
  if not exists (
    select 1
      from public.support_ticket_messages m
     where m.ticket_id = new.ticket_id and m.id <> new.id
  ) then
    return new;
  end if;

  -- Replying proves the author has seen the conversation. Hide their previous
  -- alert for this ticket; a later response from the other side resurfaces it.
  if new.author_id is not null then
    update public.account_notifications n
       set read_at = coalesce(n.read_at, now()),
           dismissed_at = coalesce(n.dismissed_at, now())
     where n.user_id = new.author_id
       and n.ticket_id = new.ticket_id
       and n.kind = 'support_ticket_reply';
  end if;

  if new.author_role in ('admin', 'mod') then
    -- An admin replying to their own support ticket must not notify themselves.
    if new.author_id is distinct from v_owner then
      insert into public.account_notifications as n (
        user_id, kind, ticket_id, title, message, expires_at
      ) values (
        v_owner,
        'support_ticket_reply',
        new.ticket_id,
        'New reply on support ticket #' || v_number::text,
        'GDMacros staff replied to “' || v_ticket_title || '”.',
        null
      )
      on conflict (user_id, ticket_id, kind) do update
        set title = excluded.title,
            message = excluded.message,
            read_at = null,
            dismissed_at = null,
            expires_at = null,
            created_at = excluded.created_at;
    end if;
  else
    select coalesce(p.username, 'The ticket owner') into v_author_username
      from public.profiles p where p.id = new.author_id;

    insert into public.account_notifications as n (
      user_id, kind, ticket_id, title, message, expires_at
    )
    select distinct
      r.user_id,
      'support_ticket_reply',
      new.ticket_id,
      'New reply on support ticket #' || v_number::text,
      coalesce(v_author_username, 'The ticket owner') || ' replied to “' || v_ticket_title || '”.',
      null::timestamptz
    from public.user_roles r
    where r.role in ('admin', 'mod') and r.user_id is distinct from new.author_id
    on conflict (user_id, ticket_id, kind) do update
      set title = excluded.title,
          message = excluded.message,
          read_at = null,
          dismissed_at = null,
          expires_at = null,
          created_at = excluded.created_at;
  end if;

  return new;
end;
$$;

-- Ticket deletion also removes its messages, notifications and queued emails
-- through the existing foreign keys. No direct table-write grant is added.
create or replace function public.delete_support_ticket(p_ticket uuid)
  returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_moderate() then raise exception 'not authorised'; end if;
  delete from public.support_tickets where id = p_ticket;
  return found;
end;
$$;
revoke all on function public.delete_support_ticket(uuid) from public, anon;
grant execute on function public.delete_support_ticket(uuid) to authenticated;

-- Match the privacy page's disclosure of moderator access and ticket deletion.
update private.legal_documents
   set version = '2026-10-05',
       effective_date = '2026-10-05',
       updated_at = now()
 where doc = 'privacy';

commit;
