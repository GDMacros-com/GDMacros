import json
from unittest.mock import AsyncMock
import discord
import pytest
from gdm_bot.moderation import snapshot
from gdm_bot.security import UserError, permission, hierarchy
from gdm_bot.models import CommandPermission
from conftest import OWNER, MOD, USER, BOT


def test_selected_roles_and_owner(bot):
    rule = CommandPermission(roles=["100000000000000011"])
    assert permission(bot.guild.get_member(MOD), bot.guild, rule)
    assert permission(bot.guild.get_member(OWNER), bot.guild, rule)
    assert not permission(bot.guild.get_member(USER), bot.guild, rule)
    assert not permission(bot.guild.me, bot.guild, rule)
    rule.enabled = False
    assert not permission(bot.guild.get_member(OWNER), bot.guild, rule)


def test_hierarchy(bot):
    hierarchy(
        bot.guild.get_member(MOD), bot.guild.get_member(USER), bot.guild, bot.guild.me
    )
    for uid in (OWNER, MOD, BOT):
        with pytest.raises(UserError):
            hierarchy(
                bot.guild.get_member(MOD),
                bot.guild.get_member(uid),
                bot.guild,
                bot.guild.me,
            )


async def test_failed_actions_do_not_create_cases(bot, monkeypatch):
    monkeypatch.setattr(
        discord.Member,
        "kick",
        AsyncMock(
            side_effect=discord.Forbidden(
                type("R", (), {"status": 403, "reason": "Forbidden"})(), "Denied"
            )
        ),
    )
    with pytest.raises(discord.Forbidden):
        await bot.moderation.member_action(
            "kick", bot.guild.get_member(MOD), bot.guild.get_member(USER), "reason"
        )
    assert not bot.store.rows("SELECT * FROM cases")


async def test_successful_action_records_and_queues(bot, monkeypatch):
    kick = AsyncMock()
    monkeypatch.setattr(discord.Member, "kick", kick)
    number = await bot.moderation.member_action(
        "kick", bot.guild.get_member(MOD), bot.guild.get_member(USER), "Example reason"
    )
    assert number == 1 and kick.await_count == 1
    case = bot.store.one("SELECT * FROM cases")
    assert case["actor_id"] == str(MOD) and case["target_id"] == str(USER)
    assert bot.store.one("SELECT case_id FROM outbox")["case_id"] == number


async def test_timeout_limit(bot, monkeypatch):
    timeout = AsyncMock()
    monkeypatch.setattr(discord.Member, "timeout", timeout)
    with pytest.raises(UserError):
        await bot.moderation.member_action(
            "mute",
            bot.guild.get_member(MOD),
            bot.guild.get_member(USER),
            "reason",
            40321,
        )
    assert not timeout.await_count
    await bot.moderation.member_action(
        "mute", bot.guild.get_member(MOD), bot.guild.get_member(USER), "reason", 60
    )
    assert timeout.call_args.args[0].total_seconds() == 3600


async def test_exact_lock_restore_and_duplicate_lock(bot, monkeypatch):
    channel = bot.guild.get_channel(100000000000000020)
    role = bot.guild.get_role(100000000000000010)
    from discord.abc import _Overwrites

    channel._overwrites = [
        _Overwrites(
            {
                "id": str(role.id),
                "type": 0,
                "allow": str(
                    discord.Permissions(send_messages=True, attach_files=True).value
                ),
                "deny": str(discord.Permissions(manage_messages=True).value),
            }
        )
    ]
    original = snapshot(channel)
    calls = []

    async def edit(self, **kwargs):
        calls.append(kwargs)

    monkeypatch.setattr(discord.TextChannel, "edit", edit)
    await bot.moderation.channel_lock(channel, bot.guild.get_member(MOD), "Locked")
    assert calls[-1]["overwrites"][role].send_messages is False
    assert calls[-1]["overwrites"][bot.guild.owner].send_messages is True
    with pytest.raises(UserError):
        await bot.moderation.channel_lock(channel, bot.guild.get_member(MOD), "Again")
    await bot.moderation.channel_lock(
        channel, bot.guild.get_member(MOD), "Unlocked", True
    )
    result = calls[-1]["overwrites"][role].pair()
    assert (
        result[0].value == original[0]["allow"]
        and result[1].value == original[0]["deny"]
    )
    assert not bot.store.rows("SELECT * FROM locks")


async def test_failed_unlock_keeps_snapshot(bot, monkeypatch):
    bot.store.execute("INSERT INTO locks VALUES(?,?)", ("100000000000000020", "[]"))
    monkeypatch.setattr(
        discord.TextChannel,
        "edit",
        AsyncMock(
            side_effect=discord.Forbidden(
                type("R", (), {"status": 403, "reason": "Forbidden"})(), "Denied"
            )
        ),
    )
    with pytest.raises(discord.Forbidden):
        await bot.moderation.channel_lock(
            bot.guild.get_channel(100000000000000020),
            bot.guild.get_member(MOD),
            "Unlock",
            True,
        )
    assert bot.store.rows("SELECT * FROM locks")


async def test_softban_recovery_survives_restart(bot, monkeypatch):
    monkeypatch.setattr(discord.Guild, "ban", AsyncMock())
    monkeypatch.setattr(
        discord.Guild,
        "unban",
        AsyncMock(
            side_effect=discord.Forbidden(
                type("R", (), {"status": 403, "reason": "Forbidden"})(), "Denied"
            )
        ),
    )
    with pytest.raises(UserError):
        await bot.moderation.member_action(
            "softban",
            bot.guild.get_member(MOD),
            bot.guild.get_member(USER),
            "reason",
            900,
        )
    assert bot.store.rows("SELECT * FROM pending_unbans")
    assert not bot.store.rows("SELECT * FROM cases")
    monkeypatch.setattr(discord.Guild, "unban", AsyncMock())
    await bot.moderation.retry_unbans()
    assert bot.store.one("SELECT action FROM cases")["action"] == "softban"
    assert json.loads(bot.store.one("SELECT reason FROM pending_unbans")["reason"])[
        "completed"
    ]


async def test_unknown_interrupted_softban_does_not_invent_case(bot, monkeypatch):
    bot.store.execute(
        "INSERT INTO pending_unbans VALUES(?,?,0)",
        (
            str(USER),
            json.dumps({"actor": str(MOD), "reason": "Interrupted", "details": {}}),
        ),
    )
    monkeypatch.setattr(
        discord.Guild,
        "unban",
        AsyncMock(
            side_effect=discord.NotFound(
                type("R", (), {"status": 404, "reason": "Not found"})(), "Unknown ban"
            )
        ),
    )
    await bot.moderation.retry_unbans()
    assert not bot.store.rows("SELECT * FROM cases")
    assert "no successful case" in bot.store.one("SELECT body FROM outbox")["body"]


def test_case_filters_are_parameterized(bot):
    bot.store.case("warn", USER, MOD, "test")
    assert bot.store.cases(target=str(USER))["total"] == 1
    assert bot.store.cases(target="' OR 1=1 --")["total"] == 0
