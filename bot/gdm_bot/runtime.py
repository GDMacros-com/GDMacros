import asyncio
import json
import logging
import time
import discord
from discord.ext import commands, tasks
from .commands import CommunityCommands
from .embeds import render
from .events import EventLogs
from .leveling import LevelingService
from .moderation import ModerationService
from .security import UserError, permission
from .tickets import TicketService, TicketOpen, TicketControl
from .voice import VoiceService

log = logging.getLogger("gdm_bot")
MOD_ACTIONS = {
    "setnick",
    "deafen",
    "mute",
    "kick",
    "softban",
    "warn",
    "unban",
    "ban",
    "warnings",
    "lock",
    "unlock",
    "delwarn",
    "modstats",
    "purge",
}
LEVEL_COMMANDS = {
    "rank",
    "leaderboard",
    "level",
    "xp",
    "syncroles",
    "importxp",
    "exportxp",
    "colour",
    "privacy",
    "background",
    "wrapped",
}
ADMIN_ROLE_PERMISSIONS = (
    "administrator",
    "ban_members",
    "kick_members",
    "manage_guild",
    "manage_channels",
    "manage_roles",
    "manage_webhooks",
    "moderate_members",
    "manage_messages",
    "mention_everyone",
)


class CommunityBot(commands.Bot):
    def __init__(self, env, store):
        intents = discord.Intents.default()
        intents.members = True
        intents.message_content = True
        super().__init__(
            command_prefix="?",
            intents=intents,
            help_command=None,
            allowed_mentions=discord.AllowedMentions.none(),
            max_messages=2000,
            allowed_contexts=discord.app_commands.AppCommandContext(
                guild=True, dm_channel=False, private_channel=False
            ),
            allowed_installs=discord.app_commands.AppInstallationType(
                guild=True, user=False
            ),
        )
        self.env, self.store = env, store
        self.revision, self.settings = store.settings()
        self.settings_lock = asyncio.Lock()
        self.moderation = ModerationService(self)
        self.leveling = LevelingService(self)
        self.tickets = TicketService(self)
        self.voice = VoiceService(self)
        self.last_maintenance = 0.0
        self.last_champion = 0.0
        self.initialized = False
        self.last_problem = None
        self.add_check(self.authorize)

    @property
    def guild(self):
        return self.get_guild(self.env.guild_id)

    def ticket_channel_ids(self):
        return {
            r["channel_id"]
            for r in self.store.rows(
                "SELECT channel_id FROM tickets WHERE channel_id IS NOT NULL"
            )
        }

    def is_ticket_channel(self, channel_id):
        return bool(
            self.store.one(
                "SELECT 1 FROM tickets WHERE channel_id=?", (str(channel_id),)
            )
        )

    async def setup_hook(self):
        await self.add_cog(CommunityCommands(self))
        await self.add_cog(EventLogs(self))
        self.add_dynamic_items(TicketOpen, TicketControl)
        target = discord.Object(id=self.env.guild_id)
        self.tree.copy_global_to(guild=target)
        await self.tree.sync(guild=target)
        self.maintenance.start()

    async def authorize(self, ctx):
        if not ctx.guild or ctx.guild.id != self.env.guild_id or ctx.author.bot:
            raise commands.CheckFailure(
                "This bot is configured for the GDM Community server"
            )
        name = (
            ctx.command.root_parent.name
            if ctx.command.root_parent
            else ctx.command.name
        )
        if name in (
            "boostnotis",
            "honeypot",
            "moderation",
            "leveling",
            "tickets",
            "source",
        ):
            return (
                True  # Links only; website authentication still gates every dashboard.
            )
        rule = self.settings.moderation.commands.get(name)
        if not rule or not permission(ctx.author, ctx.guild, rule):
            raise commands.CheckFailure(
                "This command is disabled or your role is not allowed to use it"
            )
        if name in MOD_ACTIONS and not self.settings.moderation.enabled:
            raise commands.CheckFailure("Moderation is disabled")
        if name in LEVEL_COMMANDS and not self.settings.leveling.enabled:
            raise commands.CheckFailure("Leveling is disabled")
        if name == "ticket" and not self.settings.tickets.enabled:
            raise commands.CheckFailure("Tickets are disabled")
        if name == "voice" and not self.settings.tempvoice.enabled:
            raise commands.CheckFailure("Temporary voice is disabled")
        return True

    async def on_ready(self):
        # Never act in an unrelated guild even if someone installs the application elsewhere.
        if not self.guild:
            self.last_problem = "The bot is not in the configured server"
            return
        if not self.initialized:
            await self.tickets.recover()
            await self.voice.recover()
            ids = {str(m.id) for m in self.guild.members}
            for row in self.store.rows("SELECT user_id FROM levels"):
                self.store.execute(
                    "UPDATE levels SET present=? WHERE user_id=?",
                    (int(row["user_id"] in ids), row["user_id"]),
                )
            self.initialized = True
        log.info("GDM bot connected")

    async def on_message(self, message):
        if not message.guild or message.guild.id != self.env.guild_id:
            return
        if await self.moderation.honeypot(message):
            return
        if message.type in (
            discord.MessageType.premium_guild_subscription,
            discord.MessageType.premium_guild_tier_1,
            discord.MessageType.premium_guild_tier_2,
            discord.MessageType.premium_guild_tier_3,
        ):
            s = self.settings.boostnotifications
            channel = (
                self.guild.get_channel(int(s.channel_id)) if s.channel_id else None
            )
            if s.enabled and channel:
                self.store.queue(
                    s.channel_id,
                    render(
                        s.embed,
                        {
                            "user": message.author.mention,
                            "username": message.author.display_name,
                            "server": self.guild.name,
                            "boosts": self.guild.premium_subscription_count,
                        },
                    ).to_dict(),
                )
            return
        if message.author.bot or message.webhook_id:
            return
        await self.leveling.award(message.author, message.channel, message.content)
        await self.process_commands(message)

    async def on_command_completion(self, ctx):
        if ctx.interaction and ctx.guild and ctx.guild.id == self.env.guild_id:
            await self.leveling.award(ctx.author, ctx.channel, slash=True)

    async def on_voice_state_update(self, member, before, after):
        if before.channel != after.channel:
            try:
                await self.voice.update(member, before, after)
            except discord.HTTPException:
                self.last_problem = (
                    "Temporary voice could not update; check bot permissions"
                )

    async def on_command_error(self, ctx, error):
        original = getattr(error, "original", error)
        if isinstance(error, commands.CommandNotFound):
            return
        if isinstance(original, (UserError, commands.CheckFailure)):
            message = str(original)
        elif isinstance(original, (commands.UserInputError, commands.BadArgument)):
            message = "Check the command arguments. Use the slash version to see the available fields."
        elif isinstance(original, discord.Forbidden):
            message = "Discord denied this action. Check the bot permissions and role hierarchy."
        elif isinstance(original, discord.NotFound):
            message = "The member, ban or channel was not found."
        elif isinstance(original, discord.HTTPException):
            message = "Discord could not confirm this action. Check the case log before retrying."
        else:
            log.error("Command failed: %s", type(original).__name__)
            message = "The action could not be confirmed. Check the dashboard and case log before retrying."
        try:
            await ctx.send(message[:1800], ephemeral=True)
        except discord.HTTPException:
            pass

    async def publish_message(self, key, channel, embed, view=None):
        if not isinstance(channel, discord.TextChannel):
            raise UserError("Choose a text channel")
        old = self.store.one("SELECT * FROM published WHERE key=?", (key,))
        if old and old["channel_id"] == str(channel.id):
            try:
                message = await channel.fetch_message(int(old["message_id"]))
                await message.edit(embed=embed, view=view)
                return
            except discord.NotFound:
                pass
        message = await channel.send(embed=embed, view=view)
        self.store.execute(
            "INSERT OR REPLACE INTO published VALUES(?,?,?)",
            (key, str(channel.id), str(message.id)),
        )
        if old and old["channel_id"] != str(channel.id):
            previous = self.guild.get_channel(int(old["channel_id"]))
            if previous:
                try:
                    await previous.get_partial_message(int(old["message_id"])).delete()
                except discord.HTTPException:
                    self.last_problem = "A previous panel/warning could not be removed. Remove it in Discord."

    def validate_settings(self, settings):
        guild = self.guild
        if not self.is_ready() or not guild:
            raise UserError("Connect the bot to Discord before saving settings")

        def channel(cid, kind, required_permissions=()):
            obj = guild.get_channel(int(cid)) if cid else None
            if not isinstance(obj, kind):
                raise UserError("A selected channel is missing or has the wrong type")
            perms = obj.permissions_for(guild.me)
            if not perms.view_channel or any(
                not getattr(perms, p) for p in required_permissions
            ):
                raise UserError(f"The bot needs access and permissions in #{obj.name}")
            return obj

        def role(rid, reward=False):
            r = guild.get_role(int(rid))
            if not r or r == guild.default_role:
                raise UserError(
                    "Choose existing server roles; @everyone cannot be selected"
                )
            if reward and (
                r.managed
                or r >= guild.me.top_role
                or any(getattr(r.permissions, p) for p in ADMIN_ROLE_PERMISSIONS)
            ):
                raise UserError(
                    "Automatic rewards must be ordinary roles below the bot, without moderation permissions"
                )

        for obj in (settings.boostnotifications, settings.honeypot):
            if obj.channel_id:
                channel(
                    obj.channel_id,
                    discord.TextChannel,
                    ("send_messages", "embed_links"),
                )
        if settings.honeypot.enabled and not guild.me.guild_permissions.ban_members:
            raise UserError("Honeypot needs Ban Members permission")
        for r in settings.honeypot.exempt_roles:
            role(r)
        mod = settings.moderation
        if mod.case_channel_id:
            c = channel(
                mod.case_channel_id,
                discord.TextChannel,
                ("send_messages", "embed_links"),
            )
            if c.permissions_for(guild.default_role).view_channel:
                raise UserError(
                    "Choose a private staff channel for permanent case logs"
                )
        for rule in mod.commands.values():
            for r in rule.roles:
                role(r)
        for rule in mod.logs.values():
            if rule.channel_id:
                channel(
                    rule.channel_id,
                    discord.TextChannel,
                    ("send_messages", "embed_links"),
                )
        for cid in mod.ignored_channels:
            channel(
                cid,
                (discord.TextChannel, discord.VoiceChannel, discord.CategoryChannel),
            )
        levels = settings.leveling
        for cid in levels.channels:
            channel(cid, (discord.TextChannel, discord.ForumChannel))
        for r in (
            levels.blacklisted_roles
            + levels.champion_excluded_roles
            + levels.reward_excluded_roles
        ):
            role(r)
        for reward in levels.rewards:
            for r in reward.roles:
                role(r, True)
        if levels.champion_role_id:
            role(levels.champion_role_id, True)
        if (
            levels.rewards or levels.champion_role_id
        ) and not guild.me.guild_permissions.manage_roles:
            raise UserError("Role rewards need Manage Roles permission")
        if levels.notification_channel_id:
            channel(
                levels.notification_channel_id,
                discord.TextChannel,
                ("send_messages", "embed_links"),
            )
        for p in settings.tickets.panels:
            channel(p.channel_id, discord.TextChannel, ("send_messages", "embed_links"))
            channel(
                p.category_id,
                discord.CategoryChannel,
                ("manage_channels", "manage_roles"),
            )
            dest = channel(
                p.transcript_channel_id,
                discord.TextChannel,
                ("send_messages", "embed_links"),
            )
            if dest.permissions_for(guild.default_role).view_channel:
                raise UserError("Transcript notices need a private staff channel")
            for r in p.staff_roles:
                role(r)
        if settings.tempvoice.lobby_id:
            channel(
                settings.tempvoice.lobby_id, discord.VoiceChannel, ("move_members",)
            )
        if settings.tempvoice.category_id:
            channel(
                settings.tempvoice.category_id,
                discord.CategoryChannel,
                ("manage_channels", "manage_roles", "connect", "move_members"),
            )

    async def save_settings(self, revision, settings, actor):
        async with self.settings_lock:
            if revision != self.revision:
                raise UserError(
                    "Settings changed in another session. Reload before saving"
                )
            self.validate_settings(settings)
            if settings.honeypot.enabled:
                embed = render(settings.honeypot.embed)
                embed.add_field(
                    name="Channel rule",
                    value="Any non-exempt member who posts here will be softbanned. Bots, the owner and exempt roles are excluded.",
                    inline=False,
                )
                # Publish the warning BEFORE activating a new trap.
                await self.publish_message(
                    "honeypot",
                    self.guild.get_channel(int(settings.honeypot.channel_id)),
                    embed,
                )
            self.revision = self.store.save_settings(revision, settings, actor)
            self.settings = settings
            # Existing panel messages update in place; new panels are published explicitly.
            for panel in settings.tickets.panels:
                if (
                    settings.tickets.enabled
                    and panel.enabled
                    and self.store.one(
                        "SELECT 1 FROM published WHERE key=?", ("panel:" + panel.id,)
                    )
                ):
                    try:
                        await self.tickets.publish(panel.id)
                    except discord.HTTPException:
                        self.last_problem = "Settings saved; a ticket panel could not update. Publish it again."
            return self.revision

    @tasks.loop(seconds=15)
    async def maintenance(self):
        if not self.is_ready() or not self.guild:
            return
        try:
            await self.moderation.retry_unbans()
            for row in self.store.rows("SELECT * FROM outbox ORDER BY id LIMIT 20"):
                channel = self.guild.get_channel(int(row["channel_id"]))
                try:
                    if not channel:
                        raise UserError("Log channel unavailable")
                    await channel.send(
                        embed=discord.Embed.from_dict(json.loads(row["body"]))
                    )
                    self.store.execute("DELETE FROM outbox WHERE id=?", (row["id"],))
                except (discord.HTTPException, UserError):
                    self.store.execute(
                        "UPDATE outbox SET attempts=attempts+1 WHERE id=?", (row["id"],)
                    )
                    self.last_problem = "Some Discord log deliveries are queued; check log channel permissions"
            now = time.time()
            if now - self.last_maintenance > 60:
                # Erase transcript bytes on time, retain only channel IDs for deletion retries.
                self.store.cleanup(now)
                for row in self.store.rows("SELECT channel_id FROM expired_channels"):
                    c = (
                        self.guild.get_channel(int(row["channel_id"]))
                        if row["channel_id"]
                        else None
                    )
                    if c:
                        try:
                            await c.delete(reason="GDM ticket retention expired")
                        except discord.HTTPException:
                            self.last_problem = "An expired ticket channel needs manual deletion; its web transcript is inaccessible"
                            continue
                    self.store.execute(
                        "DELETE FROM expired_channels WHERE channel_id=?",
                        (row["channel_id"],),
                    )
                self.last_maintenance = now
            if now - self.last_champion > 86400:
                await self.leveling.champion()
                self.last_champion = now
        except Exception as error:
            log.error("Maintenance failed: %s", type(error).__name__)

    @maintenance.before_loop
    async def before_maintenance(self):
        await self.wait_until_ready()

    async def close(self):
        self.maintenance.cancel()
        await super().close()
