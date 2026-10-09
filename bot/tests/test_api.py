import time
import pytest
from gdm_bot.api import application
from gdm_bot.commands import CommunityCommands
from gdm_bot.store import Store
from conftest import KEY, ACTOR, USER, MOD
from test_leveling import export


def auth(actor=ACTOR):
    return {"Authorization": "Bearer " + KEY, "X-GDM-Actor": actor}


@pytest.mark.parametrize(
    "path",
    ["/v1/state", "/v1/cases", "/v1/tickets", "/v1/transcripts/1", "/v1/leaderboard"],
)
async def test_all_private_reads_need_key(bot, aiohttp_client, path):
    client = await aiohttp_client(application(bot))
    assert (await client.get(path)).status == 401
    assert (
        await client.get(
            path, headers={"Authorization": "Bearer wrong", "X-GDM-Actor": ACTOR}
        )
    ).status == 401


async def test_public_identity_cannot_read_private_data(bot, aiohttp_client):
    client = await aiohttp_client(application(bot))
    for path in ("state", "cases", "tickets", "transcripts/1"):
        assert (
            await client.get("/v1/" + path, headers=auth("public-leaderboard"))
        ).status == 403
    assert (
        await client.get("/v1/leaderboard", headers=auth("public-leaderboard"))
    ).status == 200
    assert (
        await client.put("/v1/settings", headers=auth("public-leaderboard"), json={})
    ).status == 403


async def test_admin_identity_required(bot, aiohttp_client):
    client = await aiohttp_client(application(bot))
    assert (await client.get("/v1/cases", headers=auth("mod"))).status == 403


async def test_state_has_no_credentials(bot, aiohttp_client):
    client = await aiohttp_client(application(bot))
    response = await client.get("/v1/state", headers=auth())
    text = await response.text()
    assert response.status == 200
    assert KEY not in text and bot.env.token not in text and "database" not in text
    assert response.headers["Cache-Control"] == "private, no-store"
    assert not response.headers.get("Access-Control-Allow-Origin")


async def test_settings_revision_and_public_log_guard(bot, aiohttp_client):
    client = await aiohttp_client(application(bot))
    data = bot.settings.model_dump()
    response = await client.put(
        "/v1/settings",
        headers=auth(),
        json={"revision": bot.revision, "settings": data},
    )
    assert response.status == 200
    assert bot.revision == 2
    assert (
        await client.put(
            "/v1/settings", headers=auth(), json={"revision": 1, "settings": data}
        )
    ).status == 409
    data["moderation"]["case_channel_id"] = "100000000000000020"
    response = await client.put(
        "/v1/settings", headers=auth(), json={"revision": 2, "settings": data}
    )
    assert response.status == 400
    assert bot.revision == 2


async def test_unknown_settings_and_public_dangerous_command_rejected(
    bot, aiohttp_client
):
    client = await aiohttp_client(application(bot))
    data = bot.settings.model_dump()
    data["secret"] = "should-never-be-echoed"
    response = await client.put(
        "/v1/settings", headers=auth(), json={"revision": 1, "settings": data}
    )
    assert (
        response.status == 400 and "should-never-be-echoed" not in await response.text()
    )
    data.pop("secret")
    data["moderation"]["commands"]["ban"]["everyone"] = True
    assert (
        await client.put(
            "/v1/settings", headers=auth(), json={"revision": 1, "settings": data}
        )
    ).status == 400


async def test_import_preview_then_atomic_commit(bot, aiohttp_client):
    client = await aiohttp_client(application(bot))
    data = {"revision": 1, "export": export(), "mode": "merge_larger", "apply": False}
    response = await client.post("/v1/import", headers=auth(), json=data)
    assert response.status == 200 and (await response.json())["count"] == 1
    assert not bot.store.rows("SELECT * FROM levels")
    data["apply"] = True
    assert (await client.post("/v1/import", headers=auth(), json=data)).status == 400
    data["confirmed"] = True
    assert (await client.post("/v1/import", headers=auth(), json=data)).status == 200
    assert bot.store.one("SELECT xp FROM levels")["xp"] == 8173


async def test_curve_mismatch_never_applied(bot, aiohttp_client):
    client = await aiohttp_client(application(bot))
    response = await client.post(
        "/v1/import",
        headers=auth(),
        json={
            "revision": 1,
            "export": export(level=99),
            "apply": True,
            "confirmed": True,
            "mode": "merge_larger",
        },
    )
    assert response.status == 400 and not bot.store.rows("SELECT * FROM levels")


async def test_transcript_expiry_enforced_before_cleanup(bot, aiohttp_client):
    client = await aiohttp_client(application(bot))
    bot.store.execute(
        "INSERT INTO tickets(panel_id,owner_id,created_at,closed_at,expires_at,transcript,panel_snapshot) VALUES('p',?,0,0,?,'[]','{}')",
        (str(USER), time.time() + 20),
    )
    assert (await client.get("/v1/transcripts/1", headers=auth())).status == 200
    bot.store.execute("UPDATE tickets SET expires_at=0")
    assert (await client.get("/v1/transcripts/1", headers=auth())).status == 404
    assert bot.store.rows("SELECT * FROM tickets")
    bot.store.cleanup()
    assert not bot.store.rows("SELECT * FROM tickets")


async def test_body_size_limit(bot, aiohttp_client):
    client = await aiohttp_client(application(bot))
    response = await client.post(
        "/v1/import", headers=auth(), data="x" * (2 * 1024 * 1024 + 1)
    )
    assert response.status == 413


async def test_action_confirmation_required(bot, aiohttp_client):
    client = await aiohttp_client(application(bot))
    assert (
        await client.post("/v1/actions/test-boost", headers=auth(), json={})
    ).status == 400
    assert (
        await client.post(
            "/v1/actions/run-shell", headers=auth(), json={"confirmed": True}
        )
    ).status == 404


async def test_all_requested_slash_commands_register(bot):
    async with bot:
        await bot.add_cog(CommunityCommands(bot))
        expected = {
            "boostnotis",
            "honeypot",
            "moderation",
            "leveling",
            "tickets",
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
            "rank",
            "leaderboard",
            "level",
            "xp",
            "colour",
            "background",
            "privacy",
            "wrapped",
        }
        assert expected <= {c.name for c in bot.tree.get_commands()}
        for command in bot.tree.get_commands():
            command.to_dict(bot.tree)
        for name in ["boostnotis", "honeypot", "moderation", "leveling", "tickets"]:
            assert bot.tree.get_command(name).get_command("dashboard")


def test_database_restart_and_secure_expiry(tmp_path):
    path = tmp_path / "private.sqlite3"
    store = Store(str(path))
    store.case("warn", USER, MOD, "Persist this")
    store.execute(
        "INSERT INTO tickets(panel_id,channel_id,owner_id,created_at,expires_at,transcript,panel_snapshot) VALUES('p',?,?,0,1,'secret transcript','{}')",
        ("100000000000000025", str(USER)),
    )
    store.close()
    store = Store(str(path))
    assert store.cases()["total"] == 1
    store.cleanup(2)
    assert not store.rows("SELECT * FROM tickets")
    assert store.rows("SELECT * FROM expired_channels")
    store.close()
    assert b"secret transcript" not in path.read_bytes()
    assert path.stat().st_mode & 0o777 == 0o600
