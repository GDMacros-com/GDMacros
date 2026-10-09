import asyncio
import json
import re
import time
import discord
from .embeds import render, log_embed
from .security import UserError
from .store import RETENTION
from .moderation import snapshot, restore, WRITE_PERMISSIONS


def control_view():
    view = discord.ui.View(timeout=None)
    for action, label, style in (
        ("claim", "Claim", discord.ButtonStyle.primary),
        ("close", "Close", discord.ButtonStyle.danger),
        ("lock", "Lock", discord.ButtonStyle.secondary),
        ("unlock", "Unlock", discord.ButtonStyle.secondary),
        ("reopen", "Reopen", discord.ButtonStyle.secondary),
        ("delete", "Delete channel", discord.ButtonStyle.secondary),
    ):
        view.add_item(
            discord.ui.Button(
                label=label, style=style, custom_id="gdm:ticket:" + action
            )
        )
    return view


class TicketOpen(
    discord.ui.DynamicItem[discord.ui.Button],
    template=r"gdm:ticket:open:(?P<panel>[a-z0-9-]{1,32})",
):
    def __init__(self, panel):
        self.panel = panel
        super().__init__(
            discord.ui.Button(
                label="Open a ticket",
                custom_id="gdm:ticket:open:" + panel,
                style=discord.ButtonStyle.primary,
            )
        )

    @classmethod
    async def from_custom_id(cls, interaction, item, match):
        return cls(match["panel"])

    async def callback(self, interaction):
        bot = interaction.client
        try:
            panel = bot.tickets.panel(self.panel)
            if panel.ask_reason:
                await interaction.response.send_modal(TicketReason(self.panel))
                return
            await interaction.response.defer(ephemeral=True)
            channel = await bot.tickets.open(self.panel, interaction.user, "")
            await interaction.followup.send(
                f"Your ticket is ready: {channel.mention}", ephemeral=True
            )
        except UserError as error:
            await respond_error(interaction, str(error))
        except discord.HTTPException:
            await respond_error(
                interaction,
                "Discord could not create this ticket. Ask a server admin to check permissions.",
            )


class TicketReason(discord.ui.Modal, title="Open a GDM Community ticket"):
    reason = discord.ui.TextInput(
        label="How can we help?",
        style=discord.TextStyle.paragraph,
        min_length=3,
        max_length=1500,
    )

    def __init__(self, panel):
        super().__init__(timeout=300)
        self.panel = panel

    async def on_submit(self, interaction):
        await interaction.response.defer(ephemeral=True)
        try:
            channel = await interaction.client.tickets.open(
                self.panel, interaction.user, str(self.reason)
            )
            await interaction.followup.send(
                f"Your ticket is ready: {channel.mention}", ephemeral=True
            )
        except UserError as error:
            await respond_error(interaction, str(error))
        except discord.HTTPException:
            await respond_error(
                interaction,
                "The ticket could not be created. Check the bot's permissions.",
            )


async def respond_error(interaction, text):
    if interaction.response.is_done():
        await interaction.followup.send(text, ephemeral=True)
    else:
        await interaction.response.send_message(text, ephemeral=True)


class TicketControl(
    discord.ui.DynamicItem[discord.ui.Button],
    template=r"gdm:ticket:(?P<action>claim|close|lock|unlock|reopen|delete)",
):
    def __init__(self, action):
        self.action = action
        super().__init__(
            discord.ui.Button(label=action.title(), custom_id="gdm:ticket:" + action)
        )

    @classmethod
    async def from_custom_id(cls, interaction, item, match):
        return cls(match["action"])

    async def callback(self, interaction):
        if self.action in ("close", "delete"):
            # A second click confirms deletion/closure and rechecks staff permissions.
            view = discord.ui.View(timeout=60)
            button = discord.ui.Button(
                label="Confirm " + self.action, style=discord.ButtonStyle.danger
            )

            async def confirmed(i):
                if i.user.id != interaction.user.id:
                    return await respond_error(
                        i, "This confirmation belongs to another user"
                    )
                await i.response.defer(ephemeral=True)
                try:
                    await i.client.tickets.action(
                        self.action, interaction.channel, i.user
                    )
                    await i.followup.send(
                        "Ticket " + self.action + " completed.", ephemeral=True
                    )
                    view.stop()
                except UserError as error:
                    await respond_error(i, str(error))
                except discord.HTTPException:
                    await respond_error(
                        i,
                        "Discord could not complete this action; check permissions and retry.",
                    )

            button.callback = confirmed
            view.add_item(button)
            await interaction.response.send_message(
                "Close captures a transcript and locks the ticket. Delete removes the Discord channel; its saved transcript keeps its original 30-day expiry.",
                view=view,
                ephemeral=True,
            )
            return
        await interaction.response.defer(ephemeral=True)
        try:
            await interaction.client.tickets.action(
                self.action, interaction.channel, interaction.user
            )
            await interaction.followup.send(
                "Ticket " + self.action + " completed.", ephemeral=True
            )
        except UserError as error:
            await respond_error(interaction, str(error))
        except discord.HTTPException:
            await respond_error(
                interaction,
                "Discord could not complete this action; check permissions and retry.",
            )


class TicketService:
    def __init__(self, bot):
        self.bot = bot
        self.store = bot.store
        self.lock = asyncio.Lock()

    def panel(self, panel_id):
        s = self.bot.settings.tickets
        panel = next((p for p in s.panels if p.id == panel_id), None)
        if not s.enabled or not panel or not panel.enabled:
            raise UserError("This ticket panel is disabled")
        return panel

    async def publish(self, panel_id):
        panel = self.panel(panel_id)
        channel = self.bot.guild.get_channel(int(panel.channel_id))
        view = discord.ui.View(timeout=None)
        item = TicketOpen(panel_id)
        item.item.label = panel.button_label
        view.add_item(item)
        await self.bot.publish_message(
            "panel:" + panel_id,
            channel,
            render(panel.embed, {"server": self.bot.guild.name}),
            view,
        )

    async def open(self, panel_id, member, reason):
        if member.guild.id != self.bot.env.guild_id or member.bot:
            raise UserError("This ticket belongs to the configured server")
        async with self.lock:
            panel = self.panel(panel_id)
            count = self.store.one(
                "SELECT count(*) AS n FROM tickets WHERE owner_id=? AND panel_id=? AND status IN ('open','creating')",
                (str(member.id), panel_id),
            )["n"]
            if count >= panel.max_open_per_user:
                raise UserError(
                    "You already have the maximum number of open tickets for this panel"
                )
            category = member.guild.get_channel(int(panel.category_id))
            if not isinstance(category, discord.CategoryChannel):
                raise UserError("The ticket category is unavailable")
            number = self.store.execute(
                "INSERT INTO tickets(panel_id,owner_id,status,created_at,panel_snapshot) VALUES(?,?,'creating',?,?)",
                (panel_id, str(member.id), time.time(), panel.model_dump_json()),
            ).lastrowid
            overwrites = {
                member.guild.default_role: discord.PermissionOverwrite(
                    view_channel=False
                ),
                member.guild.me: discord.PermissionOverwrite(
                    view_channel=True,
                    send_messages=True,
                    read_message_history=True,
                    manage_channels=True,
                ),
                member: discord.PermissionOverwrite(
                    view_channel=True,
                    send_messages=True,
                    read_message_history=True,
                    attach_files=True,
                ),
            }
            for rid in panel.staff_roles:
                role = member.guild.get_role(int(rid))
                if role and role != member.guild.default_role:
                    overwrites[role] = discord.PermissionOverwrite(
                        view_channel=True,
                        send_messages=True,
                        read_message_history=True,
                        attach_files=True,
                    )
            channel = None
            try:
                channel = await member.guild.create_text_channel(
                    f"ticket-{number:04}",
                    category=category,
                    overwrites=overwrites,
                    topic=f"gdm-ticket:{number}",
                    reason=f"GDM ticket #{number} opened by {member.id}",
                )
                self.store.execute(
                    "UPDATE tickets SET channel_id=?,status='open' WHERE id=?",
                    (str(channel.id), number),
                )
                await channel.send(
                    embed=render(
                        panel.welcome,
                        {
                            "user": member.mention,
                            "username": member.display_name,
                            "ticket": number,
                            "server": member.guild.name,
                        },
                    ),
                    view=control_view(),
                )
                if reason:
                    await channel.send(
                        embed=log_embed("Opening message", reason[:1500])
                    )
                return channel
            except Exception:
                if channel:
                    # Retain a real channel and its record; user can find it after an uncertain send.
                    self.store.execute(
                        "UPDATE tickets SET status='open' WHERE id=?", (number,)
                    )
                else:
                    self.store.execute("DELETE FROM tickets WHERE id=?", (number,))
                raise

    def check_actor(self, row, actor, action):
        panel = json.loads(row["panel_snapshot"])
        staff = actor.id == self.bot.guild.owner_id or bool(
            {str(r.id) for r in actor.roles} & set(panel["staff_roles"])
        )
        creator = (
            str(actor.id) == row["owner_id"]
            and panel["creator_can_close"]
            and action == "close"
        )
        if actor.bot or (not staff and not creator):
            raise UserError("Only the configured ticket staff can do that")
        return panel

    async def capture(self, channel):
        messages = []
        async for message in channel.history(limit=20001, oldest_first=True):
            if len(messages) >= 20000:
                raise UserError(
                    "This ticket exceeds 20,000 messages. Export it manually before closing"
                )
            messages.append(
                {
                    "id": str(message.id),
                    "author_id": str(message.author.id),
                    "author": str(message.author),
                    "created_at": message.created_at.isoformat(),
                    "edited_at": message.edited_at.isoformat()
                    if message.edited_at
                    else None,
                    "content": message.content,
                    "embeds": [e.to_dict() for e in message.embeds],
                    "attachments": [
                        {"name": a.filename, "size": a.size, "url": a.url}
                        for a in message.attachments
                    ],
                }
            )
        return json.dumps(messages, ensure_ascii=False)

    async def action(self, action, channel, actor, value=None):
        if (
            not getattr(channel, "guild", None)
            or channel.guild.id != self.bot.env.guild_id
            or actor.guild.id != self.bot.env.guild_id
        ):
            raise UserError("This ticket belongs to the configured server")
        async with self.lock:
            row = self.store.one(
                "SELECT * FROM tickets WHERE channel_id=?", (str(channel.id),)
            )
            if not row:
                raise UserError("This is not a managed ticket")
            panel = self.check_actor(row, actor, action)
            if action == "claim":
                if row["status"] != "open" or row["claimed_by"]:
                    raise UserError("This ticket is closed or already claimed")
                await channel.send(
                    embed=log_embed(
                        "Ticket claimed",
                        f"{actor.mention} is taking care of this ticket.",
                    )
                )
                self.store.execute(
                    "UPDATE tickets SET claimed_by=? WHERE id=?",
                    (str(actor.id), row["id"]),
                )
            elif action == "close":
                if row["status"] != "open":
                    raise UserError("This ticket is already closed")
                # Stop further messages before taking the transcript snapshot.
                original = channel.overwrites
                saved_permissions = snapshot(channel)
                locked = {
                    target: discord.PermissionOverwrite.from_pair(*overwrite.pair())
                    for target, overwrite in original.items()
                }
                for target, overwrite in locked.items():
                    for permission_name in WRITE_PERMISSIONS:
                        setattr(overwrite, permission_name, False)
                locked[channel.guild.me] = discord.PermissionOverwrite(
                    view_channel=True,
                    send_messages=True,
                    read_message_history=True,
                    manage_channels=True,
                )
                await channel.edit(
                    overwrites=locked,
                    reason=f"GDM ticket #{row['id']} closed by {actor.id}",
                )
                try:
                    transcript = await self.capture(channel)
                except Exception:
                    await channel.edit(
                        overwrites=original,
                        reason="Restore ticket after failed transcript capture",
                    )
                    raise
                now = time.time()
                with self.store.db:
                    self.store.db.execute(
                        "UPDATE tickets SET status='closed',closed_at=?,expires_at=?,transcript=? WHERE id=?",
                        (now, now + RETENTION, transcript, row["id"]),
                    )
                    self.store.db.execute(
                        "INSERT OR REPLACE INTO ticket_permissions VALUES(?, 'close', ?)",
                        (row["id"], json.dumps(saved_permissions)),
                    )
                link = f"{self.bot.env.site_url}/admin/bot-panel/transcript-{row['id']}"
                # Never upload a permanent raw transcript into Discord.
                self.store.queue(
                    panel["transcript_channel_id"],
                    log_embed(
                        f"Ticket #{row['id']} closed",
                        f"[View transcript]({link}) • website admins only • expires in 30 days",
                        {"Panel": row["panel_id"], "Closed by": f"`{actor.id}`"},
                    ).to_dict(),
                )
                await channel.send(
                    embed=log_embed(
                        "Ticket closed",
                        "Your transcript is retained for 30 days. Contact the team if you need to reopen.",
                    ),
                    view=control_view(),
                )
            elif action == "reopen":
                if row["status"] != "closed" or row["expires_at"] <= time.time():
                    raise UserError("Only an unexpired closed ticket can be reopened")
                saved = self.store.one(
                    "SELECT body FROM ticket_permissions WHERE ticket_id=? AND purpose='close'",
                    (row["id"],),
                )
                if not saved:
                    raise UserError(
                        "The saved ticket permissions are missing; ask an admin to restore access"
                    )
                overwrites = restore(channel.guild, json.loads(saved["body"]))
                await channel.edit(
                    overwrites=overwrites, reason=f"GDM ticket #{row['id']} reopened"
                )
                self.store.execute(
                    "UPDATE tickets SET status='open',claimed_by=NULL,transcript=NULL,closed_at=NULL,expires_at=NULL WHERE id=?",
                    (row["id"],),
                )
                self.store.execute(
                    "DELETE FROM ticket_permissions WHERE ticket_id=? AND purpose='close'",
                    (row["id"],),
                )
                await channel.send(embed=log_embed("Ticket reopened", actor.mention))
            elif action in ("lock", "unlock"):
                if row["status"] != "open":
                    raise UserError("Only open tickets can be locked or unlocked")
                saved = self.store.one(
                    "SELECT body FROM ticket_permissions WHERE ticket_id=? AND purpose='lock'",
                    (row["id"],),
                )
                if action == "unlock":
                    if not saved:
                        raise UserError("This ticket is not locked")
                    await channel.edit(
                        overwrites=restore(channel.guild, json.loads(saved["body"])),
                        reason="GDM ticket unlocked",
                    )
                    self.store.execute(
                        "DELETE FROM ticket_permissions WHERE ticket_id=? AND purpose='lock'",
                        (row["id"],),
                    )
                else:
                    if saved:
                        raise UserError("This ticket is already locked")
                    self.store.execute(
                        "INSERT INTO ticket_permissions VALUES(?, 'lock', ?)",
                        (row["id"], json.dumps(snapshot(channel))),
                    )
                    overwrites = {
                        target: discord.PermissionOverwrite.from_pair(*p.pair())
                        for target, p in channel.overwrites.items()
                    }
                    staff_roles = set(panel["staff_roles"])
                    for target, overwrite in overwrites.items():
                        if (
                            target.id != channel.guild.me.id
                            and str(target.id) not in staff_roles
                        ):
                            for permission_name in WRITE_PERMISSIONS:
                                setattr(overwrite, permission_name, False)
                    await channel.edit(
                        overwrites=overwrites, reason="GDM ticket locked"
                    )
            elif action == "delete":
                if row["status"] != "closed" or not row["transcript"]:
                    raise UserError(
                        "Close the ticket and save its transcript before deleting the channel"
                    )
                await channel.delete(
                    reason=f"GDM ticket #{row['id']} deleted by {actor.id}"
                )
                self.store.execute(
                    "UPDATE tickets SET channel_id=NULL WHERE id=?", (row["id"],)
                )
            elif action in ("add", "remove"):
                if (
                    not isinstance(value, discord.Member)
                    or value.guild.id != channel.guild.id
                    or row["status"] != "open"
                ):
                    raise UserError("Choose a server member in an open ticket")
                if action == "remove" and str(value.id) == row["owner_id"]:
                    raise UserError("The ticket creator cannot be removed")
                await channel.set_permissions(
                    value,
                    overwrite=discord.PermissionOverwrite(
                        view_channel=True, send_messages=True, read_message_history=True
                    )
                    if action == "add"
                    else None,
                    reason=f"GDM ticket {action} by {actor.id}",
                )
            elif action == "rename":
                name = re.sub(r"[^a-z0-9-]", "-", str(value).lower()).strip("-")[:70]
                if not name:
                    raise UserError("Choose a channel name")
                await channel.edit(
                    name=f"ticket-{row['id']}-{name}"[:100],
                    reason=f"GDM ticket renamed by {actor.id}",
                )
            else:
                raise UserError("Unknown ticket action")
            self.store.audit(actor.id, "ticket_" + action, f"Ticket #{row['id']}")

    async def recover(self):
        # Reconcile a crash between channel creation and the database update.
        for channel in self.bot.guild.text_channels:
            match = re.fullmatch(r"gdm-ticket:([0-9]+)", channel.topic or "")
            if match:
                self.store.execute(
                    "UPDATE tickets SET channel_id=?,status='open' WHERE id=? AND status='creating'",
                    (str(channel.id), int(match[1])),
                )
        self.store.execute(
            "DELETE FROM tickets WHERE status='creating' AND channel_id IS NULL"
        )
