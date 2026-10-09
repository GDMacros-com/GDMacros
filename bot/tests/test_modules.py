import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock
import discord
import pytest
from gdm_bot.events import EventLogs
from gdm_bot.models import TicketPanel
from gdm_bot.security import UserError
from gdm_bot.store import RETENTION
from conftest import MOD, USER, OTHER, text_channel


def category(bot, cid=100000000000000030):
    c = discord.CategoryChannel(
        state=bot._connection,
        guild=bot.guild,
        data={
            "id": str(cid),
            "name": "Tickets",
            "position": 0,
            "permission_overwrites": [],
        },
    )
    bot.guild._channels[cid] = c
    return c


def voice(bot, cid, name="Voice", cat=None):
    c = discord.VoiceChannel(
        state=bot._connection,
        guild=bot.guild,
        data={
            "id": str(cid),
            "name": name,
            "position": 0,
            "bitrate": 64000,
            "user_limit": 0,
            "permission_overwrites": [],
            "parent_id": str(cat.id) if cat else None,
        },
    )
    bot.guild._channels[cid] = c
    return c


def ticket_panel(bot):
    category(bot)
    p = TicketPanel(
        id="support",
        name="Support",
        channel_id="100000000000000020",
        category_id="100000000000000030",
        transcript_channel_id="100000000000000021",
        staff_roles=["100000000000000011"],
    )
    bot.settings.tickets.panels = [p]
    bot.settings.tickets.enabled = True
    return p


def ticket_row(bot, channel, owner=USER, panel=None):
    panel = panel or ticket_panel(bot)
    return bot.store.execute(
        "INSERT INTO tickets(panel_id,channel_id,owner_id,created_at,panel_snapshot) VALUES(?,?,?,?,?)",
        (panel.id, str(channel.id), str(owner), time.time(), panel.model_dump_json()),
    ).lastrowid


async def test_ticket_open_permissions_and_concurrent_limit(bot, monkeypatch):
    p = ticket_panel(bot)
    channel = text_channel(
        bot, bot.guild, 100000000000000040, "ticket-0001", True, "gdm-ticket:1"
    )
    created = AsyncMock(return_value=channel)
    monkeypatch.setattr(discord.Guild, "create_text_channel", created)
    monkeypatch.setattr(discord.TextChannel, "send", AsyncMock())
    results = await asyncio.gather(
        bot.tickets.open(p.id, bot.guild.get_member(USER), "Hello"),
        bot.tickets.open(p.id, bot.guild.get_member(USER), "Again"),
        return_exceptions=True,
    )
    assert created.await_count == 1
    assert any(isinstance(x, UserError) for x in results)
    overwrites = created.call_args.kwargs["overwrites"]
    assert overwrites[bot.guild.default_role].view_channel is False
    assert overwrites[bot.guild.get_member(USER)].view_channel is True
    assert overwrites[bot.guild.get_role(100000000000000011)].view_channel is True
    assert bot.guild.get_member(OTHER) not in overwrites


async def test_ticket_controls_reject_nonstaff(bot):
    channel = bot.guild.get_channel(100000000000000020)
    ticket_row(bot, channel)
    with pytest.raises(UserError):
        await bot.tickets.action("claim", channel, bot.guild.get_member(OTHER))
    with pytest.raises(UserError):
        await bot.tickets.action("reopen", channel, bot.guild.get_member(USER))


async def test_ticket_close_retention_and_notice_has_no_raw_content(bot, monkeypatch):
    channel = bot.guild.get_channel(100000000000000020)
    number = ticket_row(bot, channel)
    monkeypatch.setattr(discord.TextChannel, "edit", AsyncMock())
    monkeypatch.setattr(discord.TextChannel, "send", AsyncMock())
    bot.tickets.capture = AsyncMock(
        return_value=json.dumps(
            [
                {
                    "content": "private transcript text",
                    "author": "Test",
                    "author_id": str(USER),
                    "id": "1",
                    "created_at": "2026-10-09T00:00:00Z",
                    "edited_at": None,
                    "embeds": [],
                    "attachments": [],
                }
            ]
        )
    )
    await bot.tickets.action("close", channel, bot.guild.get_member(USER))
    row = bot.store.transcript(number)
    assert row["expires_at"] - row["closed_at"] == RETENTION
    queued = bot.store.one("SELECT body FROM outbox")["body"]
    assert "private transcript text" not in queued
    assert f"transcript-{number}" in queued
    assert json.loads(row["transcript"])[0]["content"] == "private transcript text"


async def test_failed_capture_restores_permissions(bot, monkeypatch):
    channel = bot.guild.get_channel(100000000000000020)
    ticket_row(bot, channel)
    edit = AsyncMock()
    monkeypatch.setattr(discord.TextChannel, "edit", edit)
    bot.tickets.capture = AsyncMock(side_effect=UserError("Capture failed"))
    with pytest.raises(UserError):
        await bot.tickets.action("close", channel, bot.guild.get_member(USER))
    assert edit.await_count == 2
    assert bot.store.one("SELECT status FROM tickets")["status"] == "open"
    assert not bot.store.one("SELECT transcript FROM tickets")["transcript"]


async def test_ticket_messages_excluded_from_general_logs(bot):
    channel = bot.guild.get_channel(100000000000000020)
    ticket_row(bot, channel)
    rule = bot.settings.moderation.logs["message_delete"]
    rule.channel_id = "100000000000000021"
    rule.enabled = True
    logs = EventLogs(bot)
    await logs.emit("message_delete", "Deleted", "never public", channel=channel)
    assert not bot.store.rows("SELECT * FROM outbox")


async def test_unset_log_rule_does_not_emit(bot):
    await EventLogs(bot).emit("member_join", "Join", "no log")
    assert not bot.store.rows("SELECT * FROM outbox")


async def test_honeypot_exempt_roles_and_bot_messages(bot):
    s = bot.settings.honeypot
    s.channel_id = "100000000000000022"
    s.enabled = True
    s.exempt_roles = ["100000000000000011"]
    bot.moderation.member_action = AsyncMock()
    channel = bot.guild.get_channel(100000000000000022)
    message = SimpleNamespace(
        channel=channel, author=bot.guild.get_member(MOD), webhook_id=None
    )
    assert await bot.moderation.honeypot(message)
    assert not bot.moderation.member_action.await_count
    message.author = bot.guild.me
    assert not await bot.moderation.honeypot(message)


async def test_honeypot_uses_softban_and_configured_window(bot, monkeypatch):
    s = bot.settings.honeypot
    s.channel_id = "100000000000000022"
    s.enabled = True
    s.delete_seconds = 900
    bot.moderation.member_action = AsyncMock()
    monkeypatch.setattr(discord.Member, "send", AsyncMock())
    message = SimpleNamespace(
        channel=bot.guild.get_channel(100000000000000022),
        author=bot.guild.get_member(USER),
        webhook_id=None,
    )
    assert await bot.moderation.honeypot(message)
    assert bot.moderation.member_action.call_args.args[0] == "softban"
    assert bot.moderation.member_action.call_args.args[-1] == 900


async def test_softban_does_not_reset_xp(bot):
    bot.store.ensure_member(USER, "Member")
    bot.store.execute("UPDATE levels SET xp=8173")
    bot.store.execute(
        "INSERT INTO pending_unbans VALUES(?,?,?)",
        (str(USER), json.dumps({"completed": True}), time.time()),
    )
    await EventLogs(bot).on_member_ban(bot.guild, bot.guild.get_member(USER))
    assert bot.store.one("SELECT xp FROM levels")["xp"] == 8173


async def test_voice_creation_move_and_empty_cleanup(bot, monkeypatch):
    cat = category(bot)
    lobby = voice(bot, 100000000000000050, "Create voice", cat)
    made = voice(bot, 100000000000000051, "Member's vc", cat)
    bot.settings.tempvoice.lobby_id = str(lobby.id)
    bot.settings.tempvoice.category_id = str(cat.id)
    bot.settings.tempvoice.enabled = True
    create = AsyncMock(return_value=made)
    move = AsyncMock()
    delete = AsyncMock()
    monkeypatch.setattr(discord.Guild, "create_voice_channel", create)
    monkeypatch.setattr(discord.Member, "move_to", move)
    monkeypatch.setattr(discord.VoiceChannel, "delete", delete)
    member = bot.guild.get_member(USER)
    await bot.voice.update(
        member, SimpleNamespace(channel=None), SimpleNamespace(channel=lobby)
    )
    assert create.await_count == 1 and move.call_args.args[0] == made
    assert create.call_args.args[0] == "Member's vc"
    assert bot.store.one("SELECT owner_id FROM voice")["owner_id"] == str(USER)
    await bot.voice.update(
        member, SimpleNamespace(channel=made), SimpleNamespace(channel=None)
    )
    assert delete.await_count == 1 and not bot.store.rows("SELECT * FROM voice")


async def test_voice_ownership_enforced(bot):
    channel = voice(bot, 100000000000000051)
    bot.store.execute("INSERT INTO voice VALUES(?,?,0)", (str(channel.id), str(USER)))
    bot.guild._voice_states[OTHER] = discord.VoiceState(
        data={"session_id": "test"}, channel=channel
    )
    with pytest.raises(UserError):
        await bot.voice.control(bot.guild.get_member(OTHER), "name", "Unauthorized")


async def test_voice_lock_overrides_role_allows_and_unlock_restores(bot, monkeypatch):
    from discord.abc import _Overwrites

    channel = voice(bot, 100000000000000051)
    role = bot.guild.get_role(100000000000000010)
    original = discord.Permissions(connect=True, view_channel=True).value
    channel._overwrites = [
        _Overwrites(
            {"id": str(role.id), "type": 0, "allow": str(original), "deny": "0"}
        )
    ]
    bot.store.execute("INSERT INTO voice VALUES(?,?,0)", (str(channel.id), str(USER)))
    bot.guild._voice_states[USER] = discord.VoiceState(
        data={"session_id": "test"}, channel=channel
    )
    edit = AsyncMock()
    monkeypatch.setattr(discord.VoiceChannel, "edit", edit)
    await bot.voice.control(bot.guild.get_member(USER), "lock")
    overwrites = edit.call_args.kwargs["overwrites"]
    assert overwrites[role].connect is False
    assert overwrites[bot.guild.default_role].connect is False
    assert overwrites[bot.guild.get_member(USER)].connect is True
    with pytest.raises(UserError):
        await bot.voice.control(bot.guild.get_member(USER), "lock")
    await bot.voice.control(bot.guild.get_member(USER), "unlock")
    restored = edit.call_args.kwargs["overwrites"]
    assert restored[role].pair()[0].value == original
    assert bot.guild.default_role not in restored
    assert not bot.store.rows("SELECT * FROM voice_permissions")


async def test_honeypot_message_burst_only_softbans_once(bot, monkeypatch):
    bot.settings.honeypot.enabled = True
    bot.settings.honeypot.channel_id = "100000000000000022"
    bot.moderation.member_action = AsyncMock()
    monkeypatch.setattr(discord.Member, "send", AsyncMock())
    message = SimpleNamespace(
        channel=bot.guild.get_channel(100000000000000022),
        author=bot.guild.get_member(USER),
        webhook_id=None,
    )
    await asyncio.gather(*(bot.moderation.honeypot(message) for _ in range(20)))
    assert bot.moderation.member_action.await_count == 1
    message.author.joined_at = discord.utils.utcnow()
    await bot.moderation.honeypot(message)
    assert bot.moderation.member_action.await_count == 2


async def test_reopening_preserves_added_ticket_participants(bot, monkeypatch):
    from discord.abc import _Overwrites

    channel = bot.guild.get_channel(100000000000000020)
    number = ticket_row(bot, channel)
    channel._overwrites.append(
        _Overwrites(
            {
                "id": str(OTHER),
                "type": 1,
                "allow": str(
                    discord.Permissions(send_messages=True, view_channel=True).value
                ),
                "deny": "0",
            }
        )
    )
    edit = AsyncMock()
    monkeypatch.setattr(discord.TextChannel, "edit", edit)
    monkeypatch.setattr(discord.TextChannel, "send", AsyncMock())
    bot.tickets.capture = AsyncMock(return_value="[]")
    await bot.tickets.action("close", channel, bot.guild.get_member(USER))
    await bot.tickets.action("reopen", channel, bot.guild.get_member(MOD))
    overwrites = edit.call_args.kwargs["overwrites"]
    assert overwrites[bot.guild.get_member(OTHER)].send_messages is True
    assert overwrites[bot.guild.get_member(OTHER)].view_channel is True
    assert bot.store.one(
        "SELECT status,transcript FROM tickets WHERE id=?", (number,)
    ) == {"status": "open", "transcript": None}


async def test_private_ticket_thread_has_no_general_log_or_public_xp(bot):
    channel = bot.guild.get_channel(100000000000000020)
    ticket_row(bot, channel)
    thread = SimpleNamespace(id=100000000000000060, parent_id=channel.id)
    bot.settings.moderation.logs["message_edit"].enabled = True
    bot.settings.moderation.logs["message_edit"].channel_id = "100000000000000021"
    bot.settings.leveling.enabled = True
    bot.settings.leveling.threads = True
    await EventLogs(bot).emit("message_edit", "Private edited text", channel=thread)
    await bot.leveling.award(
        bot.guild.get_member(USER), thread, "Private ticket message"
    )
    assert not bot.store.rows("SELECT * FROM outbox")
    assert not bot.store.rows("SELECT * FROM levels")


async def test_panel_edit_reuses_message(bot, monkeypatch):
    p = ticket_panel(bot)
    bot.store.execute(
        "INSERT INTO published VALUES(?,?,?)",
        ("panel:support", p.channel_id, "100000000000000099"),
    )
    message = SimpleNamespace(edit=AsyncMock())
    monkeypatch.setattr(
        discord.TextChannel, "fetch_message", AsyncMock(return_value=message)
    )
    send = AsyncMock()
    monkeypatch.setattr(discord.TextChannel, "send", send)
    await bot.tickets.publish("support")
    assert message.edit.await_count == 1 and not send.await_count


async def test_ticket_lock_preserves_staff_access_and_snapshot(bot, monkeypatch):
    channel = bot.guild.get_channel(100000000000000020)
    number = ticket_row(bot, channel)
    from discord.abc import _Overwrites

    channel._overwrites = [
        _Overwrites(
            {
                "id": str(USER),
                "type": 1,
                "allow": str(
                    discord.Permissions(send_messages=True, view_channel=True).value
                ),
                "deny": "0",
            }
        ),
        _Overwrites(
            {
                "id": "100000000000000011",
                "type": 0,
                "allow": str(
                    discord.Permissions(send_messages=True, view_channel=True).value
                ),
                "deny": "0",
            }
        ),
    ]
    edit = AsyncMock()
    monkeypatch.setattr(discord.TextChannel, "edit", edit)
    await bot.tickets.action("lock", channel, bot.guild.get_member(MOD))
    overwrites = edit.call_args.kwargs["overwrites"]
    assert not overwrites[bot.guild.get_member(USER)].send_messages
    assert overwrites[bot.guild.get_role(100000000000000011)].send_messages
    with pytest.raises(UserError):
        await bot.tickets.action("lock", channel, bot.guild.get_member(MOD))
    await bot.tickets.action("unlock", channel, bot.guild.get_member(MOD))
    assert edit.call_args.kwargs["overwrites"][bot.guild.get_member(USER)].send_messages
    assert not bot.store.rows(
        "SELECT * FROM ticket_permissions WHERE ticket_id=?", (number,)
    )


async def test_honeypot_warning_failure_does_not_activate(bot, monkeypatch):
    from gdm_bot.models import Settings

    settings = Settings.model_validate(bot.settings.model_dump())
    settings.honeypot.channel_id = "100000000000000022"
    settings.honeypot.enabled = True
    monkeypatch.setattr(
        discord.TextChannel,
        "send",
        AsyncMock(
            side_effect=discord.Forbidden(
                type("R", (), {"status": 403, "reason": "Forbidden"})(), "Denied"
            )
        ),
    )
    with pytest.raises(discord.Forbidden):
        await bot.save_settings(1, settings, "test")
    assert not bot.settings.honeypot.enabled and bot.revision == 1


async def test_boost_event_queues_configured_embed(bot):
    s = bot.settings.boostnotifications
    s.channel_id = "100000000000000020"
    s.enabled = True
    message = SimpleNamespace(
        guild=bot.guild,
        channel=bot.guild.get_channel(100000000000000020),
        type=discord.MessageType.premium_guild_subscription,
        author=bot.guild.get_member(USER),
        webhook_id=None,
    )
    await bot.on_message(message)
    queued = bot.store.one("SELECT body FROM outbox")
    assert "boosted" in queued["body"] and "Test Community" in queued["body"]
