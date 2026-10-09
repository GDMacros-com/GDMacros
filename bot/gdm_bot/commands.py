import io
import json
import re
import discord
from discord.ext import commands
from .embeds import log_embed
from .leveling import MAX_XP, level_for, threshold, rank_image, safe_background
from .security import UserError, ident


class CommunityCommands(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    async def done(self, ctx, number):
        await ctx.send(
            embed=log_embed(f"Case #{number}", "Action completed."), ephemeral=True
        )

    async def dashboard(self, ctx, module):
        await ctx.send(
            f"Configure this module: {self.bot.env.site_url}/admin/bot-panel/{module}\nSign in with a GDMacros admin account.",
            ephemeral=True,
        )

    @commands.hybrid_command()
    async def source(self, ctx):
        """View this bot's source, license and privacy information."""
        await ctx.send(
            f"Source and AGPL-3.0 license: https://github.com/GDMacros-com/GDMacros/tree/main/bot\nPrivacy: {self.bot.env.site_url}/privacy\nTerms: {self.bot.env.site_url}/terms",
            ephemeral=True,
        )

    @commands.hybrid_group(name="boostnotis", invoke_without_command=True)
    async def boostnotis(self, ctx):
        await self.dashboard(ctx, "boostnotifications")

    @boostnotis.command(name="dashboard")
    async def boost_dashboard(self, ctx):
        await self.dashboard(ctx, "boostnotifications")

    @commands.hybrid_group(name="honeypot", invoke_without_command=True)
    async def honeypot(self, ctx):
        await self.dashboard(ctx, "honeypot")

    @honeypot.command(name="dashboard")
    async def honeypot_dashboard(self, ctx):
        await self.dashboard(ctx, "honeypot")

    @commands.hybrid_group(name="moderation", invoke_without_command=True)
    async def moderation(self, ctx):
        await self.dashboard(ctx, "moderation")

    @moderation.command(name="dashboard")
    async def moderation_dashboard(self, ctx):
        await self.dashboard(ctx, "moderation")

    @commands.hybrid_group(name="leveling", invoke_without_command=True)
    async def leveling(self, ctx):
        await self.dashboard(ctx, "leveling")

    @leveling.command(name="dashboard")
    async def leveling_dashboard(self, ctx):
        await self.dashboard(ctx, "leveling")

    @commands.hybrid_group(name="tickets", invoke_without_command=True)
    async def tickets(self, ctx):
        await self.dashboard(ctx, "tickets")

    @tickets.command(name="dashboard")
    async def tickets_dashboard(self, ctx):
        await self.dashboard(ctx, "tickets")

    @commands.hybrid_command()
    async def setnick(
        self,
        ctx,
        member: discord.Member,
        nickname: str = "",
        *,
        reason: str = "No reason supplied",
    ):
        """Set or reset a member's nickname."""
        await self.done(
            ctx,
            await self.bot.moderation.member_action(
                "setnick", ctx.author, member, reason, nickname
            ),
        )

    @commands.hybrid_command()
    async def deafen(
        self,
        ctx,
        member: discord.Member,
        deafened: bool = True,
        *,
        reason: str = "No reason supplied",
    ):
        """Toggle server voice deafening."""
        await self.done(
            ctx,
            await self.bot.moderation.member_action(
                "deafen", ctx.author, member, reason, deafened
            ),
        )

    @commands.hybrid_command()
    async def mute(
        self,
        ctx,
        member: discord.Member,
        minutes: int,
        *,
        reason: str = "No reason supplied",
    ):
        """Time out a member; zero minutes removes a timeout."""
        await self.done(
            ctx,
            await self.bot.moderation.member_action(
                "mute", ctx.author, member, reason, minutes
            ),
        )

    @commands.hybrid_command()
    async def kick(
        self, ctx, member: discord.Member, *, reason: str = "No reason supplied"
    ):
        """Kick a member."""
        await self.done(
            ctx,
            await self.bot.moderation.member_action("kick", ctx.author, member, reason),
        )

    @commands.hybrid_command()
    async def softban(
        self,
        ctx,
        member: discord.Member,
        delete_seconds: int = 3600,
        *,
        reason: str = "No reason supplied",
    ):
        """Ban then unban, deleting recent messages."""
        await self.done(
            ctx,
            await self.bot.moderation.member_action(
                "softban", ctx.author, member, reason, delete_seconds
            ),
        )

    @commands.hybrid_command()
    async def ban(
        self,
        ctx,
        member: discord.Member,
        delete_seconds: int = 3600,
        *,
        reason: str = "No reason supplied",
    ):
        """Ban a server member."""
        await self.done(
            ctx,
            await self.bot.moderation.member_action(
                "ban", ctx.author, member, reason, delete_seconds
            ),
        )

    @commands.hybrid_command()
    async def unban(self, ctx, user_id: str, *, reason: str = "No reason supplied"):
        """Unban by Discord user ID."""
        ident(user_id)
        if int(user_id) == ctx.guild.owner_id:
            raise UserError("The server owner cannot be moderated")
        await ctx.guild.unban(
            discord.Object(id=int(user_id)),
            reason=f"GDM unban by {ctx.author.id}: {reason}"[:512],
        )
        await self.done(
            ctx, self.bot.moderation.record("unban", user_id, ctx.author.id, reason)
        )

    @commands.hybrid_command()
    async def warn(self, ctx, member: discord.Member, *, reason: str):
        """Record a warning and its case ID."""
        number = await self.bot.moderation.member_action(
            "warn", ctx.author, member, reason
        )
        try:
            await member.send(
                embed=log_embed(
                    f"Warning • Case #{number}", reason, {"Server": ctx.guild.name}
                )
            )
        except discord.HTTPException:
            pass
        await self.done(ctx, number)

    @commands.hybrid_command()
    async def warnings(self, ctx, member: discord.Member):
        """Show a member's active warnings."""
        rows = self.bot.store.rows(
            "SELECT * FROM cases WHERE action='warn' AND target_id=? AND voided=0 ORDER BY id DESC LIMIT 20",
            (str(member.id),),
        )
        await ctx.send(
            embed=log_embed(
                "Warnings",
                "\n\n".join(f"**Case #{r['id']}** • {r['reason'][:150]}" for r in rows)
                or "No active warnings.",
                {
                    "User": str(member),
                    "Showing": "Up to 20 newest warnings; full history in the dashboard",
                },
            ),
            ephemeral=True,
        )

    @commands.hybrid_command()
    async def delwarn(self, ctx, case_id: int, *, reason: str = "Warning removed"):
        """Void a warning while preserving its permanent audit case."""
        row = self.bot.store.one(
            "SELECT * FROM cases WHERE id=? AND action='warn' AND voided=0", (case_id,)
        )
        if not row:
            raise UserError("That active warning was not found")
        target = ctx.guild.get_member(int(row["target_id"]))
        if target:
            from .security import hierarchy

            hierarchy(ctx.author, target, ctx.guild, ctx.guild.me)
        self.bot.store.execute("UPDATE cases SET voided=1 WHERE id=?", (case_id,))
        await self.done(
            ctx,
            self.bot.moderation.record(
                "delwarn",
                row["target_id"],
                ctx.author.id,
                reason,
                {"Warning case": case_id},
            ),
        )

    @commands.hybrid_command()
    async def lock(
        self,
        ctx,
        channel: discord.TextChannel | None = None,
        *,
        reason: str = "Channel locked",
    ):
        """Save permissions and lock a text channel. Discord administrators bypass locks."""
        await self.done(
            ctx,
            await self.bot.moderation.channel_lock(
                channel or ctx.channel, ctx.author, reason
            ),
        )

    @commands.hybrid_command()
    async def unlock(
        self,
        ctx,
        channel: discord.TextChannel | None = None,
        *,
        reason: str = "Channel unlocked",
    ):
        """Restore the permissions saved before the lock."""
        await self.done(
            ctx,
            await self.bot.moderation.channel_lock(
                channel or ctx.channel, ctx.author, reason, True
            ),
        )

    @commands.hybrid_command()
    async def purge(
        self,
        ctx,
        count: int,
        member: discord.Member | None = None,
        *,
        reason: str = "Messages purged",
    ):
        """Delete up to 100 recent messages (optionally by member)."""
        if not 1 <= count <= 100 or self.bot.is_ticket_channel(ctx.channel.id):
            raise UserError("Choose 1–100 messages in a regular text channel")
        deleted = await ctx.channel.purge(
            limit=count,
            check=(lambda m: member is None or m.author.id == member.id),
            reason=f"GDM purge by {ctx.author.id}: {reason}"[:512],
        )
        if not deleted:
            raise UserError("No matching messages were deleted")
        await self.done(
            ctx,
            self.bot.moderation.record(
                "purge",
                member.id if member else ctx.channel.id,
                ctx.author.id,
                reason,
                {"Count": len(deleted), "Channel": str(ctx.channel.id)},
            ),
        )

    @commands.hybrid_command()
    async def modstats(self, ctx, member: discord.Member | None = None):
        """Show successful moderation actions by moderator."""
        member = member or ctx.author
        rows = self.bot.store.rows(
            "SELECT action,count(*) AS total FROM cases WHERE actor_id=? GROUP BY action ORDER BY total DESC",
            (str(member.id),),
        )
        await ctx.send(
            embed=log_embed(
                "Moderator statistics",
                "\n".join(f"**{r['action']}**: {r['total']}" for r in rows)
                or "No cases yet.",
                {"Moderator": str(member)},
            ),
            ephemeral=True,
        )

    @commands.hybrid_command()
    async def rank(
        self, ctx, member: discord.Member | None = None, text_mode: bool = False
    ):
        """View a rank card and XP progress."""
        member = member or ctx.author
        row = self.bot.store.ensure_member(
            member.id, member.display_name, member.avatar.key if member.avatar else None
        )
        if row["hidden"] and member.id != ctx.author.id:
            raise UserError("This member's rank is private")
        c = self.bot.settings.leveling.coefficients
        n = level_for(row["xp"], c)
        if text_mode:
            await ctx.send(
                embed=log_embed(
                    f"{member.display_name} • Level {n}",
                    f"{row['xp']:,} XP • {row['messages']:,} messages",
                    {"Next level": max(0, threshold(min(n + 1, 1000), c) - row["xp"])},
                ),
                ephemeral=bool(row["hidden"]),
            )
        else:
            await ctx.send(
                file=discord.File(
                    rank_image(
                        row,
                        c,
                        row["color"] or self.bot.settings.leveling.rank_color,
                        row["background"],
                    ),
                    filename="rank.png",
                ),
                ephemeral=bool(row["hidden"]),
            )

    @commands.hybrid_command()
    async def leaderboard(self, ctx, page: int = 1):
        """View the server leaderboard and website link."""
        if not 1 <= page <= 400:
            raise UserError("Choose a page between 1 and 400")
        data = self.bot.leveling.board(page, public=False)
        text = "\n".join(
            f"**#{r['position']}** {discord.utils.escape_markdown(r['username'])} • Level **{r['level']}** • {r['xp']:,} XP"
            for r in data["entries"]
        )
        await ctx.send(
            embed=log_embed(
                "GDM Community leaderboard",
                (text or "No public ranks yet.")
                + f"\n\n[Web leaderboard]({self.bot.env.site_url}/discord/leaderboard)",
                {"Page": page, "Members": data["total"]},
            )
        )

    @commands.hybrid_group(name="level", invoke_without_command=True, fallback="get")
    async def level(self, ctx, member: discord.Member | None = None):
        await self.rank(ctx, member, True)

    async def change_xp(self, ctx, member, value, mode, unit):
        if type(value) is not int or not 0 <= value <= (
            1000 if unit == "level" else MAX_XP
        ):
            raise UserError("Choose a valid nonnegative amount")
        from .security import hierarchy

        hierarchy(ctx.author, member, ctx.guild, ctx.guild.me)
        row = self.bot.store.ensure_member(
            member.id, member.display_name, member.avatar.key if member.avatar else None
        )
        coefficients = self.bot.settings.leveling.coefficients
        before = level_for(row["xp"], coefficients)
        if unit == "level":
            current = before
            wanted = (
                value
                if mode == "set"
                else current + value
                if mode == "add"
                else current - value
            )
            new = threshold(max(0, min(1000, wanted)), coefficients)
        else:
            new = max(
                0,
                min(
                    MAX_XP,
                    value
                    if mode == "set"
                    else row["xp"] + value
                    if mode == "add"
                    else row["xp"] - value,
                ),
            )
        self.bot.store.execute(
            "UPDATE levels SET xp=? WHERE user_id=?", (new, str(member.id))
        )
        number = self.bot.moderation.record(
            unit + "_" + mode,
            member.id,
            ctx.author.id,
            "Manual leveling adjustment",
            {"Before XP": row["xp"], "After XP": new},
        )
        await self.bot.leveling.sync_rewards(member)
        await self.done(ctx, number)

    @level.command(name="set")
    async def level_set(self, ctx, member: discord.Member, amount: int):
        await self.change_xp(ctx, member, amount, "set", "level")

    @level.command(name="add")
    async def level_add(self, ctx, member: discord.Member, amount: int):
        await self.change_xp(ctx, member, amount, "add", "level")

    @level.command(name="remove")
    async def level_remove(self, ctx, member: discord.Member, amount: int):
        await self.change_xp(ctx, member, amount, "remove", "level")

    @level.command(name="reset")
    async def level_reset(self, ctx, member: discord.Member):
        await self.change_xp(ctx, member, 0, "set", "level")

    @commands.hybrid_group(name="xp", invoke_without_command=True, fallback="get")
    async def xp(self, ctx, member: discord.Member | None = None):
        await self.rank(ctx, member, True)

    @xp.command(name="add")
    async def xp_add(self, ctx, member: discord.Member, amount: int):
        await self.change_xp(ctx, member, amount, "add", "xp")

    @xp.command(name="remove")
    async def xp_remove(self, ctx, member: discord.Member, amount: int):
        await self.change_xp(ctx, member, amount, "remove", "xp")

    @xp.command(name="set")
    async def xp_set(self, ctx, member: discord.Member, amount: int):
        await self.change_xp(ctx, member, amount, "set", "xp")

    @xp.command(name="reset")
    async def xp_reset(self, ctx, member: discord.Member):
        await self.change_xp(ctx, member, 0, "set", "xp")

    @commands.hybrid_command()
    async def syncroles(self, ctx, member: discord.Member | None = None):
        """Synchronize earned role rewards."""
        await self.bot.leveling.sync_rewards(member or ctx.author)
        await ctx.send("Role rewards synchronized.", ephemeral=True)

    @commands.hybrid_command()
    async def importxp(self, ctx):
        """Open the private Lurkr import preview."""
        await self.dashboard(ctx, "leveling")

    @commands.hybrid_command()
    async def exportxp(self, ctx):
        """Export private XP data to your DMs."""
        rows = self.bot.store.rows(
            "SELECT user_id,username,avatar,xp,messages FROM levels"
        )
        c = self.bot.settings.leveling.coefficients
        data = {
            "levels": [
                {
                    "userId": r["user_id"],
                    "user": {
                        "username": r["username"],
                        "avatar": r["avatar"],
                        "discriminator": "0",
                    },
                    "xp": r["xp"],
                    "messageCount": r["messages"],
                    "level": level_for(r["xp"], c),
                }
                for r in rows
            ]
        }
        try:
            await ctx.author.send(
                file=discord.File(
                    io.BytesIO(json.dumps(data).encode()), filename="gdm-levels.json"
                )
            )
        except discord.HTTPException:
            raise UserError("Open your DMs to receive the export") from None
        await ctx.send(
            "The export was sent to your DMs. Keep it private.", ephemeral=True
        )

    @commands.hybrid_command()
    async def colour(self, ctx, color: str = "reset"):
        """Set your rank progress color (#RRGGBB) or reset it."""
        if color != "reset" and not re.fullmatch(r"#[a-fA-F0-9]{6}", color):
            raise UserError("Use a hex color such as #3b82f6, or reset")
        self.bot.store.ensure_member(ctx.author.id, ctx.author.display_name)
        self.bot.store.execute(
            "UPDATE levels SET color=? WHERE user_id=?",
            (None if color == "reset" else color, str(ctx.author.id)),
        )
        await ctx.send("Rank color saved.", ephemeral=True)

    @commands.hybrid_command()
    async def privacy(self, ctx, mode: str = "hide"):
        """Hide/show your rank, or erase XP and opt out of leveling."""
        if mode not in ("hide", "show", "delete"):
            raise UserError("Use hide, show or delete")
        self.bot.store.ensure_member(ctx.author.id, ctx.author.display_name)
        if mode == "delete":
            self.bot.store.execute(
                "UPDATE levels SET hidden=1,xp=0,messages=0,background=NULL,color=NULL WHERE user_id=?",
                (str(ctx.author.id),),
            )
            self.bot.store.execute(
                "DELETE FROM xp_daily WHERE user_id=?", (str(ctx.author.id),)
            )
            await self.bot.leveling.sync_rewards(ctx.author)
        else:
            self.bot.store.execute(
                "UPDATE levels SET hidden=? WHERE user_id=?",
                (int(mode == "hide"), str(ctx.author.id)),
            )
        await ctx.send(
            "Rank privacy updated. Hidden ranks stop earning XP; show opts back in. Existing moderation cases are handled separately by staff.",
            ephemeral=True,
        )

    @commands.hybrid_group(
        name="background", invoke_without_command=True, fallback="show"
    )
    async def background(self, ctx):
        await self.rank(ctx)

    @background.command(name="set")
    async def background_set(self, ctx, image: discord.Attachment):
        """Set a PNG/JPEG/WebP rank background (maximum 2 MB)."""
        if image.size > 2 * 1024 * 1024:
            raise UserError("Choose an image smaller than 2 MB")
        data = safe_background(await image.read())
        self.bot.store.ensure_member(ctx.author.id, ctx.author.display_name)
        self.bot.store.execute(
            "UPDATE levels SET background=? WHERE user_id=?", (data, str(ctx.author.id))
        )
        await ctx.send("Rank background saved.", ephemeral=True)

    @background.command(name="remove")
    async def background_remove(self, ctx):
        self.bot.store.execute(
            "UPDATE levels SET background=NULL WHERE user_id=?", (str(ctx.author.id),)
        )
        await ctx.send("Rank background removed.", ephemeral=True)

    @commands.hybrid_command()
    async def wrapped(self, ctx):
        """View your recorded XP and message activity for the current year."""
        year = discord.utils.utcnow().year
        row = self.bot.store.one(
            "SELECT coalesce(sum(xp),0) AS xp,coalesce(sum(messages),0) AS messages FROM xp_daily WHERE user_id=? AND day>=?",
            (str(ctx.author.id), f"{year}-01-01"),
        )
        await ctx.send(
            embed=log_embed(
                f"Your {year} GDM activity",
                f"**{row['xp']:,} XP** earned • **{row['messages']:,} XP-earning messages**",
                {
                    "Coverage": "Activity recorded by this bot; imported totals have no historical dates"
                },
            ),
            ephemeral=True,
        )

    @commands.hybrid_command()
    async def ticket(
        self, ctx, action: str, member: discord.Member | None = None, value: str = ""
    ):
        """Manage a ticket: claim, close, reopen, delete, lock, unlock, add, remove or rename."""
        await self.bot.tickets.action(
            action,
            ctx.channel,
            ctx.author,
            member if action in ("add", "remove") else value,
        )
        if action != "delete":
            await ctx.send("Ticket action completed.", ephemeral=True)

    @commands.hybrid_command()
    async def voice(self, ctx, action: str, *, value: str = ""):
        """Manage your temporary voice channel: name, limit, lock, unlock, permit, reject, transfer."""
        await self.bot.voice.control(ctx.author, action, value)
        await ctx.send("Voice channel updated.", ephemeral=True)
