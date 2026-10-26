# GDMacros

[GDMacros](https://www.gdmacros.com) is a community catalog of Geometry Dash macros for **Mega Hack, xdBot and zBot**. Browsing and downloading are free and do not require an account. Accounts add synced favorites, submissions, notifications and private support tickets.

This README describes the source tree reviewed on **26 October 2026**. It documents implemented behavior; it does not confirm which migrations or credentials have been applied to production.

## Architecture and current API status

The site uses Next.js 16, React 19, TypeScript and Tailwind CSS 4. Vercel is the current deployment target. Public catalog and author pages are generated from repository data; accounts, staff tools, server actions and API routes require a Next.js server runtime.

| Component | Responsibility | Source |
| --- | --- | --- |
| Public catalog | Level details, macro credits, recording FPS, tested dates and download links | `data/macros.json`, `src/lib/macros.ts`, `src/lib/types.ts` |
| Website | Catalog browsing, download pages, public author profiles and account/staff UI | `src/app`, `src/components` |
| Supabase | Authentication, profiles, roles, favorites, private uploads, review state, tickets, notifications and job queues | `src/lib/supabase`, `supabase/migrations` |
| GitHub | Catalog commits in `GDMacros-com/GDMacros` and public release assets in `GDMacros-com/GDMacros-downloads` | `src/lib/github`, `src/lib/publish` |
| Resend | Service email, submission results, ticket notifications, notices and inbound support forwarding | `src/lib/email` |
| Discord | Community links, optional widget and announcements for newly accepted macros | `src/lib/site.ts`, `src/lib/publish/announcement.ts` |

The public catalog is stored in Git, rather than a Supabase catalog table. Editing it requires a new deployment before public pages reflect the change. Public downloads currently point to GitHub Releases.

**The read-only public catalog API lives under `/api/v1` in this Next.js project.** It includes `/levels`, `/levels/{levelId}`, `/macros` and `/stats`; list routes accept `search`, `recorder`, `fps`, `page` and `limit` (default 20, maximum 100). Levels are alphabetical and recordings retain catalog order. Level filters select matching levels and return all recordings for each match; recording filters return only matching recordings. API results update with website deployments, with a five-minute CDN cache and up to one minute of stale revalidation. Responses expose only public catalog fields and download URLs; files remain hosted externally. Individual recordings do not yet have permanent API identifiers.

Configure production abuse controls through Vercel Firewall: match `/api/v1` and `/api/v1/*`, exclude `OPTIONS`, and use the agreed 60 requests per IP per 60-second fixed window with HTTP 429 responses. The application itself does not enforce a shared per-client quota. Run `npm run test:api` for API regression checks. Full developer documentation is deferred. The existing application endpoints remain separate from the public API. No Cloudflare Worker or DNS migration is required.

## Features and routes

| Area | Routes and behavior |
| --- | --- |
| Catalog | `/`: search by level, creator, macro author or level ID; recorder filters; alphabetical/date sorting; list/grid views; random selection; recently viewed levels |
| Download pages | `/macro/[slug]`: a level's available recordings, individual FPS/tested dates, credits, download links, optional video and neighboring levels |
| Public author profiles | `/author/[slug]`: credited recordings, level totals and recorder totals, generated from catalog author names |
| Favorites | `/favorites`: browser-local while signed out and account-synced while signed in; keyed by level ID |
| Guides and information | `/about`, `/install`, `/faq`, `/guidelines`, `/terms`, `/privacy` |
| Authentication | `/signup`, `/login`, `/welcome`, `/forgot-password`, `/reset-password`; confirmation/callback/error routes under `/auth` |
| Account | `/account`: account details and username changes; `/settings`: submission-result email preferences and account deletion |
| Submissions | `/submit` and `/submissions`: private uploads, review progress and accepted submission history |
| Notifications | `/notifications`: submission results and support activity |
| Support | `/support`, `/support/new`, `/support/tickets/[id]`: suggestions, requests and broken-macro conversations |
| Staff | `/admin` and the role-restricted tools listed below |

Author profiles represent catalog credits, not verified ownership of a site account. Names are grouped case-insensitively with Unicode normalization; slug collisions are disambiguated. Account/settings pages link to a matching catalog credit when available. Changing an account username does not rewrite published catalog credits.

Favorites, recent history, sort/view preferences and other presentation settings use browser storage. Favorites merge by union on sign-in: an item removed while signed out can reappear if it remains in the account copy. Recent history is device-local and keeps six entries. See `src/lib/favorites.ts` and `src/lib/localStore.ts` for storage and synchronization rules.

## Local development

Use **Node.js 22**, matching CI, and npm.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. The public catalog can be developed without service credentials; accounts and server-backed integrations need the configuration below. Create an untracked `.env.local` for local credentials. There is no committed environment template.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Add server-only variables only for integrations you intend to exercise. Local publishing is not a sandbox: configured GitHub publishing targets the fixed production repositories. Automated regression suites use fixtures and mocked services instead.

To run a production build locally:

```sh
npm run build
npm start
```

## Service configuration

Set development values in `.env.local` and production values in the hosting dashboard. Only `NEXT_PUBLIC_*` variables are intended for browser exposure. Never commit private keys, webhook URLs or server credentials.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/session client key; database permissions and RLS still govern access |
| `NEXT_PUBLIC_SITE_URL` | Fallback auth redirect origin; browser flows normally use the current origin |
| `SUPABASE_SECRET_KEY` | Server-only private storage, auth administration, email queues and announcement jobs |
| `GITHUB_PUBLISHER_APP_ID` | GitHub App used by publication and the catalog editor |
| `GITHUB_PUBLISHER_PRIVATE_KEY_BASE64` | Base64-encoded PEM private key for that App |
| `GITHUB_PUBLISHER_INSTALLATION_ID` | Optional; otherwise resolved through the App |
| `RESEND_SUPPORT_API_KEY` | Sending service email and retrieving/forwarding received support mail |
| `RESEND_INBOUND_WEBHOOK_SECRET` | Signature verification for inbound Resend webhooks |
| `NEW_MACRO_WEBHOOK` | Server-only Discord incoming webhook for newly accepted macros |
| `CRON_SECRET` | Bearer authentication for scheduled maintenance |
| `VERCEL_ANALYTICS_TOKEN` | Optional token for the admin traffic panel |
| `VERCEL_ANALYTICS_PROJECT_ID` | Optional explicit project ID; otherwise uses `VERCEL_PROJECT_ID` |
| `VERCEL_ANALYTICS_TEAM_ID` | Optional analytics team scope |

Vercel supplies deployment metadata through `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF` and `VERCEL_ENV`. Publication checks the production commit through `/api/version`; it does not require a Vercel API token. `VERCEL_PROJECT_ID` is also used as an analytics fallback.

### Supabase setup

1. For a new database, apply all 24 SQL migrations in `supabase/migrations` in numeric order, through `0024_new_macro_webhook.sql`. Existing deployments must apply only unapplied migrations, following any migration-specific rollout requirements.
2. Configure the Supabase Auth site URL and redirect allow list for production, localhost and any permitted preview origins. Confirmation and password-reset templates must point to the application's auth routes. The expected confirmation-link pattern is documented in `src/lib/supabase/config.ts`.
3. Configure Supabase Auth email templates and SMTP separately from the application's Resend API integration.
4. Use the role snippets in `supabase/snippets` to assign staff access. Public signup cannot assign roles.

Migrations create the private `macro-submissions` storage bucket, database policies, RPCs and job queues. Some install scheduled cleanup through `pg_cron`; the target project must support that extension. A manual SQL Editor run does not update Supabase CLI migration history. Keep that history consistent before later using `supabase db push`.

Historical rollout guides remain in [Moderator setup](docs/mod-role.md) and [FPS and policy rollout](docs/fps-policy-rollout.md). Their release-specific dates and tool counts describe those releases. Use this README, the current source and the latest migrations for the present feature set. In particular, the current Terms and Privacy versions in `src/lib/legal.ts` are both `2026-10-22`, synchronized by migration 0023.

### GitHub publishing setup

Install the GitHub App with **Contents write** access to both `GDMacros-com/GDMacros` and `GDMacros-com/GDMacros-downloads`. Repository rules must permit its catalog commits to `main`. Targets are fixed in `src/lib/github/config.ts`; a request cannot choose a repository, branch or catalog path.

### Email setup

Configure the sending domain and Resend API permissions for service email. Configure received support mail to call `POST /api/email/inbound` and set its signing secret. The forwarding address, destination and loop-prevention rules live in `src/lib/email/support.ts`; the destination is code configuration, not an environment variable. Auth email uses Supabase's separately configured SMTP path.

## Submissions, review and publishing

Uploads remain private until accepted. The server checks the authenticated user/profile, validates fields and replay structure, looks up level metadata through GDBrowser, and verifies a supplied YouTube video. Search/verification use GDBrowser and YouTube without an API key. YouTube search depends on upstream page structure; the form also supports pasted video links verified through oEmbed.

| Recorder | Upload extension | Maximum file size |
| --- | --- | --- |
| Mega Hack | `.gdr2` | 2 MiB (`2 * 1024 * 1024` bytes; shown as 2 MB in the UI) |
| xdBot | `.gdr2` | 2 MiB |
| zBot | `.gdr` | 2 MiB |

Each submission requires explicit positive, finite recording FPS, including decimal rates. The form starts blank and there is no 240 FPS cap. Declared recording FPS is separate from staff replay inspection and playback testing.

Staff claim a submission for processing, inspect/download it, correct metadata while publication has not started, and reject it with a reason or publish it. Single and bulk publication use the same resumable pipeline:

1. Reserve publication state and freeze submission details.
2. Publish/reuse the recording as a GitHub Release asset.
3. Commit the updated catalog, handling concurrent changes.
4. Wait until the production `/api/version` reports the expected commit.
5. Finalize acceptance, record history/notifications, attempt private-upload cleanup, and attempt queued email and Discord delivery.

Publication progress survives failures and can be resumed by staff. A catalog commit alone does not mean acceptance is complete. Inspect the staff status and hosting logs when a job is waiting for production. The maintenance cron retries delivery jobs; it does not run the full publication pipeline.

## Staff access

| Tool or capability | User | Mod | Admin |
| --- | --- | --- | --- |
| Own account, uploads and tickets | Yes | Yes | Yes |
| `/admin/submissions`: review, inspect, edit, publish, reject; submission blocks | No | Yes | Yes |
| `/admin/inbox`: all tickets, replies, closure, deletion and ticket blocks | No | Yes | Yes |
| `/admin/quality`: random quality checks and history | No | Yes | Yes |
| `/admin/macros`: edit/remove published recordings, replace files and change tested dates | No | No | Yes |
| `/admin/activity`: review activity | No | No | Yes |
| `/admin/users`: exact-username account lookup and account tools | No | No | Yes |
| `/admin/status`: service health, operational counts and traffic statistics | No | No | Yes |
| `/admin/notices`: preview/test/send Terms, Privacy or service notices | No | No | Yes |

Permissions are enforced in server actions/routes and database policies, not just hidden buttons. An account with both roles retains admin access. Role grants/revocation are operator SQL tasks, not public UI features. See [Moderator setup](docs/mod-role.md) and the snippets in `supabase/snippets`.

## Editing the public catalog

The preferred contribution path is the website submission form. Admins can maintain existing recordings at `/admin/macros`; reviewed manual catalog commits are also supported.

The editor can change shared level details or individual recording metadata, replace a file, remove a recording, and set/clear its tested date. Saves require review/confirmation and use the current GitHub blob SHA to detect conflicting edits. Its success message confirms the commit; public changes appear after deployment. See [Published macro editor](docs/catalog-editor.md).

`data/macros.json` contains an array of levels:

```json
[
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
]
```

Replace example values before use. The schema and loader live in `src/lib/types.ts` and `src/lib/macros.ts`.

- Required level fields: `name`, `creator`, `levelId`, and at least one recording in `macros`.
- Required recording fields: `author`, `recorder`, `downloadType`, `downloadLink`, and numeric `fps` greater than zero.
- `recorder` is exactly `Mega Hack`, `xdBot` or `zBot`. A level can have several recordings and different rates; the UI shows **Mixed FPS** where appropriate.
- Optional level fields: `video`, `thumbnail`, `slug`, `description`, `addedAt` (`YYYY-MM-DD`). `addedAt` drives recently added/date ordering; undated levels are kept separate from dated entries.
- Optional recording field: `testedAt`, a real `YYYY-MM-DD` date, or `null`/omitted when unknown. The editor disallows future dates. Replacing a file or editing unrelated metadata preserves the date unless explicitly changed.
- Page slugs default to a normalized level name and must be unique. Preserve existing slugs when renaming levels to avoid breaking links. Favorites use level IDs, while recent history uses slugs.
- Without a thumbnail override, YouTube stills are used when a video exists; otherwise the UI renders a placeholder.
- The loader retains support for legacy flat single-recording entries and ignores wholly blank template entries. New entries should use the `macros` array.

The initial 381-recording FPS backfill labelled recordings as 240 FPS; it did not convert or independently inspect files. Historical tested dates were derived from first catalog appearance in Git history as an upload baseline, not a new playback check. New publications default to publication day under the operator's upload-time testing workflow. Correct or clear dates that do not represent a completed check.

Removing a recording changes the catalog. Removing the last recording also removes its level page after deployment. Old release assets, public copies and Git history remain. Replacement uploads use new content-addressed asset names and do not overwrite/delete the old files. Revert an incorrect catalog commit and redeploy to undo an edit.

Run `npm run validate` before committing catalog changes.

## Existing HTTP endpoints

These are application endpoints, not a supported public developer API. Most account/staff mutations also use Next.js server actions in `src/lib/actions` and session-bound Supabase RPCs.

| Method and path | Purpose and access |
| --- | --- |
| `GET /api/version` | Public, uncached deployment commit/ref/environment metadata used by the publisher |
| `GET /api/search?kind=level\|video\|verify&q=...` | Signed-in submission-form level/video lookup; 20 searches/minute/account per server instance |
| `POST /api/submissions` | Authenticated multipart replay submission; requires a profile and configured private storage |
| `GET /api/admin/macros` | Admin-only current GitHub catalog and revision |
| `POST /api/admin/macros` | Admin-only confirmed catalog mutation; checks matching Origin and current revision |
| `POST /api/email/inbound` | Signed Resend incoming-mail webhook |
| `GET /api/cron/maintenance` | Requires `Authorization: Bearer <CRON_SECRET>` |

For search, `kind` is one of `level`, `video` or `verify`. The search limiter is in-memory and per instance; cold starts reset it and parallel instances do not share counters. It is not a global API quota. See `src/lib/rateLimit.ts`.

## Deployment and maintenance

Connect the source repository to Vercel and deploy with the default Next.js build. Configure production service variables and keep `src/lib/site.ts`'s canonical URL, Supabase Auth redirects and `NEXT_PUBLIC_SITE_URL` aligned with the intended domain.

`vercel.json` schedules maintenance with `0 4 * * *` (daily at 04:00 UTC). The authenticated route drains submission-result email, support-ticket email and macro-announcement queues and purges expired support tickets. Supabase also has scheduled ticket cleanup. Closed/resolved tickets expire after 30 days; staff can delete them earlier. Account deletion requires a typed confirmation and withdrawal of submissions still in review; administrator accounts cannot self-delete through this tool. Published catalog recordings remain available.

The manually triggered `.github/workflows/deploy-pages.yml` and `NEXT_OUTPUT=export` / `NEXT_BASE_PATH` configuration are retained legacy static-export tooling. They do not provide the server runtime required by the current app; the full website is not deployable as a static-only GitHub Pages site. Some older configuration comments still describe the former static architecture.

### Discord announcements

Apply migration 0024 and set `NEW_MACRO_WEBHOOK` to enable announcements. Acceptance queues a job transactionally after production verification; single/bulk publishing attempt delivery immediately and maintenance retries failures. Existing historical acceptances are not backfilled.

Announcements link to the macro's website page and include level name/ID and macro author. Private notes and emails are excluded. The payload mentions role `1562871482961371257` and disables other role/user/everyone mentions. Jobs use leases, but Discord provides no idempotency key: losing a delivery confirmation can cause a duplicate on retry. Missing configuration skips delivery attempts.

The community invite and widget URLs are in `src/lib/site.ts`. The About widget loads on click. The Discord announcement modal appears on selected public pages and records `gdmacros:discord-announcement:2026-10` when shown; clearing browser data allows it to appear again. It skips account, staff and support flows.

## Verification and operator tooling

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run build` | Production build |
| `npm start` | Serve a production build |
| `npm run validate` | Validate catalog structure and metadata |
| `npx tsc --noEmit` | TypeScript check |
| `npm run test:publish` | Resumable publisher and catalog transformations |
| `npm run test:announcements` | Discord payloads, configuration and delivery behavior |
| `npm run test:catalog-editor` | Catalog edits, replacement validation, authorization and conflicts |
| `npm run test:mod` | PostgreSQL permissions/migrations through PGlite plus application access gates |
| `npm run test:fps` | FPS parsing, propagation and backfill checks |
| `npm run test:zbot` | zBot format/catalog behavior |
| `npm run test:account` | Account and favorites behavior |
| `npm run test:admin` | Staff portal and admin behavior |
| `npm run test:support` | Ticket inbox, notifications and staff tools |
| `npm run test:email` | Support email forwarding |
| `npm run test:legal` | Policies, version synchronization and notices |
| `npm run test:translate` | Language-switcher behavior |
| `npm run test:migrate` | MediaFire migration tooling regression checks |
| `npm run migrate:mediafire -- --status` | Inspect local migration state; an operator tool, not app setup |

CI (`.github/workflows/ci.yml`) runs catalog validation, typecheck, build and all regression suites on pull requests and pushes to `main`. There is no configured linter, default `npm test` or `test:all` command. Tests use local fixtures/mocks; `test:mod` applies migrations to PGlite with auth/storage fixtures and stubbed cron registration. Tests do not send real mail, post to Discord or publish live recordings. Passing them does not verify production provider configuration.

The MediaFire migration script can inventory, upload, verify and report on old downloads. It keeps resumable local state under ignored `.migration/` and can perform real network uploads. Inspect the script's actual command dispatch before use; it is not needed for normal development or publishing.

## Privacy, policies and external services

The application mounts Vercel Web Analytics and Speed Insights. Google Translate supplies the language widget. YouTube thumbnails/embeds and Lanyard/Discord content involve third-party browser requests; submission lookups use server-side upstream requests. The [Privacy Policy](https://www.gdmacros.com/privacy) describes these flows.

Policy source lives in `src/app/terms/page.tsx` and `src/app/privacy/page.tsx`. Keep versions in `src/lib/legal.ts` synchronized with `private.legal_documents` through a new migration when policies change. Version changes do not rewrite old acceptance records or send email automatically. Admins can preview, test and send notices from `/admin/notices` after the matching documents are live. Provider regions, retention outside the application and operator identity require deployment-specific review.

The installation guide documents tool-specific importing and troubleshooting. Catalog downloads are free; playback-tool availability and pricing are separate. Consult the linked tool authors' documentation for current installation and licensing details.

## Source map

| Path | Contents |
| --- | --- |
| `data/macros.json` | Public catalog and recording metadata |
| `src/app` | Pages, HTTP routes, auth handlers, sitemap and robots |
| `src/components` | Catalog, account, submission, staff and support UI |
| `src/lib/macros.ts`, `types.ts`, `authors.ts` | Catalog loading/schema and public author indexes |
| `src/lib/favorites.ts`, `favoritesRules.ts`, `localStore.ts` | Favorites sync and device-local storage |
| `src/lib/actions` | Account, staff, review, support, publishing and notice server actions |
| `src/lib/supabase` | Session clients and scoped privileged server helpers |
| `src/lib/github`, `src/lib/publish` | GitHub App access, release assets, catalog publication and announcements |
| `src/lib/catalog-editor.ts` | Published catalog mutation and validation rules |
| `src/lib/gdr.ts`, `gdr2.ts`, `gdr2Review.ts`, `fps.ts` | Replay validation, inspection and FPS rules |
| `src/lib/gdbrowser.ts`, `youtube.ts` | Submission metadata lookups and video verification |
| `src/lib/email` | Email transports, templates, forwarding and queues |
| `src/lib/site.ts`, `legal.ts`, `admin.ts` | Branding/links, policy versions and role checks |
| `src/proxy.ts` | Session refresh on selected account/staff/support routes |
| `supabase/migrations`, `supabase/snippets` | Ordered schema changes and operator role/username SQL |
| `scripts` | Catalog validation, regression suites and migration operator tooling |
| `docs` | Detailed moderator, FPS/policy and catalog-editor rollout guides |
| `.github/workflows` | CI and legacy manual Pages deployment |
| `public` | Static assets and verification files |

Repository software is available under the [MIT license](LICENSE). Not affiliated with, endorsed by or connected to RobTop Games.
