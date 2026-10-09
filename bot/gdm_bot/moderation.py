"""Moderation actions, exact overwrite restoration and durable case delivery."""

import asyncio
import json
import time
from datetime import timedelta
import discord
from .embeds import log_embed
from .security import UserError, hierarchy

WRITE_PERMISSIONS = (
    "send_messages",
    "send_messages_in_threads",
    "create_public_threads",
    "create_private_threads",
    "send_voice_messages",
    "send_polls",
)


def snapshot(channel):
    rows = []
    for target, overwrite in channel.overwrites.items():
        allow, deny = overwrite.pair()
        rows.append(
            {
                "id": str(target.id),
                "kind": "role" if isinstance(target, discord.Role) else "member",
                "allow": allow.value,
                "deny": deny.value,
            }
        )
    return rows


def restore(guild, rows):
    result = {}
    for row in rows:
        target = (
            guild.get_role(int(row["id"]))
            if row["kind"] == "role"
            else guild.get_member(int(row["id"]))
        )
        # An overwrite target may have left since the channel was locked.
        if target:
            result[target] = discord.PermissionOverwrite.from_pair(
                discord.Permissions(row["allow"]), discord.Permissions(row["deny"])
            )
    return result


def locked_overwrites(channel):
    overwrites = {
        target: discord.PermissionOverwrite.from_pair(*p.pair())
        for target, p in channel.overwrites.items()
    }
    overwrites.setdefault(channel.guild.default_role, discord.PermissionOverwrite())
    for target, overwrite in overwrites.items():
        for name in WRITE_PERMISSIONS:
            setattr(overwrite, name, False)
    for member in (channel.guild.owner, channel.guild.me):
        if member:
            overwrite = overwrites.setdefault(member, discord.PermissionOverwrite())
            for name in WRITE_PERMISSIONS:
                setattr(overwrite, name, True)
    return overwrites


class ModerationService:
    def __init__(self, bot):
        self.bot = bot
        self.store = bot.store
        self.lock = asyncio.Lock()
        self.honeypot_seen = {}

    def record(self, action, target, actor, reason, details=None):
        number = self.store.case(action, target, actor, reason, details)
        e = log_embed(
            f"Case #{number} • {action.title()}",
            reason,
            {
                "User / channel": f"`{target}`",
                "Moderator": f"<@{actor}> • `{actor}`",
                **{k: str(v) for k, v in (details or {}).items()},
            },
            0xFBBF24 if action == "warn" else 0xFB7185,
        )
        if self.bot.settings.moderation.case_channel_id:
            self.store.queue(
                self.bot.settings.moderation.case_channel_id, e.to_dict(), number
            )
        rule = self.bot.settings.moderation.logs["moderator_command"]
        if (
            rule.enabled
            and rule.channel_id != self.bot.settings.moderation.case_channel_id
        ):
            self.store.queue(rule.channel_id, e.to_dict(), number)
        return number

    async def member_action(self, action, actor, target, reason, value=None):
        if action == "softban":
            # Maintenance must not recover a softban while it is still running.
            async with self.lock:
                return await self._member_action(action, actor, target, reason, value)
        return await self._member_action(action, actor, target, reason, value)

    async def _member_action(self, action, actor, target, reason, value=None):
        guild = self.bot.guild
        if actor.guild.id != guild.id or target.guild.id != guild.id:
            raise UserError("Choose a member of the configured server")
        hierarchy(actor, target, guild, guild.me)
        reason = reason.strip()[:1000] or "No reason supplied"
        audit_reason = f"GDM {action} by {actor.id}: {reason}"[:512]
        details = {"User": str(target), "Moderator": str(actor)}
        if action == "setnick":
            if value is not None and len(value) > 32:
                raise UserError("Nicknames must be at most 32 characters")
            await target.edit(nick=value or None, reason=audit_reason)
            details["Nickname"] = value or "Reset"
        elif action == "deafen":
            if not target.voice:
                raise UserError("That member is not connected to voice")
            await target.edit(deafen=bool(value), reason=audit_reason)
            details["Deafened"] = bool(value)
        elif action == "mute":
            if not isinstance(value, int) or not 0 <= value <= 40320:
                raise UserError(
                    "Timeouts must be between 0 and 40320 minutes (28 days)"
                )
            if target.guild_permissions.administrator:
                raise UserError(
                    "Discord cannot time out members with Administrator permission"
                )
            await target.timeout(
                timedelta(minutes=value) if value else None, reason=audit_reason
            )
            details["Minutes"] = value
        elif action == "kick":
            await target.kick(reason=audit_reason)
        elif action in ("ban", "softban"):
            seconds = value if isinstance(value, int) else 3600
            if not 0 <= seconds <= 604800:
                raise UserError("Message deletion must be between 0 and 604800 seconds")
            if action == "softban":
                self.store.execute(
                    "INSERT OR REPLACE INTO pending_unbans VALUES(?,?,?)",
                    (
                        str(target.id),
                        json.dumps(
                            {
                                "reason": reason,
                                "actor": str(actor.id),
                                "details": details,
                            }
                        ),
                        discord.utils.utcnow().timestamp(),
                    ),
                )
            try:
                await guild.ban(
                    target, delete_message_seconds=seconds, reason=audit_reason
                )
            except discord.HTTPException:
                if action == "softban":
                    self.store.execute(
                        "DELETE FROM pending_unbans WHERE user_id=?", (str(target.id),)
                    )
                raise
            if action == "softban":
                try:
                    await guild.unban(
                        target, reason=audit_reason + " (softban release)"
                    )
                except discord.HTTPException:
                    if self.bot.settings.moderation.case_channel_id:
                        self.store.queue(
                            self.bot.settings.moderation.case_channel_id,
                            log_embed(
                                "Softban needs attention",
                                f"User `{target.id}` was banned but could not be unbanned. The bot will retry. You can also unban them in Discord.",
                                color=0xFB7185,
                            ).to_dict(),
                        )
                    raise UserError(
                        "The ban succeeded but the unban failed. Recovery is queued; check the case log"
                    ) from None
                # Retain the completed marker briefly for delayed gateway ban events.
                self.store.execute(
                    "UPDATE pending_unbans SET reason=? WHERE user_id=?",
                    (json.dumps({"completed": True}), str(target.id)),
                )
            details["Deleted message window (seconds)"] = seconds
        elif action != "warn":
            raise UserError("Unknown moderation action")
        return self.record(action, target.id, actor.id, reason, details)

    async def retry_unbans(self):
        async with self.lock:
            await self._retry_unbans()

    async def _retry_unbans(self):
        for row in self.store.rows("SELECT * FROM pending_unbans LIMIT 20"):
            data = json.loads(row["reason"])
            if data.get("completed"):
                if (discord.utils.utcnow().timestamp() - row["created_at"]) > 120:
                    self.store.execute(
                        "DELETE FROM pending_unbans WHERE user_id=?", (row["user_id"],)
                    )
                continue
            try:
                await self.bot.guild.unban(
                    discord.Object(id=int(row["user_id"])),
                    reason="Recover interrupted GDM softban",
                )
            except discord.NotFound:
                # The process may have stopped before the ban, or someone may
                # already have unbanned them. Do not invent a successful case.
                self.store.execute(
                    "UPDATE pending_unbans SET reason=?,created_at=? WHERE user_id=?",
                    (
                        json.dumps({"completed": True}),
                        discord.utils.utcnow().timestamp(),
                        row["user_id"],
                    ),
                )
                if self.bot.settings.moderation.case_channel_id:
                    self.store.queue(
                        self.bot.settings.moderation.case_channel_id,
                        log_embed(
                            "Softban recovery checked",
                            f"User `{row['user_id']}` is no longer banned. The interrupted action could not be verified, so no successful case was recorded.",
                        ).to_dict(),
                    )
                continue
            except discord.HTTPException:
                continue
            self.store.execute(
                "UPDATE pending_unbans SET reason=?,created_at=? WHERE user_id=?",
                (
                    json.dumps({"completed": True}),
                    discord.utils.utcnow().timestamp(),
                    row["user_id"],
                ),
            )
            self.record(
                "softban",
                row["user_id"],
                data["actor"],
                data["reason"],
                {**data["details"], "Recovery": "Unban completed"},
            )

    async def channel_lock(self, channel, actor, reason, unlock=False):
        if not isinstance(channel, discord.TextChannel) or self.bot.is_ticket_channel(
            channel.id
        ):
            raise UserError(
                "Choose a regular text channel; use ticket controls for tickets"
            )
        async with self.lock:
            saved = self.store.one(
                "SELECT body FROM locks WHERE channel_id=?", (str(channel.id),)
            )
            if unlock:
                if not saved:
                    raise UserError("There is no saved lock for this channel")
                await channel.edit(
                    overwrites=restore(channel.guild, json.loads(saved["body"])),
                    reason=f"GDM unlock by {actor.id}: {reason}"[:512],
                )
                self.store.execute(
                    "DELETE FROM locks WHERE channel_id=?", (str(channel.id),)
                )
            else:
                if saved:
                    raise UserError(
                        "This channel is already locked; the original permissions are preserved"
                    )
                self.store.execute(
                    "INSERT INTO locks VALUES(?,?)",
                    (str(channel.id), json.dumps(snapshot(channel))),
                )
                # Keep the snapshot on an uncertain network failure: unlock can repair it.
                await channel.edit(
                    overwrites=locked_overwrites(channel),
                    reason=f"GDM lock by {actor.id}: {reason}"[:512],
                )
            return self.record(
                "unlock" if unlock else "lock",
                channel.id,
                actor.id,
                reason,
                {"Channel": channel.name},
            )

    async def honeypot(self, message):
        s = self.bot.settings.honeypot
        if (
            not s.enabled
            or str(message.channel.id) != s.channel_id
            or message.author.bot
            or message.webhook_id
        ):
            return False
        member = message.author
        if member.id == self.bot.guild.owner_id or {
            str(r.id) for r in member.roles
        } & set(s.exempt_roles):
            return True
        # A burst of gateway messages from the same membership must not issue
        # concurrent softbans. A new join has a new key and is checked again.
        key = (member.id, member.joined_at)
        now = time.monotonic()
        if now - self.honeypot_seen.get(key, -1000) < 120:
            return True
        self.honeypot_seen[key] = now
        if len(self.honeypot_seen) > 2000:
            self.honeypot_seen = {
                k: t for k, t in self.honeypot_seen.items() if now - t < 120
            }
        try:
            await self.member_action(
                "softban",
                self.bot.guild.me,
                member,
                "Sent a message in the honeypot channel",
                s.delete_seconds,
            )
            try:
                await member.send(
                    "🍯 You triggered the GDM Community honeypot and were softbanned. This removes recent messages, but you can rejoin: https://discord.gg/Pe6EarWen9",
                    allowed_mentions=discord.AllowedMentions.none(),
                )
            except discord.HTTPException:
                pass
        except (discord.HTTPException, UserError):
            self.honeypot_seen.pop(key, None)
            if self.bot.settings.moderation.case_channel_id:
                self.store.queue(
                    self.bot.settings.moderation.case_channel_id,
                    log_embed(
                        "Honeypot action failed",
                        f"Check permissions and role hierarchy for user `{member.id}`.",
                        color=0xFB7185,
                    ).to_dict(),
                )
        return True
