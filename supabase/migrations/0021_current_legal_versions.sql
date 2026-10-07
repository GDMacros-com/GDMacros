-- Mirror the public document versions for new signup acceptance records.
begin;

update private.legal_documents
   set version = '2026-10-06', effective_date = '2026-10-06', updated_at = now()
 where doc = 'terms';

update private.legal_documents
   set version = '2026-10-06', effective_date = '2026-10-06', updated_at = now()
 where doc = 'privacy';

do $$ begin
  if (select count(*) from private.legal_documents where doc in ('terms', 'privacy') and version = '2026-10-06' and effective_date = '2026-10-06') <> 2 then
    raise exception 'legal document versions were not updated';
  end if;
end; $$;
commit;
