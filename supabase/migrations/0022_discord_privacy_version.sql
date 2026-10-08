-- Record the privacy disclosure for the Discord widget and announcement preference.
begin;

update private.legal_documents
   set version = '2026-10-08', effective_date = '2026-10-08', updated_at = now()
 where doc = 'privacy';

do $$ begin
  if not exists (
    select 1 from private.legal_documents
     where doc = 'privacy' and version = '2026-10-08' and effective_date = '2026-10-08'
  ) then
    raise exception 'privacy document version was not updated';
  end if;
end; $$;
commit;
