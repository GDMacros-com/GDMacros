# GDM Community bot: deployment and rollout

The website dashboard and Discord service ship together in this PR. Merging deploys the website; it does **not** create a Discord application, rent a VPS, put credentials on a server, or start live moderation. Complete the steps below to connect the service. Modules are disabled initially, so the bot does not begin removing members or changing roles merely because it starts.

## 1. Merge and apply the legal migration

Merge the bot PR after its CI checks pass. In Supabase SQL Editor, run `supabase/migrations/0023_discord_bot_legal_versions.sql`. Migrations through 022 should already be applied; do not rerun old schema migrations blindly. This migration advances the Terms and Privacy documents to 2026-10-09. It does not send email, erase old acceptance records, or add public bot tables.

Review the public bot disclosure before launch. It describes OVHcloud as the intended host; change that disclosure if you use a different provider. Use the existing admin Legal Notices tool if account holders need a notice. No notices are sent automatically by this PR.

## 2. Prepare the Discord application

In the [Discord Developer Portal](https://discord.com/developers/applications), use your existing application or create the GDM Community bot:

1. On **Bot**, enable **Server Members Intent** and **Message Content Intent**. Presence Intent is not needed.
2. Keep the bot token private. Save it only in the VPS environment file below. Do not send it in tickets, screenshots, a PR or Discord chat.
3. Set the application Privacy Policy URL to `https://gdmacros.com/privacy`, and Terms URL to `https://gdmacros.com/terms`.
4. In the OAuth2 URL generator, select **bot** and **applications.commands**. Install it into guild `1557316326941392908`.
5. Grant the individual permissions needed for enabled modules: View Channels, Send Messages, Send Messages in Threads, Read Message History, Embed Links, Attach Files, Manage Messages, Manage Channels, Manage Roles, View Audit Log, Kick Members, Ban Members, Moderate Members, Manage Nicknames, Deafen Members, Move Members and Connect. It does not need Administrator, voice audio playback, or your personal Discord credentials.
6. Move its role above ordinary members and leveling reward roles. Discord still prevents it from moderating the server owner or members at/above its highest role.

Command roles are configured on the website. Installing the bot does not make every Discord administrator an allowed command user: the owner and selected roles can use enabled commands. Dashboard links are harmless links; opening them still requires a **website admin** login.

Primary references: [Discord permissions](https://docs.discord.com/developers/topics/permissions), [gateway intents](https://docs.discord.com/developers/events/gateway), [discord.py intents](https://discordpy.readthedocs.io/en/stable/intents.html), [Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy).

## 3. Prepare an Ubuntu 24.04 VPS

The service is tested with Python 3.12. Choose Ubuntu 24.04, or supply an equivalent supported Python environment. Run the following through SSH, using your own server account with sudo:

```sh
sudo apt-get update
sudo apt-get install -y git python3.12-venv caddy
sudo useradd --system --home /var/lib/gdmacros-bot --shell /usr/sbin/nologin gdmacrosbot
sudo mkdir -p /opt/gdmacros
sudo git clone https://github.com/GDMacros-com/GDMacros.git /opt/gdmacros
sudo python3.12 -m venv /opt/gdmacros/bot/.venv
sudo /opt/gdmacros/bot/.venv/bin/pip install -r /opt/gdmacros/bot/requirements.txt
sudo install -d -o gdmacrosbot -g gdmacrosbot -m 0700 /var/lib/gdmacros-bot
```

If the service user or checkout already exists, reuse it and update the checkout instead of running creation commands again. The code and virtual environment can remain owned by root; the bot only writes `/var/lib/gdmacros-bot`.

## 4. Create private environment settings

Generate a random shared API key on your own VPS:

```sh
python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
sudo install -m 0600 /dev/null /etc/gdmacros-bot.env
sudo nano /etc/gdmacros-bot.env
```

Paste these settings into that private file, replacing the two empty values:

```dotenv
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=1557316326941392908
GDM_BOT_API_KEY=your_random_shared_key
GDM_BOT_DATABASE=/var/lib/gdmacros-bot/bot.sqlite3
GDM_SITE_URL=https://gdmacros.com
GDM_BOT_PORT=8787
```

The API key must have at least 48 characters. Keep a secure copy for Vercel. `GDM_SITE_URL` is the website's HTTPS origin, not the bot API origin. The example file in the repo intentionally contains no credentials. Never copy the private file back into the repository.

## 5. Enable HTTPS and services

Point the DNS **A** record for `bot.gdmacros.com` to the VPS IPv4 address. Only add an AAAA record if IPv6 is configured correctly. Allow inbound SSH, HTTP and HTTPS in both the VPS firewall and OVH network firewall; keep port 8787 closed externally. The bot listens on **127.0.0.1 only**.

Merge `bot/deploy/Caddyfile` into `/etc/caddy/Caddyfile`. If this VPS is dedicated to the bot, you can use the file as supplied. If it already hosts other sites, retain their entries. Caddy automatically obtains HTTPS for the subdomain. Then:

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo cp /opt/gdmacros/bot/deploy/gdmacros-bot.service /etc/systemd/system/
sudo cp /opt/gdmacros/bot/deploy/gdmacros-bot-prune.service /etc/systemd/system/
sudo cp /opt/gdmacros/bot/deploy/gdmacros-bot-prune.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gdmacros-bot gdmacros-bot-prune.timer
sudo systemctl status gdmacros-bot --no-pager
```

The bot service runs as an unprivileged user and has filesystem restrictions. The separate hourly prune timer erases expired transcript records even if the Discord connection/service is down. Web requests refuse an expired transcript at its exact expiry time. A deleted transcript's bytes are erased through SQLite secure deletion and compaction.

Inspect operational errors with `sudo journalctl -u gdmacros-bot --since today`. Access logging is disabled on the Python API; do not add logging that prints Authorization headers, request bodies or environment values. A request to `https://bot.gdmacros.com/v1/state` without the shared key should return **401**, with no server settings. Opening the subdomain root returns 404; it is not another dashboard.

## 6. Connect the Vercel website

Add these in Vercel → Project → Settings → Environment Variables:

| Variable | Value |
| --- | --- |
| `GDM_BOT_API_URL` | `https://bot.gdmacros.com` — bare origin, no `/v1`, credentials or query |
| `GDM_BOT_API_KEY` | The same random shared key saved on the VPS |

These are **server-only** variables. Never add a `NEXT_PUBLIC_` prefix. The Discord bot token is not needed in Vercel. Scope the settings to Production, and only approved Preview deployments when testing; don't expose production service credentials to untrusted previews or forks. Redeploy the website after adding them.

Sign in with your GDMacros admin account and open `https://gdmacros.com/admin/bot-panel`. The status should show **Connected** with your server's roles and channels. Website mods get no dashboard link, cannot open the pages or transcripts, and receive 403 from the APIs. There is no separate Discord login or secret token in the browser.

## 7. Configure and test each module

Start with a small private test category and consenting test members. Keep your existing bots enabled until their replacement is confirmed; disable duplicate module behavior as you test to prevent duplicate logs, DMs or conflicting role changes.

**Moderation:** Choose a private permanent case-log channel. Enable moderation and select the Discord roles allowed for each command. No dangerous command can be configured for everyone. Run a warning against an ordinary test member, inspect its case ID in Discord and the website, then void it with `/delwarn`. Test mute/unmute, voice deafen/undeafen and an empty-channel lock/unlock. Lock overwrites all current send permissions, saves the exact overwrite pairs, and prevents double-locking from replacing the original snapshot. **Discord administrators always bypass channel locks**; only the owner can type among ordinary members, and the bot retains access for acknowledgements. Deleted roles/members cannot be restored as live targets. Unlock replaces the current overwrites with the saved snapshot, so don't manually change channel permissions while locked.

Configure each message/member/role/channel/emoji/voice log destination independently. Missing cached message content is labelled unavailable; message-delete events do not reliably identify the person who deleted it. Audit-log attribution is only attached when a recent entry matches the relevant target. A private ticket's messages never go to general logs. Cases persist locally without automatic expiry, and completed actions are queued for Discord delivery with retries. Discord messages can still be removed by someone with permission; Discord is not a guaranteed backup. A softban interrupted between ban and unban has persistent unban recovery and a visible incident notice. Failed actions don't get normal successful case records.

**Honeypot:** Choose its dedicated channel and exempt roles, with the bot's role above potential targets. Configure the deletion window, save while enabled and inspect the warning first. Saving posts/edits the warning before the trap becomes active. Test only with an account whose owner agrees to being removed. Bots/webhooks, the server owner and exempt roles are ignored. A softban is a ban/unban sequence, not a timeout. See [upstream Honeypot](https://github.com/RiskyMH/honeypot) and `bot/NOTICE.md` for attribution.

**Boosts:** Choose the destination and edit its embed. Save, then use **Send a test to the saved channel**. Live boost messages are driven by Discord boost system-message events, so keep boost system messages enabled in Server Settings → Overview → System Messages Channel. Turning those events off prevents the bot from observing each boost reliably.

**Leveling:** Defaults match your screenshot's 10-second interval, 15–40 XP, threads/slash XP off, `150 + 100n + 48n² + 0.885n³` cumulative thresholds, DM every 5 levels, reset on leave off, reset on permanent ban on, and rank color `#bebebe`. Leveling itself starts disabled. Set the ten reward tiers I–X at levels **5, 10, 15, 20, 25, 35, 45, 55, 75, 100**, with stacking on, by choosing your real roles. Rewards must be ordinary roles below the bot without moderation permissions. Champion role is optional and updated daily.

Save the curve and settings. Upload `lurkr_levels_2026-10-09T18-46-46.458Z.json` from your device through **Import Lurkr data**. The original private export is **not in this repo**. The preview checks IDs, bounds, duplicate users and calculated levels. Your supplied five rows match the custom curve. Choose merge-larger (safe against overwriting newer XP) or explicitly replace only users in that file. Confirm import; no historical DMs are sent. Then click **Sync saved rewards with members**. Use `/rank`, `/leaderboard`, `/level get/set/add/remove/reset`, `/xp get/set/add/remove/reset`, `/colour`, `/background show/set/remove`, `/privacy`, `/wrapped`, `/syncroles`, `/importxp` and `/exportxp`. Prefix versions use `?`. `/exportxp` sends the private export to the authorized staff user's DMs, never a public channel. Rank backgrounds use bounded Discord attachments, not arbitrary server-fetched URLs. Wrapped contains only activity recorded by this bot, not invented historical dates from imports. Enable the public web leaderboard and check `/discord/leaderboard`.

**Tickets:** Add panels, each with a message channel, ticket category, staff roles, transcript notice channel, welcome embed and limits. Save, then **Publish or update saved panel**. Existing panel messages update in place. Staff settings for tickets are snapshotted on creation; changing panel staff roles affects new tickets. Verify a test ticket is invisible to unrelated members. Buttons support claim/lock/unlock/close/reopen/delete; close/delete ask for a second confirmation. `/ticket` adds member add/remove and rename. The creator can close if configured; other actions require the panel's staff or owner. Closing freezes send permissions while capturing the transcript and sets 30-day expiry. Delete removes a closed channel while preserving its transcript until the original expiry. Reopen removes the old transcript and starts a new active conversation. Capture is bounded at 20,000 messages; larger tickets must be manually exported instead of silently truncating. Attachment links are saved, not files; Discord can expire those links sooner.

Open `/admin/bot-panel/transcript-N` while signed in as a website admin, then confirm a website mod and a signed-out browser cannot view it. The Discord transcript destination receives a restricted website link, **not a permanent raw transcript attachment**. Keep ticket categories private and avoid granting unrelated roles Administrator, which bypasses Discord permissions. Website support and macro requests continue to use the existing website system.

**Temporary voice:** Choose the lobby and category, with bot Manage Channels/Move Members/Connect permissions. Joining creates “[user]'s vc” and moves the member. The owner can rename, limit, lock/unlock, permit/reject users or transfer ownership through `/voice`. An unrelated user cannot control it. Empty managed channels are deleted, including on restart. Voice locks save and restore the exact channel overwrites, including role-specific connect permissions. Discord administrators bypass connect locks.

## 8. Maintenance, privacy and recovery

Monitor **Queued logs**, service errors and free disk space. Repair deleted log destinations and save new configuration when needed. Do not remove the bot service's private database when updating code: it contains cases, warnings, channel-lock snapshots, panel message IDs, XP and active tickets/voice ownership.

To update after another merged PR:

```sh
sudo git -C /opt/gdmacros pull --ff-only
sudo /opt/gdmacros/bot/.venv/bin/pip install -r /opt/gdmacros/bot/requirements.txt
sudo systemctl restart gdmacros-bot
```

The database and secrets stay outside the checkout. If you need to roll back code, first stop the service and preserve the current database securely; never restore an old backup that republishes expired transcripts or undoes newer moderation actions.

Do not enable VPS snapshots or database backups that preserve transcripts beyond the advertised 30-day limit. If backups are necessary, implement selective backup/expiry and purge expired snapshots; this repo doesn't configure the OVH backup service. Logs/cases have no automatic expiry but privacy requests still need operator review and, when required, removal from both the private database and Discord copies. `/privacy delete` handles leveling only. Contact users through the existing support channel, not scraped contact details. Keep bot data out of analytics and advertising integrations. Moderation/channel logs should go to appropriate private staff channels.

Rotate the shared key on **both** hosts if exposed, restart the bot and redeploy Vercel. Reset a leaked Discord token in the Developer Portal and update only the VPS file. No secret value needs a code change or public commit.

The source and tests cannot verify live Discord permissions, VPS networking, Supabase/Vercel environment settings, deleted-message availability or provider outages. Complete the live rollout checks above before removing the old bots. No software security review can guarantee zero vulnerabilities or 100% uptime.

## Local verification

```sh
npm ci
npm run test:bot
npx tsc --noEmit
npm run build
cd bot
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
.venv/bin/python -m pytest -q
.venv/bin/pip-audit -r requirements.txt
```

Tests use synthetic data and mocked Discord/Auth/network calls. They never ban a real member, send a Discord message, use your supplied private leveling export as a committed fixture, or deploy production services. CI also runs the existing website suites. The bot's AGPL source, changes and upstream attribution are in `bot/NOTICE.md` and `bot/LICENSE`.
