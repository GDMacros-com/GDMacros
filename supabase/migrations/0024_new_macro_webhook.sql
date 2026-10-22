-- Transactional outbox: only future accepted publications enqueue announcements.
begin;
create table public.macro_announcement_jobs (
  submission_id uuid primary key,
  level_id text not null,
  macro_author text not null,
  created_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  lease_id uuid,
  attempts integer not null default 0,
  sent_at timestamptz
);
alter table public.macro_announcement_jobs enable row level security;
revoke all on public.macro_announcement_jobs from public, anon, authenticated;
grant all on public.macro_announcement_jobs to service_role;

create function private.enqueue_macro_announcement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.macro_announcement_jobs(submission_id, level_id, macro_author)
  values (new.submission_id, new.level_id, new.macro_author)
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.enqueue_macro_announcement() from public, anon, authenticated;
create trigger enqueue_macro_announcement after insert on public.published_submissions
for each row execute function private.enqueue_macro_announcement();

create function public.claim_macro_announcement(p_submission_id uuid default null)
returns setof public.macro_announcement_jobs
language sql security definer set search_path = '' as $$
  update public.macro_announcement_jobs
  set lease_id = gen_random_uuid(), attempts = attempts + 1,
      available_at = now() + interval '5 minutes'
  where submission_id = (
    select submission_id from public.macro_announcement_jobs
    where sent_at is null and available_at <= now()
      and (p_submission_id is null or submission_id = p_submission_id)
    order by created_at for update skip locked limit 1
  ) returning *;
$$;
revoke all on function public.claim_macro_announcement(uuid) from public, anon, authenticated;
grant execute on function public.claim_macro_announcement(uuid) to service_role;
commit;
