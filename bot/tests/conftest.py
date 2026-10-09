import asyncio
import discord
import pytest
from gdm_bot.runtime import CommunityBot
from gdm_bot.security import Environment
from gdm_bot.store import Store

GUILD = 1557316326941392908
OWNER = 100000000000000001
BOT = 100000000000000002
MOD = 100000000000000003
USER = 100000000000000004
OTHER = 100000000000000005
KEY = "test-key-" + "x" * 64
ACTOR = "12345678-1234-4234-8234-123456789abc"


def user_data(uid, name, bot=False):
    return {
        "id": str(uid),
        "username": name,
        "discriminator": "0",
        "avatar": None,
        "bot": bot,
    }


def member(guild, bot, uid, name, roles, is_bot=False):
    obj = discord.Member(
        data={
            "user": user_data(uid, name, is_bot),
            "roles": [str(r) for r in roles],
            "joined_at": "2026-01-01T00:00:00+00:00",
            "flags": 0,
            "deaf": False,
            "mute": False,
        },
        guild=guild,
        state=bot._connection,
    )
    guild._members[uid] = obj
    return obj


def text_channel(bot, guild, cid, name, private=False, topic=None):
    data = {
        "id": str(cid),
        "type": 0,
        "name": name,
        "position": 0,
        "topic": topic,
        "permission_overwrites": [
            {"id": str(guild.id), "type": 0, "allow": "0", "deny": "1024"}
        ]
        if private
        else [],
    }
    channel = discord.TextChannel(state=bot._connection, guild=guild, data=data)
    guild._channels[cid] = channel
    return channel


@pytest.fixture
def bot():
    store = Store(":memory:")
    bot = CommunityBot(
        Environment(
            "never-a-real-token", KEY, GUILD, ":memory:", "https://gdmacros.com"
        ),
        store,
    )
    bot._connection.user = discord.ClientUser(
        state=bot._connection, data=user_data(BOT, "GDM bot", True)
    )
    guild = discord.Guild(
        data={
            "id": str(GUILD),
            "name": "Test Community",
            "owner_id": str(OWNER),
            "roles": [
                {
                    "id": str(GUILD),
                    "name": "@everyone",
                    "position": 0,
                    "permissions": str(
                        discord.Permissions(view_channel=True, send_messages=True).value
                    ),
                },
                {
                    "id": "100000000000000010",
                    "name": "Member",
                    "position": 1,
                    "permissions": "0",
                },
                {
                    "id": "100000000000000011",
                    "name": "Staff",
                    "position": 5,
                    "permissions": "0",
                },
                {
                    "id": "100000000000000012",
                    "name": "Bot",
                    "position": 10,
                    "permissions": str(discord.Permissions.all().value),
                },
            ],
            "channels": [],
        },
        state=bot._connection,
    )
    bot._connection._guilds[GUILD] = guild
    member(guild, bot, OWNER, "Owner", [], False)
    member(guild, bot, BOT, "Bot", [100000000000000012], True)
    member(guild, bot, MOD, "Moderator", [100000000000000011])
    member(guild, bot, USER, "Member", [100000000000000010])
    member(guild, bot, OTHER, "Other", [100000000000000010])
    text_channel(bot, guild, 100000000000000020, "general")
    text_channel(bot, guild, 100000000000000021, "cases", True)
    text_channel(bot, guild, 100000000000000022, "honeypot")
    bot._ready = asyncio.Event()
    bot._ready.set()
    bot.settings.moderation.case_channel_id = "100000000000000021"
    yield bot
    store.close()
