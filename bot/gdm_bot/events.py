"""Structured Discord event logs. Never guess who deleted an uncached message."""

import discord
from discord.ext import commands
from .embeds import log_embed, user_label


class EventLogs(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    def here(self, guild):
        return guild and guild.id == self.bot.env.guild_id

    def enabled(self, *events):
        return any(self.bot.settings.moderation.logs[e].enabled for e in events)

    def private_channel(self, channel):
        return (
            self.bot.is_ticket_channel(channel.id)
            or (
                isinstance(channel, discord.TextChannel)
                and (channel.topic or "").startswith("gdm-ticket:")
            )
            or str(getattr(channel, "parent_id", "")) in self.bot.ticket_channel_ids()
        )

    async def emit(self, event, title, description="", fields=None, channel=None):
        rule = self.bot.settings.moderation.logs[event]
        if not rule.enabled or not rule.channel_id:
            return
        if channel and (
            self.private_channel(channel)
            or str(channel.id) in self.bot.settings.moderation.ignored_channels
        ):
            return
        self.bot.store.queue(
            rule.channel_id, log_embed(title, description, fields).to_dict()
        )

    async def audit_actor(self, guild, action, target_id):
        if not guild.me.guild_permissions.view_audit_log:
            return "Unknown (audit log unavailable)"
        try:
            async for entry in guild.audit_logs(limit=8, action=action):
                if (
                    discord.utils.utcnow() - entry.created_at
                ).total_seconds() <= 10 and getattr(
                    entry.target, "id", None
                ) == target_id:
                    return user_label(entry.user) if entry.user else "Unknown"
        except discord.HTTPException:
            pass
        return "Unknown (no matching recent audit entry)"

    @commands.Cog.listener()
    async def on_raw_message_delete(self, payload):
        if payload.guild_id != self.bot.env.guild_id or not self.enabled(
            "message_delete", "image_delete"
        ):
            return
        channel = self.bot.guild.get_channel_or_thread(payload.channel_id)
        if not channel or self.private_channel(channel):
            return
        message = payload.cached_message
        if message and message.author.bot:
            return
        fields = {
            "Channel": f"<#{payload.channel_id}> • `{payload.channel_id}`",
            "Message ID": f"`{payload.message_id}`",
            "Author": user_label(message.author)
            if message
            else "Unavailable (message not cached)",
            "Deleted by": "Unknown • Discord does not identify the deleter in this event",
        }
        await self.emit(
            "message_delete",
            "Message deleted",
            message.content
            if message
            else "Content unavailable: not cached before deletion.",
            fields,
            channel,
        )
        images = (
            [
                a
                for a in message.attachments
                if (a.content_type or "").startswith("image/")
            ]
            if message
            else []
        )
        if images:
            await self.emit(
                "image_delete",
                "Image deleted",
                "\n".join(
                    f"{discord.utils.escape_markdown(a.filename)} • {a.size:,} bytes"
                    for a in images
                ),
                fields,
                channel,
            )

    @commands.Cog.listener()
    async def on_raw_message_edit(self, payload):
        if (
            payload.guild_id != self.bot.env.guild_id
            or "content" not in payload.data
            or not self.enabled("message_edit")
        ):
            return
        channel = self.bot.guild.get_channel_or_thread(payload.channel_id)
        before = payload.cached_message
        if (
            not channel
            or self.private_channel(channel)
            or (before and before.author.bot)
        ):
            return
        author = before.author if before else None
        new_content = payload.data.get("content", "")
        if before and before.content == new_content:
            return
        await self.emit(
            "message_edit",
            "Message edited",
            fields={
                "Author": user_label(author) if author else "Unavailable (not cached)",
                "Channel": f"<#{payload.channel_id}> • `{payload.channel_id}`",
                "Before": before.content or "[empty]"
                if before
                else "Unavailable (not cached)",
                "After": new_content or "[empty]",
                "Message": f"https://discord.com/channels/{payload.guild_id}/{payload.channel_id}/{payload.message_id}",
            },
            channel=channel,
        )

    @commands.Cog.listener()
    async def on_raw_bulk_message_delete(self, payload):
        if payload.guild_id != self.bot.env.guild_id or not self.enabled(
            "bulk_message_delete"
        ):
            return
        channel = self.bot.guild.get_channel_or_thread(payload.channel_id)
        if channel:
            await self.emit(
                "bulk_message_delete",
                "Messages deleted in bulk",
                fields={
                    "Channel": f"<#{payload.channel_id}>",
                    "Count": len(payload.message_ids),
                    "Cached messages": len(payload.cached_messages),
                    "Message IDs (first 20)": ", ".join(
                        str(x) for x in sorted(payload.message_ids)[:20]
                    ),
                    "Actor": "See the associated purge case, if performed with GDM",
                },
                channel=channel,
            )

    @commands.Cog.listener()
    async def on_member_join(self, member):
        if not self.here(member.guild):
            return
        self.bot.store.ensure_member(
            member.id, member.display_name, member.avatar.key if member.avatar else None
        )
        await self.emit(
            "member_join",
            "Member joined",
            user_label(member),
            {
                "Account created": discord.utils.format_dt(member.created_at, "F"),
                "Member count": member.guild.member_count,
            },
        )
        if (
            self.bot.settings.leveling.enabled
            and self.bot.settings.leveling.reassign_on_rejoin
        ):
            try:
                await self.bot.leveling.sync_rewards(member)
            except discord.HTTPException:
                pass

    @commands.Cog.listener()
    async def on_member_remove(self, member):
        if not self.here(member.guild):
            return
        self.bot.store.execute(
            "UPDATE levels SET present=0 WHERE user_id=?", (str(member.id),)
        )
        if self.bot.settings.leveling.reset_on_leave:
            self.bot.store.execute(
                "UPDATE levels SET xp=0,messages=0 WHERE user_id=?", (str(member.id),)
            )
        await self.emit(
            "member_leave",
            "Member left",
            user_label(member),
            {
                "Joined": str(member.joined_at),
                "Roles": ", ".join(r.name for r in member.roles[1:]) or "None",
            },
        )

    @commands.Cog.listener()
    async def on_member_ban(self, guild, user):
        if not self.here(guild):
            return
        # Softban cleanup is not a permanent ban; preserve imported progress.
        if self.bot.settings.leveling.reset_on_ban and not self.bot.store.one(
            "SELECT 1 FROM pending_unbans WHERE user_id=?", (str(user.id),)
        ):
            self.bot.store.execute(
                "UPDATE levels SET xp=0,messages=0,present=0 WHERE user_id=?",
                (str(user.id),),
            )
        if self.enabled("member_ban"):
            await self.emit(
                "member_ban",
                "Member banned",
                user_label(user),
                {
                    "Moderator": await self.audit_actor(
                        guild, discord.AuditLogAction.ban, user.id
                    )
                },
            )

    @commands.Cog.listener()
    async def on_member_unban(self, guild, user):
        if self.here(guild) and self.enabled("member_unban"):
            await self.emit(
                "member_unban",
                "Member unbanned",
                user_label(user),
                {
                    "Moderator": await self.audit_actor(
                        guild, discord.AuditLogAction.unban, user.id
                    )
                },
            )

    @commands.Cog.listener()
    async def on_member_update(self, before, after):
        if not self.here(after.guild) or not self.enabled(
            "role_add", "role_remove", "nickname_change", "member_timeout"
        ):
            return
        for name, changed in (
            ("role_add", set(after.roles) - set(before.roles)),
            ("role_remove", set(before.roles) - set(after.roles)),
        ):
            if changed and self.enabled(name):
                await self.emit(
                    name,
                    "Roles added" if name == "role_add" else "Roles removed",
                    user_label(after),
                    {
                        "Roles": "\n".join(f"{r.name} • `{r.id}`" for r in changed),
                        "Actor": await self.audit_actor(
                            after.guild,
                            discord.AuditLogAction.member_role_update,
                            after.id,
                        ),
                    },
                )
        if before.nick != after.nick and self.enabled("nickname_change"):
            await self.emit(
                "nickname_change",
                "Nickname changed",
                user_label(after),
                {
                    "Before": before.nick or "No nickname",
                    "After": after.nick or "No nickname",
                    "Actor": await self.audit_actor(
                        after.guild, discord.AuditLogAction.member_update, after.id
                    ),
                },
            )
        if before.timed_out_until != after.timed_out_until and self.enabled(
            "member_timeout"
        ):
            await self.emit(
                "member_timeout",
                "Timeout changed",
                user_label(after),
                {
                    "Until": str(after.timed_out_until or "Removed"),
                    "Actor": await self.audit_actor(
                        after.guild, discord.AuditLogAction.member_update, after.id
                    ),
                },
            )

    @commands.Cog.listener()
    async def on_guild_role_create(self, role):
        if self.here(role.guild) and self.enabled("role_create"):
            await self.emit(
                "role_create",
                "Role created",
                fields={
                    "Role": f"{role.name} • `{role.id}`",
                    "Permissions": str(role.permissions.value),
                    "Actor": await self.audit_actor(
                        role.guild, discord.AuditLogAction.role_create, role.id
                    ),
                },
            )

    @commands.Cog.listener()
    async def on_guild_role_delete(self, role):
        if self.here(role.guild) and self.enabled("role_delete"):
            await self.emit(
                "role_delete",
                "Role deleted",
                fields={
                    "Role": f"{role.name} • `{role.id}`",
                    "Actor": await self.audit_actor(
                        role.guild, discord.AuditLogAction.role_delete, role.id
                    ),
                },
            )

    @commands.Cog.listener()
    async def on_guild_role_update(self, before, after):
        if not self.here(after.guild) or not self.enabled("role_edit"):
            return
        fields = {
            "Role": f"{after.name} • `{after.id}`",
            "Actor": await self.audit_actor(
                after.guild, discord.AuditLogAction.role_update, after.id
            ),
        }
        for attr in (
            "name",
            "permissions",
            "color",
            "hoist",
            "mentionable",
            "position",
        ):
            if getattr(before, attr) != getattr(after, attr):
                fields[attr.title()] = (
                    f"{getattr(before, attr)} → {getattr(after, attr)}"
                )
        if len(fields) > 2:
            await self.emit("role_edit", "Role updated", fields=fields)

    @commands.Cog.listener()
    async def on_guild_channel_create(self, channel):
        if (
            self.here(channel.guild)
            and self.enabled("channel_create")
            and not self.private_channel(channel)
        ):
            await self.emit(
                "channel_create",
                "Channel created",
                fields={
                    "Channel": f"#{channel.name} • `{channel.id}`",
                    "Type": str(channel.type),
                    "Actor": await self.audit_actor(
                        channel.guild, discord.AuditLogAction.channel_create, channel.id
                    ),
                },
                channel=channel,
            )

    @commands.Cog.listener()
    async def on_guild_channel_delete(self, channel):
        if (
            self.here(channel.guild)
            and self.enabled("channel_delete")
            and not self.private_channel(channel)
        ):
            await self.emit(
                "channel_delete",
                "Channel deleted",
                fields={
                    "Channel": f"#{channel.name} • `{channel.id}`",
                    "Type": str(channel.type),
                    "Actor": await self.audit_actor(
                        channel.guild, discord.AuditLogAction.channel_delete, channel.id
                    ),
                },
                channel=channel,
            )

    @commands.Cog.listener()
    async def on_guild_channel_update(self, before, after):
        if (
            not self.here(after.guild)
            or not self.enabled("channel_update")
            or self.private_channel(after)
        ):
            return
        fields = {
            "Channel": f"#{after.name} • `{after.id}`",
            "Actor": await self.audit_actor(
                after.guild, discord.AuditLogAction.channel_update, after.id
            ),
        }
        for attr in (
            "name",
            "topic",
            "position",
            "slowmode_delay",
            "bitrate",
            "user_limit",
            "category_id",
        ):
            if getattr(before, attr, None) != getattr(after, attr, None):
                fields[attr.replace("_", " ").title()] = (
                    f"{getattr(before, attr, None)} → {getattr(after, attr, None)}"
                )
        if before.overwrites != after.overwrites:
            fields["Permissions"] = "Permission overwrites changed"
        if len(fields) > 2:
            await self.emit(
                "channel_update", "Channel updated", fields=fields, channel=after
            )

    @commands.Cog.listener()
    async def on_guild_emojis_update(self, guild, before, after):
        if not self.here(guild) or not self.enabled(
            "emoji_create", "emoji_rename", "emoji_delete"
        ):
            return
        old, new = {e.id: e for e in before}, {e.id: e for e in after}
        for eid in new.keys() - old.keys():
            await self.emit(
                "emoji_create",
                "Emoji created",
                fields={
                    "Emoji": f"{new[eid]} • {new[eid].name} • `{eid}`",
                    "Actor": await self.audit_actor(
                        guild, discord.AuditLogAction.emoji_create, eid
                    ),
                },
            )
        for eid in old.keys() - new.keys():
            await self.emit(
                "emoji_delete",
                "Emoji deleted",
                fields={
                    "Name": old[eid].name,
                    "ID": eid,
                    "Actor": await self.audit_actor(
                        guild, discord.AuditLogAction.emoji_delete, eid
                    ),
                },
            )
        for eid in new.keys() & old.keys():
            if old[eid].name != new[eid].name:
                await self.emit(
                    "emoji_rename",
                    "Emoji renamed",
                    fields={
                        "ID": eid,
                        "Before": old[eid].name,
                        "After": new[eid].name,
                        "Actor": await self.audit_actor(
                            guild, discord.AuditLogAction.emoji_update, eid
                        ),
                    },
                )

    @commands.Cog.listener()
    async def on_voice_state_update(self, member, before, after):
        if not self.here(member.guild) or before.channel == after.channel:
            return
        event = (
            "voice_join"
            if not before.channel
            else "voice_leave"
            if not after.channel
            else "voice_move"
        )
        await self.emit(
            event,
            event.replace("_", " ").title(),
            user_label(member),
            {
                "From": f"{before.channel.name} • `{before.channel.id}`"
                if before.channel
                else "Disconnected",
                "To": f"{after.channel.name} • `{after.channel.id}`"
                if after.channel
                else "Disconnected",
            },
        )
