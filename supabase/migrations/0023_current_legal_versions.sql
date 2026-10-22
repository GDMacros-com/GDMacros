-- Remove advertising disclosures and disclose public acceptance announcements.
begin;
update private.legal_documents
set version = '2026-10-22', effective_date = '2026-10-22', updated_at = now()
where doc = 'terms';
update private.legal_documents
set version = '2026-10-22', effective_date = '2026-10-22', updated_at = now()
where doc = 'privacy';
commit;
