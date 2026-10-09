import io
import math
import random
import re
import time
from datetime import datetime, timezone
import discord
from PIL import Image, ImageDraw, ImageOps
from .embeds import render
from .models import Leveling
from .security import UserError, ident

MAX_XP = 9_000_000_000_000_000


def threshold(level: int, coefficients):
    if level <= 0:
        return 0
    return math.floor(sum(c * level**k for k, c in enumerate(coefficients)) + 0.5)


def level_for(xp, coefficients):
    lo, hi = 0, 1000
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if threshold(mid, coefficients) <= xp:
            lo = mid
        else:
            hi = mid - 1
    return lo


def desired_rewards(level, rewards):
    roles = set()
    for reward in sorted(rewards, key=lambda r: r.level):
        if level >= reward.level:
            roles = roles | set(reward.roles) if reward.stack else set(reward.roles)
    return roles


def normalize_import(data, settings: Leveling):
    if (
        not isinstance(data, dict)
        or not isinstance(data.get("levels"), list)
        or len(data["levels"]) > 10000
    ):
        raise UserError(
            "Upload a Lurkr export with a levels array (up to 10,000 members)"
        )
    rows, seen, mismatches = [], set(), []
    for item in data["levels"]:
        if not isinstance(item, dict) or not isinstance(item.get("user"), dict):
            raise UserError("Invalid export row")
        uid = ident(str(item.get("userId", "")))
        if uid in seen:
            raise UserError("The export has duplicate users; nothing was imported")
        seen.add(uid)
        xp, messages, level = (
            item.get("xp"),
            item.get("messageCount"),
            item.get("level"),
        )
        if (
            any(type(v) is not int for v in (xp, messages, level))
            or not 0 <= xp <= MAX_XP
            or not 0 <= messages <= 10**12
            or not 0 <= level <= 1000
        ):
            raise UserError(
                "XP, message counts and levels must be nonnegative integers within the supported range"
            )
        username, avatar = item["user"].get("username"), item["user"].get("avatar")
        if not isinstance(username, str) or not 1 <= len(username) <= 100:
            raise UserError("Each export row needs a username")
        if avatar is not None and (
            not isinstance(avatar, str)
            or not re.fullmatch(r"(?:a_)?[a-f0-9]{32}", avatar)
        ):
            avatar = None
        calculated = level_for(xp, settings.coefficients)
        if calculated != level:
            mismatches.append(
                {
                    "user_id": uid,
                    "exported_level": level,
                    "calculated_level": calculated,
                }
            )
        rows.append(
            {
                "user_id": uid,
                "username": username,
                "avatar": avatar,
                "xp": xp,
                "messages": messages,
                "level": level,
            }
        )
    return rows, mismatches


def public_entry(row, coefficients, position):
    level = level_for(row["xp"], coefficients)
    start, end = (
        threshold(level, coefficients),
        threshold(min(level + 1, 1000), coefficients),
    )
    return {
        "position": position,
        "user_id": row["user_id"],
        "username": row["username"],
        "avatar": row["avatar"],
        "xp": row["xp"],
        "messages": row["messages"],
        "level": level,
        "progress": min(1.0, max(0.0, (row["xp"] - start) / (end - start)))
        if end > start
        else 1.0,
    }


class LevelingService:
    def __init__(self, bot):
        self.bot = bot
        self.store = bot.store

    def board(self, page=1, public=True):
        s = self.bot.settings.leveling
        if not s.enabled or (public and not s.leaderboard_public):
            return {"available": False, "total": 0, "page": page, "entries": []}
        total = self.store.one(
            "SELECT count(*) AS total FROM levels WHERE hidden=0 AND present=1"
        )["total"]
        rows = self.store.rows(
            "SELECT user_id,username,avatar,xp,messages FROM levels WHERE hidden=0 AND present=1 ORDER BY xp DESC,user_id LIMIT 25 OFFSET ?",
            ((page - 1) * 25,),
        )
        return {
            "available": True,
            "total": total,
            "page": page,
            "entries": [
                public_entry(r, s.coefficients, (page - 1) * 25 + i + 1)
                for i, r in enumerate(rows)
            ],
        }

    async def award(self, member, channel, content="", slash=False):
        s = self.bot.settings.leveling
        if not s.enabled or member.bot or (slash and not s.slash_xp):
            return
        if self.bot.is_ticket_channel(channel.id) or self.bot.is_ticket_channel(
            getattr(channel, "parent_id", None)
        ):
            return
        roles = {str(r.id) for r in member.roles}
        if roles & set(s.blacklisted_roles) or any(
            content.startswith(p) for p in s.ignored_prefixes
        ):
            return
        is_thread = isinstance(channel, discord.Thread)
        if is_thread and not s.threads:
            return
        ids = (
            {str(channel.id), str(channel.parent_id)}
            if is_thread
            else {str(channel.id)}
        )
        included = bool(ids & set(s.channels))
        if (s.channel_mode == "only" and not included) or (
            s.channel_mode == "all_except" and included
        ):
            return
        row = self.store.ensure_member(
            member.id, member.display_name, member.avatar.key if member.avatar else None
        )
        if row["hidden"]:
            return
        now = time.time()
        if now - row["last_xp"] < s.cooldown_seconds:
            return
        before = level_for(row["xp"], s.coefficients)
        amount = random.randint(s.min_xp, s.max_xp)
        new = min(MAX_XP, row["xp"] + amount)
        # No await between cooldown check and update: one award per user interval.
        with self.store.db:
            self.store.db.execute(
                "UPDATE levels SET xp=?,messages=messages+1,last_xp=? WHERE user_id=?",
                (new, now, str(member.id)),
            )
            self.store.db.execute(
                "INSERT INTO xp_daily VALUES(?,?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET xp=xp+excluded.xp,messages=messages+1",
                (
                    str(member.id),
                    datetime.now(timezone.utc).date().isoformat(),
                    new - row["xp"],
                ),
            )
        after = level_for(new, s.coefficients)
        if after > before:
            await self.sync_rewards(member)
            await self.announce(member, channel, before, after)

    async def sync_rewards(self, member):
        s = self.bot.settings.leveling
        row = self.store.one("SELECT xp FROM levels WHERE user_id=?", (str(member.id),))
        level = level_for(row["xp"] if row else 0, s.coefficients)
        desired = desired_rewards(level, s.rewards)
        if {str(r.id) for r in member.roles} & set(s.reward_excluded_roles):
            desired = set()
        managed = {r for reward in s.rewards for r in reward.roles}
        remove, add = [], []
        for rid in managed:
            role = member.guild.get_role(int(rid))
            if (
                not role
                or role.managed
                or role >= member.guild.me.top_role
                or role.permissions.administrator
            ):
                continue
            if role in member.roles and rid not in desired:
                remove.append(role)
            if role not in member.roles and rid in desired:
                add.append(role)
        if remove:
            await member.remove_roles(*remove, reason="GDM leveling role sync")
        if add:
            await member.add_roles(*add, reason="GDM leveling role sync")

    async def announce(self, member, channel, before, after):
        s = self.bot.settings.leveling
        matching = [
            n
            for n in range(before + 1, after + 1)
            if n >= s.notification_min_level
            and (
                n in s.notification_levels
                if s.notification_levels
                else n % s.notification_every == 0
            )
            and (not s.notify_rewards_only or any(r.level == n for r in s.rewards))
        ]
        if not matching or s.notification_mode == "none":
            return
        destination = (
            member
            if s.notification_mode == "dm"
            else channel
            if s.notification_mode == "same_channel"
            else member.guild.get_channel(int(s.notification_channel_id))
        )
        if destination:
            e = render(
                s.notification_embed,
                {
                    "user": member.mention,
                    "username": member.display_name,
                    "level": after,
                    "server": member.guild.name,
                },
            )
            try:
                await destination.send(
                    embed=e
                ) if s.notification_format == "embed" else await destination.send(
                    e.description or e.title,
                    allowed_mentions=discord.AllowedMentions.none(),
                )
            except discord.HTTPException:
                pass  # Closed DMs must not roll back earned XP or role rewards.

    def import_rows(self, rows, mode, actor):
        if mode not in ("merge_larger", "replace_imported"):
            raise UserError("Choose merge_larger or replace_imported")
        # Entire file validated before the single atomic transaction.
        with self.store.db:
            for row in rows:
                self.store.db.execute(
                    "INSERT INTO levels(user_id,username,avatar,xp,messages) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,avatar=excluded.avatar,xp="
                    + (
                        "max(levels.xp,excluded.xp),messages=max(levels.messages,excluded.messages)"
                        if mode == "merge_larger"
                        else "excluded.xp,messages=excluded.messages"
                    ),
                    (
                        row["user_id"],
                        row["username"],
                        row["avatar"],
                        row["xp"],
                        row["messages"],
                    ),
                )
            self.store.db.execute(
                "INSERT INTO audit(actor,action,created_at,detail) VALUES(?,?,?,?)",
                (actor, "level_import", time.time(), f"{len(rows)} members; {mode}"),
            )
        return len(rows)

    async def champion(self):
        s = self.bot.settings.leveling
        guild = self.bot.guild
        if not s.enabled or not s.champion_role_id or not guild:
            return
        role = guild.get_role(int(s.champion_role_id))
        if (
            not role
            or role.managed
            or role >= guild.me.top_role
            or role.permissions.administrator
        ):
            return
        winner = None
        for row in self.store.rows(
            "SELECT user_id FROM levels WHERE present=1 AND hidden=0 ORDER BY xp DESC,user_id"
        ):
            member = guild.get_member(int(row["user_id"]))
            if member and not {str(r.id) for r in member.roles} & set(
                s.champion_excluded_roles
            ):
                winner = member
                break
        for member in list(role.members):
            if not winner or member.id != winner.id:
                await member.remove_roles(role, reason="Daily GDM leveling champion")
        if winner and role not in winner.roles:
            await winner.add_roles(role, reason="Daily GDM leveling champion")


def rank_image(row, coefficients, color, background=None):
    image = Image.new("RGB", (900, 260), "#121a25")
    if background:
        image = ImageOps.fit(
            Image.open(io.BytesIO(background)).convert("RGB"), image.size
        )
        image = Image.blend(image, Image.new("RGB", image.size, "#121a25"), 0.75)
    draw = ImageDraw.Draw(image)
    level = level_for(row["xp"], coefficients)
    start, end = (
        threshold(level, coefficients),
        threshold(min(level + 1, 1000), coefficients),
    )
    fraction = (
        min(1.0, max(0.0, (row["xp"] - start) / (end - start))) if end > start else 1.0
    )
    draw.text((40, 34), row["username"], fill="white", font_size=32)
    draw.text(
        (40, 90),
        f"Level {level}   |   {row['xp']:,} XP   |   {row['messages']:,} messages",
        fill="#b6c4d6",
        font_size=22,
    )
    draw.rounded_rectangle((40, 154, 860, 192), radius=19, fill="#253143")
    if fraction:
        draw.rounded_rectangle(
            (40, 154, 40 + max(38, 820 * fraction), 192), radius=19, fill=color
        )
    draw.text(
        (40, 215),
        f"{max(0, end - row['xp']):,} XP to next level"
        if level < 1000
        else "Maximum level",
        fill="#b6c4d6",
        font_size=18,
    )
    out = io.BytesIO()
    image.save(out, format="PNG")
    out.seek(0)
    return out


def safe_background(data):
    if len(data) > 2 * 1024 * 1024:
        raise UserError("Choose an image smaller than 2 MB")
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.width * image.height > 8_000_000 or image.format not in (
                "PNG",
                "JPEG",
                "WEBP",
            ):
                raise UserError("Use a PNG, JPEG or WebP image up to 8 million pixels")
            image = ImageOps.fit(image.convert("RGB"), (900, 260))
            out = io.BytesIO()
            image.save(out, format="JPEG", quality=85)
            return out.getvalue()
    except (OSError, Image.DecompressionBombError):
        raise UserError("This image could not be read") from None
