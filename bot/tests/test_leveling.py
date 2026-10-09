from unittest.mock import AsyncMock
import pytest
from pydantic import ValidationError
from gdm_bot.leveling import (
    level_for,
    threshold,
    normalize_import,
    desired_rewards,
    rank_image,
    safe_background,
)
from gdm_bot.models import Leveling, Reward
from gdm_bot.security import UserError
from conftest import USER, OTHER


def export(uid=str(USER), xp=8173, level=10):
    return {
        "levels": [
            {
                "userId": uid,
                "xp": xp,
                "level": level,
                "messageCount": 139,
                "user": {"username": "Synthetic member", "avatar": None},
            }
        ]
    }


def test_custom_curve_matches_screenshots():
    c = Leveling().coefficients
    assert threshold(1, c) == 299
    assert threshold(10, c) == 6835
    assert threshold(50, c) == 235775
    assert threshold(100, c) == 1375150
    assert threshold(0, c) == 0
    for n in range(1, 1001):
        assert level_for(threshold(n, c), c) == n
        assert level_for(threshold(n, c) - 1, c) == n - 1


def test_rounding_matches_js():
    assert threshold(1, [0.0, 2.5]) == 3


@pytest.mark.parametrize(
    "curve",
    [[0.0, 0.0], [-1.0, -1.0], [float("nan"), 1.0], [0.0, -1.0, 1.0], [1e30, 1.0]],
)
def test_bad_curves_rejected(curve):
    with pytest.raises(ValidationError):
        Leveling(coefficients=curve)


@pytest.mark.parametrize(
    "curve",
    [[150.0, -100.0, 50.0], [55.0, -40.0, 20.0], [0.0, 75.833333, 22.5, 1.666667]],
)
def test_presets_valid(curve):
    Leveling(coefficients=curve)


def test_import_checks_curve():
    rows, mismatches = normalize_import(export(), Leveling())
    assert rows[0]["xp"] == 8173 and not mismatches
    assert (
        normalize_import(export(level=99), Leveling())[1][0]["calculated_level"] == 10
    )


@pytest.mark.parametrize(
    "field,value",
    [
        ("xp", -1),
        ("xp", True),
        ("xp", float("nan")),
        ("level", -1),
        ("messageCount", 1.2),
        ("userId", "../../private"),
    ],
)
def test_invalid_import_rejected(field, value):
    data = export()
    data["levels"][0][field] = value
    with pytest.raises(UserError):
        normalize_import(data, Leveling())


def test_duplicate_import_atomic(bot):
    data = export()
    data["levels"] *= 2
    with pytest.raises(UserError):
        normalize_import(data, bot.settings.leveling)
    assert not bot.store.rows("SELECT * FROM levels")


def test_merge_never_loses_xp_or_privacy(bot):
    rows, _ = normalize_import(export(), bot.settings.leveling)
    bot.leveling.import_rows(rows, "merge_larger", "test")
    bot.store.execute(
        "UPDATE levels SET xp=9000,hidden=1 WHERE user_id=?", (str(USER),)
    )
    bot.leveling.import_rows(rows, "merge_larger", "test")
    row = bot.store.one("SELECT * FROM levels WHERE user_id=?", (str(USER),))
    assert row["xp"] == 9000 and row["hidden"] == 1
    bot.leveling.import_rows(rows, "replace_imported", "test")
    assert (
        bot.store.one("SELECT xp FROM levels WHERE user_id=?", (str(USER),))["xp"]
        == 8173
    )


def test_stack_rules():
    rewards = [
        Reward(level=5, roles=[str(USER)]),
        Reward(level=10, roles=[str(OTHER)], stack=False),
    ]
    assert desired_rewards(5, rewards) == {str(USER)}
    assert desired_rewards(10, rewards) == {str(OTHER)}


async def test_xp_cooldown_and_privacy(bot):
    s = bot.settings.leveling
    s.enabled = True
    s.min_xp = s.max_xp = 20
    user = bot.guild.get_member(USER)
    channel = bot.guild.get_channel(100000000000000020)
    await bot.leveling.award(user, channel, "hello")
    await bot.leveling.award(user, channel, "again")
    row = bot.store.one("SELECT * FROM levels WHERE user_id=?", (str(USER),))
    assert row["xp"] == 20 and row["messages"] == 1
    bot.store.execute(
        "UPDATE levels SET hidden=1,last_xp=0 WHERE user_id=?", (str(USER),)
    )
    await bot.leveling.award(user, channel, "private")
    assert (
        bot.store.one("SELECT xp FROM levels WHERE user_id=?", (str(USER),))["xp"] == 20
    )


async def test_channel_prefix_and_role_exclusions(bot):
    s = bot.settings.leveling
    s.enabled = True
    s.channels = ["100000000000000020"]
    user = bot.guild.get_member(USER)
    channel = bot.guild.get_channel(100000000000000020)
    await bot.leveling.award(user, channel, "hello")
    assert not bot.store.rows("SELECT * FROM levels")
    s.channels = []
    s.ignored_prefixes = ["?"]
    await bot.leveling.award(user, channel, "?rank")
    assert not bot.store.rows("SELECT * FROM levels")
    s.ignored_prefixes = []
    s.blacklisted_roles = ["100000000000000010"]
    await bot.leveling.award(user, channel, "hello")
    assert not bot.store.rows("SELECT * FROM levels")


async def test_ticket_messages_never_earn_xp(bot):
    bot.settings.leveling.enabled = True
    bot.store.execute(
        "INSERT INTO tickets(panel_id,channel_id,owner_id,created_at,panel_snapshot) VALUES('p',?,?,0,'{}')",
        ("100000000000000020", str(USER)),
    )
    await bot.leveling.award(
        bot.guild.get_member(USER),
        bot.guild.get_channel(100000000000000020),
        "private ticket",
    )
    assert not bot.store.rows("SELECT * FROM levels")


def test_public_board_does_not_leak_private_fields(bot):
    bot.settings.leveling.enabled = True
    bot.store.ensure_member(USER, "Public member")
    bot.store.ensure_member(OTHER, "Hidden member")
    bot.store.execute("UPDATE levels SET hidden=1 WHERE user_id=?", (str(OTHER),))
    board = bot.leveling.board()
    assert len(board["entries"]) == 1
    assert set(board["entries"][0]) == {
        "position",
        "user_id",
        "username",
        "avatar",
        "xp",
        "messages",
        "level",
        "progress",
    }
    bot.settings.leveling.leaderboard_public = False
    assert not bot.leveling.board()["available"]


async def test_blocked_dms_do_not_lose_xp(bot, monkeypatch):
    bot.settings.leveling.enabled = True
    bot.settings.leveling.notification_every = 1
    bot.settings.leveling.max_xp = 300
    bot.settings.leveling.min_xp = 300
    monkeypatch.setattr(
        "discord.Member.send",
        AsyncMock(
            side_effect=__import__("discord").Forbidden(
                type("R", (), {"status": 403, "reason": "Forbidden"})(), "Closed DMs"
            )
        ),
    )
    await bot.leveling.award(
        bot.guild.get_member(USER),
        bot.guild.get_channel(100000000000000020),
        "level up",
    )
    assert (
        bot.store.one("SELECT xp FROM levels WHERE user_id=?", (str(USER),))["xp"]
        == 300
    )


def test_rank_image_and_background():
    image = rank_image(
        {"username": "Member", "xp": 8173, "messages": 139},
        Leveling().coefficients,
        "#bebebe",
    )
    clean = safe_background(image.getvalue())
    assert clean.startswith(b"\xff\xd8")
    with pytest.raises(UserError):
        safe_background(b"<script>alert(1)</script>")
