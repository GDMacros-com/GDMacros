begin;

create or replace function private.capture_trial_mod_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.event in ('rejected', 'accepted', 'details_edited', 'publish_not_started', 'publish_live_verified') then
    perform private.enqueue_trial_mod_log(new.actor_id, new.event, new.submission_id::text, new.level_name, new.detail);
  end if;
  return new;
end;
$$;

-- Keep older app instances working during the rollout without queuing views.
create or replace function public.log_trial_mod_view(
  p_actor uuid, p_action text, p_target text, p_level text, p_detail text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  return;
end;
$$;

delete from public.trial_mod_log_jobs
where action not in (
  'rejected', 'accepted', 'details_edited', 'publish_not_started', 'publish_live_verified',
  'quality_check_good', 'quality_check_issue'
);

commit;
