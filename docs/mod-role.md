# Setting up moderators

The `mod` role adds submission review, support tickets and random quality checks to normal user access. It does not grant admin access.

| Tool | User | Mod | Admin |
| --- | --- | --- | --- |
| Normal uploads, catalog and own tickets | Yes | Yes | Yes |
| Review, edit, inspect, download, publish or reject submissions | No | Yes | Yes |
| Submission blocks and unblocks | No | Yes | Yes |
| Read and reply to all support tickets | No | Yes | Yes |
| Resolve, close or permanently delete tickets | No | Yes | Yes |
| Block/unblock new support tickets | No | Yes | Yes |
| Random quality checks and their history | No | Yes | Yes |
| Review activity page | No | No | Yes |
| Account lookup, statistics and mass email | No | No | Yes |
| Grant/revoke roles | No | No | Supabase SQL Editor only |

Rejecting a submission removes its active row and starts the existing upload cleanup. Accepting uses the existing publishing flow, including bulk publishing. It does not grant a separate ability to remove already published catalog entries. Ticket deletion removes the transcript, related notifications and queued email jobs; the button asks for confirmation. Closing or resolving instead retains the existing 30-day deletion period.

## 1. Open the pull request

Open the supplied comparison link, keep **base: main**, and click **Create pull request**. Wait for CI to pass. Review the changed files before merging.

The safest rollout order is **database migration → merge/deploy → grant mod**. The migration remains compatible with the current admin-only website. If you have already merged, apply the migration before assigning any mods or using the new delete-ticket button.

## 2. Apply the database migration

1. Open the Supabase dashboard and select the project used by GDMacros.
2. Open **SQL Editor → New query**.
3. Open `supabase/migrations/0019_mod_role.sql` in this PR. Click **Raw**, then copy the entire file.
4. Paste it into the SQL Editor and click **Run**. Run the complete file, including `begin;` and `commit;`.
5. Confirm there is no error. This migration expects the existing schema through `0018`. If it reports a missing table, function or constraint, stop and check which earlier migrations your project has applied. Do not replay all old migrations against a live database.
6. Run this verification query. Both results must be `true`:

```sql
select
  to_regprocedure('private.can_moderate()') is not null as mod_check_installed,
  to_regprocedure('public.delete_support_ticket(uuid)') is not null as ticket_delete_installed;
```

If you normally manage this project with the Supabase CLI, use your usual migration workflow instead of running the same migration manually. A manual SQL Editor run does not add an entry to the CLI migration history. Keep that history consistent before using `supabase db push` later.

The migration also advances the privacy version to match the disclosure of mod access and early ticket deletion. It does not send a mass email.

No environment variables, API keys or hosting settings need changing for this role. Existing publishing, storage and email integrations still need their existing configuration.

## 3. Merge and deploy

1. Merge the PR into `main` after CI passes and the migration succeeds.
2. Open the connected Vercel project and wait for the deployment for that merge commit to show **Ready**.
3. If automatic deployment is disabled, deploy that commit through your existing deployment process.
4. Confirm the production domain is serving the new deployment before granting roles.

## 4. Assign a moderator

1. Have the person create a normal GDMacros account and finish choosing their username.
2. Open `supabase/snippets/grant-mod-role.sql` in GitHub and copy the whole file.
3. In Supabase **SQL Editor → New query**, paste it.
4. Replace `REPLACE_WITH_USERNAME` with their site username. Do not use their Discord name or email.
5. Click **Run**. Confirm the results show the expected username with role `mod`.
6. Ask them to reload the website. They should see **Staff portal** and exactly three tools: **Check submissions**, **Support inbox**, and **Random quality check**.

The grant script refuses an existing admin account because adding `mod` would not downgrade it. An account with both roles still has full admin permissions. Do not remove your own admin role while setting this up.

## 5. Check the live setup

Use a separate ordinary account and a mod account; do not test as your owner account.

1. As the ordinary user, upload a disposable valid test macro and open a test support ticket.
2. As the mod, inspect and edit the submission, then reject it with a reason. Check the user's result notification and configured email delivery.
3. For a macro you actually intend to publish, test accepting it. Acceptance writes a real release asset and catalog commit, so do not publish junk just to test the button. Verify the normal deploy completes and then finish the review.
4. Reply to the ticket as the mod. The user should see **GDMacros mod** and a reply notification. Reply as the user and check the mod's notification.
5. Resolve the ticket and verify the closure notification. Use another disposable ticket to test permanent deletion.
6. Record a quality check and verify it appears in the history.
7. Still signed in as the mod, open `/admin/users`, `/admin/notices`, `/admin/status` and `/admin/activity` directly. Each must return a 404. A normal user must also get a 404 for the three moderation tools.
8. Sign in as your admin account and confirm all seven tools remain available.

## Removing mod access

Run this in the SQL Editor, replacing the username. It removes only `mod` and returns the removed row. Zero returned rows means there was no matching mod grant.

```sql
delete from public.user_roles r
using public.profiles p
where r.user_id = p.id
  and p.username_lower = lower('REPLACE_WITH_USERNAME')
  and r.role = 'mod'
returning p.username, r.role;
```

Permissions are checked against the database on each new action. A stale browser may still display a button until refreshed, but it cannot authorize another moderation request after the role is removed. Previously issued short-lived download URLs can remain valid until they expire (currently 120 seconds); revocation does not cancel work already in progress.

## Verification included in the PR

`npm run test:mod` applies all migrations to an isolated PostgreSQL engine using PGlite. It tests anonymous, user, mod, admin and dual-role accounts, direct database access, role escalation attempts, publishing, ticket notifications, deletion, quality checks and role revocation. Auth identity and storage tables are local fixtures; the scheduled cleanup registration is stubbed because PGlite cannot run pg_cron workers.

The other repository tests cover publishing, email, accounts, support and input validation. CI also typechecks and builds the website. These checks do not contact production Supabase, GitHub publishing, Vercel or Resend. Complete the live checks above to verify those integrations. No test suite can guarantee that software has zero vulnerabilities.
