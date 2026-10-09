# Source and attribution

The `bot/` service is distributed under the GNU Affero General Public License v3.0, in `bot/LICENSE`.

The honeypot module is a Python adaptation of the channel trap, ban/unban sequence, warning and recovery behavior in [RiskyMH/Honeypot](https://github.com/RiskyMH/honeypot), licensed AGPL-3.0. Original project by RiskyMH; GDMacros adaptations by GDMacros contributors (2026). The warning includes recognizable upstream wording. Changes include integration with GDM moderation cases, configurable exemptions, a private website dashboard and persistent recovery. This service does not connect to the official Honeypot bot or its database.

Corresponding source for this service is publicly available in [GDMacros-com/GDMacros, bot directory](https://github.com/GDMacros-com/GDMacros/tree/main/bot). `/source` links users to the source and license. Operators deploying modifications must publish the corresponding modified service source and update that link if it is hosted elsewhere. Credentials and live databases are runtime data and must not be published.

Dyno, Lurkr and Ticket Tool were used as functional references. Their names, logos and proprietary code are not copied. The leveling importer accepts the [documented Lurkr export format](https://lurkr.gg/docs/guides/exporting-leveling-leaderboard); XP thresholds follow Lurkr's [documented polynomial curve](https://lurkr.gg/docs/guides/customize-leveling-speed).

The Next.js website remains a separate application communicating with this service over an authenticated API. This notice covers the bot service directory.
