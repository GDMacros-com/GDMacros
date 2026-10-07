# Published macro editor

## Rollout

1. Merge this PR after CI passes and wait for the Vercel production deployment to become Ready.
2. No new SQL is needed. Keep the existing Supabase and GitHub publisher configuration. The GitHub App needs Contents write access to the source and downloads repositories, and must be allowed to commit `data/macros.json` on `main` under the repository's rules.
3. Sign in as an admin and open **Admin → Edit published macros** (`/admin/macros`). Select a recording, edit, choose **Review changes**, then **Save changes**. Level details apply to every recording on that level; macro fields affect only the selected recording. Keep the URL slug unless an intentional URL change is needed.
4. Wait for the deployment created by the catalog commit. Check the affected public page while signed out. The editor's success message confirms the GitHub commit, not completion of deployment. If a deployment fails, inspect the hosting logs; the commit remains in GitHub.
5. Check a moderator account: the editor card is absent and `/admin/macros` is inaccessible. Both API methods independently require an admin role. Existing moderator submission, ticket and random-quality-check permissions remain available.

Use test accounts and a disposable catalog entry for a live write smoke test. Do not casually change a real macro just to exercise a button. Automated tests use fake services and never publish to the live site.

## Dates and file handling

`testedAt` is optional public macro metadata, stored in the catalog rather than Supabase. The owner specified that testing happens at upload. This release initializes the 381 existing recordings from the date their level/author/recorder combination first appeared in Git history, and new publications use publication day. Historical import/conversion commits are only an upload-date baseline; they are not evidence of a fresh playback test. Correct or clear any date that does not represent a completed check. Blank dates are not displayed.

Changing unrelated metadata or replacing a file preserves the previous tested date. After completing a playback check, explicitly update that date. Dates must be real, not in the future. All existing FPS values and level descriptions are preserved by this release.

Replacement files use the same 2 MB limit and replay format checks as submissions. They receive content-addressed asset names in the existing downloads repository; the catalog points to the new URL. A failed commit can leave an uploaded asset available for retry. Old files are not deleted or overwritten. A direct HTTPS download URL can also be edited without uploading.

**Remove from catalog** removes only the selected recording. If it is the last one on a level, the level page disappears after deployment. Existing release assets, public copies and Git history remain; this is not an erasure tool. Revert the relevant catalog commit through a reviewed GitHub change if an edit must be undone, then redeploy.

## Permission and concurrency design

The API checks the authenticated user's current admin role, rather than accepting a role or user ID from the request. POST additionally requires a matching Origin and explicit confirmation. Fresh role checks run again before committing. Requests cannot choose the repository, branch or file path. Inputs are validated on both client and server; the server is authoritative.

The editor reads the current catalog from GitHub and sends its blob SHA back with a change. A stale SHA or conflicting GitHub commit returns 409 and requires reload/review. This protects changes made by other admins and by the submission publisher. A network failure can leave the save outcome uncertain; reload before retrying. There is a narrow interval between the final role check and the external GitHub commit, as with other cross-service operations.

## Guide sources reviewed October 7, 2026

- [Geode installation](https://geode-sdk.org/install) and [manual mod installation FAQ](https://geode-sdk.org/faq).
- [Mega Hack installation](https://absolllute.com/how-to-install) and [official store](https://absolllute.com/store/mega-hack).
- [zBot source](https://github.com/FigmentBoy/zBot), including the paid `key` gate around replay import in `src/gui.cpp`, and [official store](https://zbot.figmentcoding.me/).
- [Original xdBot repository](https://github.com/ZiLko/xdBot), archived June 25, 2025. Existing MediaFire community-build links are retained with a maintenance/compatibility qualification; they are not labelled as verified current builds.

About, FAQ, home and footer copy now reflect free downloads, paid playback tools where applicable, accounts, advertising where enabled and GitHub hosting without promising permanent availability. The Terms and Privacy Policy were reviewed: their existing publication, moderation, third-party hosting, retention and advertising disclosures cover this change. No additional personal data collection or legal-version update is introduced here.

These improvements do not guarantee AdSense approval. After deployment, review the public pages and request another review only when the site accurately reflects the service being provided.
