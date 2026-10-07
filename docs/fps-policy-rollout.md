# FPS and policy rollout

This release adds recording FPS and updates the README, Terms, Privacy Policy, guidelines and playback instructions. Both policy versions become `2026-10-06`.

## Before merging

1. Wait for the PR tests and build to pass.
2. Finish any publication already in progress. Do not accept submissions during the database/app transition.
3. In Supabase SQL Editor, run the whole of `supabase/migrations/0020_recording_fps.sql` once. It expects migrations through `0019`. It backfills existing submission rows to 240 and makes new submissions require explicit FPS. Old deployed forms cannot submit until the new code is live; schedule a brief maintenance window.
4. Merge and wait for the matching Vercel production deployment to show Ready. Do not roll back the app alone: the old create-submission RPC is intentionally removed to prevent missing FPS.
5. Run `supabase/migrations/0021_current_legal_versions.sql` as soon as the new policy pages are live. This synchronises the versions stamped on new signup records. Keep signup paused during this short version transition if you need exact version alignment. The migration does not modify past acceptance records or send email.
6. If you normally use the Supabase CLI, apply these migrations through that workflow and coordinate the same rollout; do not also run them manually.

Check the versions:

```sql
select doc, version, effective_date
from private.legal_documents
order by doc;
```

Both should show `2026-10-06`. No new credentials or environment variables are needed.

## Live checks

- Existing catalog entries show 240 FPS; the backfill labels recordings and does not modify the files.
- On desktop, the row badge appears on the right above the download details. On mobile it remains visible without horizontal scrolling.
- Submit a disposable valid macro at a non-240 rate (for example 360 or 59.94). The FPS field must start blank and reject missing, zero and negative rates.
- Confirm the pending submission shows that rate to its owner and to staff. As a mod, correct the FPS while pending. Start publication only for a recording you actually want in the public catalog and confirm the rate survives in its catalog entry and download card.
- Confirm ordinary users cannot edit FPS through the staff action or RPC. Publishing must freeze it with the other submission details.
- If a level has differing rates, its row should say Mixed FPS and its download cards should show the individual rates.
- Check guidelines and installation instructions no longer claim every future macro must use 240 FPS.

## Policy notice

Send one combined Terms/Privacy update through the admin Legal Notices tool once both pages and database versions match. This is recommended because the changes clarify moderator access, uploaded-file metadata, browser/provider requests and retention, as well as adding public recording FPS. The PR does not send mail and does not treat an email as renewed agreement.

Explain those changes in your own notice, link `/terms` and `/privacy`, send a test to yourself, then use the existing preview/confirmation flow. If applicable law requires renewed agreement or a notice period, arrange that before making the relevant change effective; the notice tool alone does not collect renewed consent.

The source review cannot verify the production AdSense CMP, hosting regions, provider logs/backups, controller identity or contractual transfer arrangements. Review those deployment facts separately before treating the privacy text as a complete compliance review.

Rights wording was checked against the [European Commission’s explanation of individual data-protection rights](https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en). This does not verify deployment-specific compliance.
