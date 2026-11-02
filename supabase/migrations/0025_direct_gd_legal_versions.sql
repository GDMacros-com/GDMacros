-- Direct Geometry Dash lookups; existing acceptances and submissions are unchanged.
begin;
update private.legal_documents
set version = '2026-11-02', effective_date = '2026-11-02', updated_at = now()
where doc = 'terms';
update private.legal_documents
set version = '2026-11-02', effective_date = '2026-11-02', updated_at = now()
where doc = 'privacy';
commit;
