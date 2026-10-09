"""Loopback-only authenticated API. Caddy provides HTTPS; no browser CORS."""

import json
import math
import logging
import re
import time
from collections import defaultdict, deque
import discord
from aiohttp import web
from pydantic import ValidationError
from .embeds import render
from .leveling import normalize_import
from .models import Settings
from .security import UserError, authentic

log = logging.getLogger("gdm_bot.api")
BODY_LIMIT = 2 * 1024 * 1024
UUID = re.compile(r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$")


def json_response(data, status=200):
    return web.json_response(
        data,
        status=status,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


def page_value(request):
    value = request.query.get("page", "1")
    if not value.isdecimal() or not 1 <= int(value) <= 10000:
        raise UserError("Choose a valid page")
    return int(value)


def application(bot):
    budgets = defaultdict(deque)

    @web.middleware
    async def gate(request, handler):
        if not authentic(request.headers.get("Authorization", ""), bot.env.api_key):
            return json_response({"error": "Unauthorized"}, 401)
        actor = request.headers.get("X-GDM-Actor", "")
        is_public = (
            actor == "public-leaderboard"
            and request.method == "GET"
            and request.path == "/v1/leaderboard"
        )
        if not is_public and not UUID.fullmatch(actor):
            return json_response(
                {"error": "A verified website admin identity is required"}, 403
            )
        now = time.monotonic()
        bucket = budgets[actor]
        while bucket and bucket[0] <= now - 60:
            bucket.popleft()
        if len(bucket) >= (240 if is_public else 120):
            return json_response({"error": "Too many requests; wait a minute"}, 429)
        bucket.append(now)
        if request.content_length and request.content_length > BODY_LIMIT:
            return json_response({"error": "Maximum request size is 2 MB"}, 413)
        try:
            return await handler(request)
        except UserError as error:
            code = 409 if "changed in another session" in str(error) else 400
            return json_response({"error": str(error)}, code)
        except ValidationError as error:
            # Do not return Pydantic's input values or arbitrary internal exception text.
            issues = [
                {"field": ".".join(str(p) for p in e["loc"]), "type": e["type"]}
                for e in error.errors(
                    include_input=False, include_context=False, include_url=False
                )
            ][:12]
            return json_response(
                {
                    "error": "Check the settings fields and required channels",
                    "issues": issues,
                },
                400,
            )
        except (json.JSONDecodeError, UnicodeDecodeError):
            return json_response({"error": "The JSON could not be read"}, 400)
        except discord.HTTPException:
            return json_response(
                {
                    "error": "Discord could not confirm the action. Check the dashboard before retrying"
                },
                502,
            )
        except web.HTTPException as error:
            return json_response({"error": "Request rejected"}, error.status)
        except Exception as error:
            log.error("API operation failed: %s", type(error).__name__)
            return json_response(
                {
                    "error": "The operation could not be confirmed. Reload before retrying"
                },
                500,
            )

    app = web.Application(middlewares=[gate], client_max_size=BODY_LIMIT)

    async def state(request):
        guild = bot.guild
        status = {
            "connected": bot.is_ready() and bool(guild),
            "guild_name": guild.name if guild else "GDM Community",
            "guild_id": str(bot.env.guild_id),
            "latency_ms": round(bot.latency * 1000)
            if bot.is_ready() and math.isfinite(bot.latency)
            else None,
            "problem": bot.last_problem,
            "pending_logs": bot.store.one("SELECT count(*) AS n FROM outbox")["n"],
            "cases": bot.store.one("SELECT count(*) AS n FROM cases")["n"],
            "open_tickets": bot.store.one(
                "SELECT count(*) AS n FROM tickets WHERE status='open'"
            )["n"],
            "ranked_members": bot.store.one(
                "SELECT count(*) AS n FROM levels WHERE present=1 AND hidden=0"
            )["n"],
        }
        roles = (
            [
                {
                    "id": str(r.id),
                    "name": r.name,
                    "color": "#" + f"{r.color.value:06x}",
                    "managed": r.managed,
                    "reward_safe": not r.managed
                    and r < guild.me.top_role
                    and not any(
                        getattr(r.permissions, p)
                        for p in (
                            "administrator",
                            "ban_members",
                            "kick_members",
                            "manage_guild",
                            "manage_channels",
                            "manage_roles",
                            "manage_webhooks",
                            "moderate_members",
                            "manage_messages",
                            "mention_everyone",
                        )
                    ),
                }
                for r in guild.roles
                if r != guild.default_role
            ]
            if guild
            else []
        )
        channels = (
            [
                {
                    "id": str(c.id),
                    "name": c.name,
                    "kind": "category"
                    if isinstance(c, discord.CategoryChannel)
                    else "voice"
                    if isinstance(c, discord.VoiceChannel)
                    else "text"
                    if isinstance(c, discord.TextChannel)
                    else "other",
                    "category": c.category.name
                    if getattr(c, "category", None)
                    else None,
                }
                for c in guild.channels
                if not bot.is_ticket_channel(c.id)
            ]
            if guild
            else []
        )
        return json_response(
            {
                "revision": bot.revision,
                "settings": bot.settings.model_dump(),
                "status": status,
                "roles": roles,
                "channels": channels,
            }
        )

    async def save(request):
        data = await request.json()
        if not isinstance(data, dict) or type(data.get("revision")) is not int:
            raise UserError("Supply the current configuration revision")
        settings = Settings.model_validate(data.get("settings"))
        revision = await bot.save_settings(
            data["revision"], settings, request.headers["X-GDM-Actor"]
        )
        return json_response(
            {
                "revision": revision,
                "settings": bot.settings.model_dump(),
                "warning": bot.last_problem,
            }
        )

    async def cases(request):
        target, actor, action = (
            request.query.get(k, "") for k in ("target", "actor", "action")
        )
        if len(target) > 40 or len(actor) > 40 or len(action) > 50:
            raise UserError("The case filters are too long")
        return json_response(
            bot.store.cases(
                target,
                actor,
                action,
                request.query.get("sort", "newest"),
                page_value(request),
            )
        )

    async def case_detail(request):
        row = bot.store.one(
            "SELECT * FROM cases WHERE id=?", (int(request.match_info["number"]),)
        )
        if not row:
            return json_response({"error": "Case not found"}, 404)
        row["details"] = json.loads(row["details"])
        return json_response(row)

    async def leaderboard(request):
        return json_response(
            bot.leveling.board(
                page_value(request),
                public=request.headers["X-GDM-Actor"] == "public-leaderboard",
            )
        )

    async def ticket_list(request):
        now = time.time()
        page = page_value(request)
        rows = bot.store.rows(
            "SELECT id,panel_id,channel_id,owner_id,claimed_by,status,created_at,closed_at,expires_at FROM tickets WHERE expires_at IS NULL OR expires_at>? ORDER BY id DESC LIMIT 25 OFFSET ?",
            (now, (page - 1) * 25),
        )
        return json_response(
            {
                "tickets": rows,
                "page": page,
                "total": bot.store.one(
                    "SELECT count(*) AS n FROM tickets WHERE expires_at IS NULL OR expires_at>?",
                    (now,),
                )["n"],
            }
        )

    async def transcript(request):
        row = bot.store.transcript(int(request.match_info["number"]))
        if not row:
            return json_response({"error": "Transcript not found or expired"}, 404)
        page = page_value(request)
        messages = json.loads(row.pop("transcript"))
        bot.store.audit(
            request.headers["X-GDM-Actor"],
            "transcript_view",
            f"Ticket #{row['id']}; page {page}",
        )
        return json_response(
            {
                **row,
                "messages": messages[(page - 1) * 100 : page * 100],
                "total_messages": len(messages),
                "page": page,
            }
        )

    async def import_levels(request):
        data = await request.json()
        if not isinstance(data, dict) or data.get("revision") != bot.revision:
            raise UserError(
                "Settings changed in another session. Reload before importing"
            )
        rows, mismatches = normalize_import(data.get("export"), bot.settings.leveling)
        if data.get("apply") is True:
            if data.get("confirmed") is not True or mismatches:
                raise UserError(
                    "Confirm the preview and resolve any XP curve mismatch before importing"
                )
            async with bot.settings_lock:
                if data["revision"] != bot.revision:
                    raise UserError(
                        "Settings changed in another session. Reload before importing"
                    )
                count = bot.leveling.import_rows(
                    rows, data.get("mode"), request.headers["X-GDM-Actor"]
                )
                # Importing never sends old level-up DMs. Current members are marked accurately.
                if bot.guild:
                    for r in rows:
                        bot.store.execute(
                            "UPDATE levels SET present=? WHERE user_id=?",
                            (
                                int(
                                    bot.guild.get_member(int(r["user_id"])) is not None
                                ),
                                r["user_id"],
                            ),
                        )
                return json_response({"imported": count, "role_sync_required": True})
        return json_response(
            {
                "count": len(rows),
                "mismatches": mismatches[:100],
                "rows": rows[:100],
                "truncated_preview": len(rows) > 100,
            }
        )

    async def action(request):
        if not bot.is_ready() or not bot.guild:
            raise UserError("The bot must be connected to perform this action")
        name = request.match_info["name"]
        data = await request.json()
        if not isinstance(data, dict) or data.get("confirmed") is not True:
            raise UserError("Confirm the action first")
        if name == "publish-panel":
            await bot.tickets.publish(str(data.get("panel_id", "")))
        elif name == "test-boost":
            s = bot.settings.boostnotifications
            if not s.channel_id:
                raise UserError("Choose and save a boost channel first")
            await bot.guild.get_channel(int(s.channel_id)).send(
                embed=render(
                    s.embed,
                    {
                        "user": "A community member",
                        "username": "Preview",
                        "server": bot.guild.name,
                        "boosts": bot.guild.premium_subscription_count,
                    },
                )
            )
        elif name == "sync-rewards":
            # Queue background work instead of timing out a Vercel request.
            if (
                getattr(bot, "reward_sync_task", None)
                and not bot.reward_sync_task.done()
            ):
                raise UserError("A reward sync is already running")
            import asyncio

            async def sync():
                try:
                    for row in bot.store.rows(
                        "SELECT user_id FROM levels WHERE present=1"
                    ):
                        member = bot.guild.get_member(int(row["user_id"]))
                        if member:
                            await bot.leveling.sync_rewards(member)
                    bot.store.audit(
                        request.headers["X-GDM-Actor"], "reward_sync", "Completed"
                    )
                except discord.HTTPException:
                    bot.last_problem = "Reward sync stopped; check Manage Roles and role hierarchy, then retry"

            bot.reward_sync_task = asyncio.create_task(sync())
        else:
            return json_response({"error": "Unknown action"}, 404)
        bot.store.audit(
            request.headers["X-GDM-Actor"], name, "Requested through dashboard"
        )
        return json_response({"ok": True})

    app.router.add_get("/v1/state", state)
    app.router.add_put("/v1/settings", save)
    app.router.add_get("/v1/cases", cases)
    app.router.add_get(r"/v1/cases/{number:\d+}", case_detail)
    app.router.add_get("/v1/leaderboard", leaderboard)
    app.router.add_get("/v1/tickets", ticket_list)
    app.router.add_get(r"/v1/transcripts/{number:\d+}", transcript)
    app.router.add_post("/v1/import", import_levels)
    app.router.add_post("/v1/actions/{name}", action)
    return app
