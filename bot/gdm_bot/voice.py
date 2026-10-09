import asyncio
import json
import time
import discord
from .security import UserError
from .moderation import snapshot, restore


class VoiceService:
    def __init__(self, bot):
        self.bot = bot
        self.lock = asyncio.Lock()
        self.cooldowns = {}

    async def update(self, member, before, after):
        if member.guild.id != self.bot.env.guild_id or member.bot:
            return
        async with self.lock:
            if (
                before.channel
                and not before.channel.members
                and self.bot.store.one(
                    "SELECT 1 FROM voice WHERE channel_id=?", (str(before.channel.id),)
                )
            ):
                try:
                    await before.channel.delete(
                        reason="Empty GDM temporary voice channel"
                    )
                    self.bot.store.execute(
                        "DELETE FROM voice WHERE channel_id=?",
                        (str(before.channel.id),),
                    )
                except discord.HTTPException:
                    pass
            s = self.bot.settings.tempvoice
            if (
                not s.enabled
                or not after.channel
                or str(after.channel.id) != s.lobby_id
            ):
                return
            existing = self.bot.store.one(
                "SELECT channel_id FROM voice WHERE owner_id=?", (str(member.id),)
            )
            channel = (
                member.guild.get_channel(int(existing["channel_id"]))
                if existing
                else None
            )
            if channel:
                await member.move_to(channel, reason="Return to your GDM voice channel")
                return
            if time.monotonic() - self.cooldowns.get(member.id, 0) < 15:
                return
            self.cooldowns[member.id] = time.monotonic()
            if len(self.cooldowns) > 2000:
                self.cooldowns = {
                    uid: t
                    for uid, t in self.cooldowns.items()
                    if time.monotonic() - t < 30
                }
            category = member.guild.get_channel(int(s.category_id))
            if not isinstance(category, discord.CategoryChannel):
                return
            # Inherit category access; owners use ?voice controls, not Manage Channels.
            channel = await member.guild.create_voice_channel(
                f"{member.display_name}'s vc"[:100],
                category=category,
                user_limit=s.user_limit,
                reason=f"GDM temp voice for {member.id}",
            )
            self.bot.store.execute(
                "INSERT OR REPLACE INTO voice VALUES(?,?,?)",
                (str(channel.id), str(member.id), time.time()),
            )
            try:
                await member.move_to(channel, reason="GDM join-to-create")
            except discord.HTTPException:
                if not channel.members:
                    await channel.delete(reason="Clean up failed GDM move")
                    self.bot.store.execute(
                        "DELETE FROM voice WHERE channel_id=?", (str(channel.id),)
                    )
                raise

    async def control(self, actor, action, value=""):
        async with self.lock:
            return await self._control(actor, action, value)

    async def _control(self, actor, action, value=""):
        channel = actor.voice.channel if actor.voice else None
        row = (
            self.bot.store.one(
                "SELECT * FROM voice WHERE channel_id=?", (str(channel.id),)
            )
            if channel
            else None
        )
        if not row or row["owner_id"] != str(actor.id):
            raise UserError("Join your own temporary voice channel to use its controls")
        if action == "name":
            if not 1 <= len(value.strip()) <= 100:
                raise UserError("Names must be 1–100 characters")
            await channel.edit(name=value.strip())
        elif action == "limit":
            if not value.isdecimal() or not 0 <= int(value) <= 99:
                raise UserError("User limits must be 0–99 (0 means unlimited)")
            await channel.edit(user_limit=int(value))
        elif action in ("lock", "unlock"):
            saved = self.bot.store.one(
                "SELECT body FROM voice_permissions WHERE channel_id=?",
                (str(channel.id),),
            )
            if action == "unlock":
                if not saved:
                    raise UserError("This voice channel has no saved lock")
                await channel.edit(
                    overwrites=restore(actor.guild, json.loads(saved["body"]))
                )
                self.bot.store.execute(
                    "DELETE FROM voice_permissions WHERE channel_id=?",
                    (str(channel.id),),
                )
            else:
                if saved:
                    raise UserError("This voice channel is already locked")
                self.bot.store.execute(
                    "INSERT INTO voice_permissions VALUES(?,?)",
                    (str(channel.id), json.dumps(snapshot(channel))),
                )
                # Explicit role/member allows otherwise override @everyone.
                # Discord administrators still bypass channel restrictions.
                overwrites = restore(actor.guild, snapshot(channel))
                overwrites.setdefault(
                    actor.guild.default_role, discord.PermissionOverwrite()
                )
                for overwrite in overwrites.values():
                    overwrite.connect = False
                for member in (actor, actor.guild.me):
                    overwrite = overwrites.setdefault(
                        member, discord.PermissionOverwrite()
                    )
                    overwrite.view_channel = True
                    overwrite.connect = True
                await channel.edit(overwrites=overwrites)
        elif action in ("permit", "reject", "transfer"):
            if not value.isdecimal():
                raise UserError("Supply the member's Discord user ID")
            member = actor.guild.get_member(int(value))
            if not member or member.bot or member.id == actor.guild.owner_id:
                raise UserError("Choose a server member")
            if action == "transfer":
                if (
                    not member.voice
                    or member.voice.channel != channel
                    or self.bot.store.one(
                        "SELECT 1 FROM voice WHERE owner_id=?", (str(member.id),)
                    )
                ):
                    raise UserError(
                        "Transfer to a member in this channel who does not already own one"
                    )
                locked = self.bot.store.one(
                    "SELECT 1 FROM voice_permissions WHERE channel_id=?",
                    (str(channel.id),),
                )
                if locked:
                    overwrites = restore(actor.guild, snapshot(channel))
                    overwrites.setdefault(
                        actor, discord.PermissionOverwrite()
                    ).connect = False
                    new_owner = overwrites.setdefault(
                        member, discord.PermissionOverwrite()
                    )
                    new_owner.view_channel = True
                    new_owner.connect = True
                    await channel.edit(overwrites=overwrites)
                self.bot.store.execute(
                    "UPDATE voice SET owner_id=? WHERE channel_id=?",
                    (str(member.id), str(channel.id)),
                )
            else:
                if member.id == actor.id:
                    raise UserError("You cannot reject yourself")
                await channel.set_permissions(
                    member, connect=action == "permit", view_channel=action == "permit"
                )
                if (
                    action == "reject"
                    and member.voice
                    and member.voice.channel == channel
                ):
                    await member.move_to(
                        None, reason="Temporary voice owner removed member"
                    )
        else:
            raise UserError("Use name, limit, lock, unlock, permit, reject or transfer")

    async def recover(self):
        for row in self.bot.store.rows("SELECT * FROM voice"):
            channel = self.bot.guild.get_channel(int(row["channel_id"]))
            if not channel:
                self.bot.store.execute(
                    "DELETE FROM voice WHERE channel_id=?", (row["channel_id"],)
                )
            elif not channel.members:
                try:
                    await channel.delete(
                        reason="Recover empty GDM temporary voice channel"
                    )
                    self.bot.store.execute(
                        "DELETE FROM voice WHERE channel_id=?", (row["channel_id"],)
                    )
                except discord.HTTPException:
                    pass
