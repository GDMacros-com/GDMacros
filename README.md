# GDMacros

[GDMacros](https://www.gdmacros.com) is a community catalog of Geometry Dash macros. Visitors can browse, search, favorite and download recordings for Mega Hack, xdBot and zBot. Accounts add synced favorites, submissions, notifications and private support tickets.

The public catalog lives in `data/macros.json`. Accounts, private uploads, moderation and support use Supabase. Accepted macros are published to GitHub Releases, added to the catalog and checked against the production deployment before the submission is marked accepted.

Built with Next.js 16, React 19, TypeScript and Tailwind CSS 4. The full website needs a Next.js server runtime; it is **not a static-only site**. Vercel is the current deployment target.

## Discord community

The community invite is available in the footer and on About, beneath the owner section. The About widget loads after the visitor clicks **Load Discord widget**. Invite and widget URLs live in `src/lib/site.ts`.

A modal announces the server on public browsing pages. It blocks page interaction until the visitor closes it, presses Escape, chooses Maybe later or opens the invite. The browser saves `gdmacros:discord-announcement:2026-10` when it appears, so subsequent visits skip it. Clearing site data or using another browser resets this; with local storage unavailable, it is remembered only until reload. Account, admin and support routes do not trigger it.

Apply `supabase/migrations/0022_discord_privacy_version.sql` alongside this deployment to match the updated privacy disclosure. No new environment variables are needed.

## Recording FPS

Each macro has its own required numeric `fps` value. Any positive finite rate is accepted, including decimal rates. There is no 240 FPS cap. The submission form starts blank so the submitter must provide the rate used for that recording; the API and database enforce it too.

The existing 381 catalog macros were labelled **240 FPS** when this field was introduced, as requested by the operator. This is a metadata backfill, not a conversion or independent inspection of the files. Existing pending submissions are also backfilled to 240; reviewers should correct them if necessary before publishing.

List rows show the rate at the right, above download details. Grid cards and individual download cards show it too. A level with multiple recording rates shows **Mixed FPS** in the catalog, with the exact rate beside each download. Playback should use that macro's recording rate.

## Running locally

Use Node.js 22, matching CI.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Without service credentials, you can work on the public catalog and most public pages; account and server-backed features need their configuration below.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run validate` | Validate the catalog |
| `npx tsc --noEmit` | Check TypeScript |
| `npm run test:fps` | FPS parsing, catalog propagation and backfill checks |
| `npm run test:catalog-editor` | Catalog edits, replacement validation, authorization and concurrency |
| `npm run test:mod` | Real PostgreSQL permission and migration checks using PGlite, plus application gates |

Other suites are `test:publish`, `test:migrate`, `test:translate`, `test:email`, `test:legal`, `test:admin`, `test:account`, `test:support`, `test:zbot` and `test:ads`. CI runs the test suites, catalog validation, typecheck and build for PRs and pushes to `main`. Tests use local fixtures and mocked external services; they do not send real emails or publish real macros.

## Service configuration

Set development values in your local environment and production values in the hosting dashboard. Never commit secrets. Only variables beginning with `NEXT_PUBLIC_` are intended to be exposed to browsers.

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public client key; access is still governed by database policies |
| `NEXT_PUBLIC_SITE_URL` | Auth callback origin; use the public HTTPS domain in production |
| `SUPABASE_SECRET_KEY` | Server-only storage, auth administration and email workers |
| `GITHUB_PUBLISHER_APP_ID` | GitHub App used to publish accepted macros |
| `GITHUB_PUBLISHER_PRIVATE_KEY_BASE64` | Server-only base64-encoded App private key |
| `GITHUB_PUBLISHER_INSTALLATION_ID` | Optional installation ID; otherwise resolved through the App |
| `RESEND_SUPPORT_API_KEY` | Service and support email |
| `RESEND_INBOUND_WEBHOOK_SECRET` | Verification of inbound Resend webhook requests |
| `CRON_SECRET` | Authentication for scheduled maintenance |
| `VERCEL_ANALYTICS_TOKEN` | Optional admin analytics access |
| `VERCEL_ANALYTICS_PROJECT_ID` | Optional explicit project ID; otherwise uses `VERCEL_PROJECT_ID` |
| `VERCEL_ANALYTICS_TEAM_ID` | Optional analytics team scope |

Set the Supabase Auth site URL and allowed redirect URLs for the environments you use. Configure account email templates and SMTP in Supabase, and the sending domain/inbound webhook in Resend. Inbound support mail uses `/api/email/inbound`; the forwarding destination is configured in the server-side email module.

Apply migrations in `supabase/migrations` in numeric order for a new database. Existing deployments must apply only unapplied migrations. Some migrations install scheduled cleanup using `pg_cron`; the target Supabase project must support that extension. If using SQL Editor manually, keep the Supabase CLI migration history consistent before later using `supabase db push`.

The GitHub App must have Contents write access to `GDMacros-com/GDMacros` and `GDMacros-com/GDMacros-downloads`. Publishing targets are fixed in `src/lib/github/config.ts`; they are not taken from requests. Changing them for another deployment requires a code review.

## Roles and review

| Access | User | Mod | Admin |
| --- | --- | --- | --- |
| Uploads, own account and tickets | Yes | Yes | Yes |
| Review, inspect, edit, publish and reject submissions | No | Yes | Yes |
| Submission blocks and unblocks | No | Yes | Yes |
| All support tickets, replies, closure, deletion and ticket blocks | No | Yes | Yes |
| Random quality checks | No | Yes | Yes |
| Edit or remove published macros and change last-tested dates | No | No | Yes |
| Account lookup, review activity, site status and mass email | No | No | Yes |

Roles are assigned in Supabase by the operator, not through public signup. See [Setting up moderators](docs/mod-role.md). An account with both roles retains admin access.

Uploads are private until accepted. Mega Hack and xdBot use `.gdr2`; zBot uses `.gdr`. The file-size limit is 2 MB. The site checks the format and looks up level information on the server. Reviewers can correct metadata, including FPS, while a submission is pending and publication has not started. Their recording-file inspection is separate from the submitter's declared FPS.

Publishing uploads a release asset, commits the catalog, waits for the production commit to be served, then records the result and cleans up the private upload. Failed publication can be retried from its stored state. FPS is read from the submission database row and written to the public catalog, not trusted from a publish-button request.

Support includes suggestions, broken-macro reports and level requests. Closed tickets expire after 30 days; staff can delete them earlier. Public macros remain when an account is deleted. Existing auth, storage, GitHub and email integrations must be configured for the full workflow.

## Editing the catalog

The preferred contribution path is the website's submission form. Admins can edit published macros at `/admin/macros`; moderators cannot. The editor supports shared level details, per-macro metadata, replacement files and removal, with a confirmation step. It saves through the existing GitHub publisher integration and the public site updates after deployment. Manual catalog edits are also possible through a PR. See [Published macro editor](docs/catalog-editor.md). Each level contains one or more macros:

```json
{
  "name": "Example Level",
  "creator": "LevelCreator",
  "levelId": "12345678",
  "video": "https://www.youtube.com/watch?v=VIDEO_ID",
  "macros": [
    {
      "author": "MacroAuthor",
      "recorder": "xdBot",
      "downloadType": "GitHub",
      "downloadLink": "https://github.com/OWNER/REPO/releases/download/TAG/FILE.gdr2",
      "fps": 240,
      "testedAt": "2026-10-07"
    }
  ]
}
```

Replace example values with real data. `name`, `creator`, `levelId` and the macro fields above are required. Optional level fields are `video`, `thumbnail`, `slug`, `description` and `addedAt` (`YYYY-MM-DD`). `recorder` is exactly `Mega Hack`, `xdBot` or `zBot`. A level can contain recordings with different FPS values.

Optional per-macro `testedAt` is a real `YYYY-MM-DD` date, or `null`/omitted when unknown. It is shown beside the recording FPS. New publications default to the publication date, following the operator’s upload-time testing workflow. Existing dates are backfilled from first catalog appearance in Git history; this records the upload baseline, not a new playback verification. Admins can correct or clear the date, and replacing a file does not silently update it.

Macro pages use `/macro/<level-slug>`. Slugs must be unique. Without a thumbnail override, YouTube thumbnails are used when a video is present, otherwise a generated placeholder. The catalog supports search, recorder filtering, sorting and list/grid views. Run `npm run validate` before committing.

The MediaFire migration tool remains available as `npm run migrate:mediafire`; it is an operator tool for copying old files, not a step needed to run the website. Public macro downloads currently use GitHub Releases.

## Deployment and maintenance

Connect the repository to Vercel and configure the service variables above. Keep `src/lib/site.ts` and `NEXT_PUBLIC_SITE_URL` aligned with the production domain. The publisher verifies the live deployment through `/api/version`, using the commit supplied by Vercel.

`vercel.json` schedules `/api/cron/maintenance` daily. It needs `CRON_SECRET`; inspect the admin status page and provider logs if work is stuck. Supabase has separate scheduled support-ticket cleanup.

The old GitHub Pages workflow and export configuration remain in the repository, but static hosting cannot provide the current site's authenticated routes, server actions, API endpoints or scheduled work. Use a server-capable deployment for the complete website.

The published macro editor needs no new SQL migration or environment variables. Merge and deploy, then follow [the editor rollout checks](docs/catalog-editor.md). The earlier [FPS and policy rollout](docs/fps-policy-rollout.md) still applies to deployments that have not installed migrations 020 and 021.

## Advertising, language and analytics

Ads are optional and limited to public catalog and macro pages. Configure:

```text
NEXT_PUBLIC_ADSENSE_ENABLED=true
NEXT_PUBLIC_ADSENSE_HOME_SLOT=<catalog display-ad slot>
NEXT_PUBLIC_ADSENSE_MACRO_SLOT=<macro display-ad slot>
```

The publisher ID is in the code and `public/ads.txt`. Configure and verify Google's consent message in the AdSense dashboard; the repository alone cannot prove the live CMP is published or correctly configured. Avoid enabling Auto ads if you want to preserve the coded placement limits. The ad-block reminder is dismissible and never denies catalog access.

Google Translate's widget provides the language menu. Vercel Web Analytics and Speed Insights are mounted by the application. Video thumbnails and embeds, and the About page's Lanyard/Discord content, involve browser requests to their providers. The [Privacy Policy](https://www.gdmacros.com/privacy) describes the data flows.

## Legal documents and notices

Public policies are in `src/app/terms/page.tsx` and `src/app/privacy/page.tsx`. Versions in `src/lib/legal.ts` must match `private.legal_documents` through a new migration. Updating a version does not rewrite old acceptance records or send an email. Admins can send a policy notice through the existing Legal Notices tool after the matching documents are live.

The policies describe implemented behavior, not a certification of legal compliance. Deployment-specific facts such as the operator's legal identity, processing arrangements, provider regions, backups, retention and advertising consent configuration need operator review. Do not invent those facts from the source code.

## Source map

- `data/macros.json`: public catalog
- `src/app`: public pages, account/staff routes and APIs
- `src/components`: catalog, forms and staff interface
- `src/lib/publish`: resumable publishing and catalog transformations
- `src/lib/supabase`: session-bound clients and narrowly scoped server helpers
- `src/lib/email`: transactional email and support forwarding
- `supabase/migrations`: schema, permissions, RPCs and legal versions
- `scripts`: validation, offline regression suites and migration tooling

Not affiliated with, endorsed by or connected to RobTop Games.

## Playback guide and pricing

The installation guide covers tool-specific imports and troubleshooting. Catalog files are free to download. xdBot is free, Mega Hack is paid, and zBot requires a paid key to import premade files despite offering free recording/playback of your own run. The guide links to the tool authors’ documentation and store pages.
