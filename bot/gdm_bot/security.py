import os
import re
import secrets
from dataclasses import dataclass
from urllib.parse import urlparse


class UserError(Exception):
    """A safe, actionable error that can be returned to an authorized operator."""


@dataclass(frozen=True)
class Environment:
    token: str
    api_key: str
    guild_id: int
    database: str
    site_url: str
    port: int = 8787

    @classmethod
    def load(cls):
        key = os.environ.get("GDM_BOT_API_KEY", "")
        token = os.environ.get("DISCORD_BOT_TOKEN", "")
        guild = os.environ.get("DISCORD_GUILD_ID", "")
        site = os.environ.get("GDM_SITE_URL", "https://gdmacros.com").rstrip("/")
        u = urlparse(site)
        if len(key) < 48 or not token or not re.fullmatch(r"[1-9][0-9]{16,19}", guild):
            raise RuntimeError(
                "Set a bot token, guild ID and a random API key of at least 48 characters"
            )
        if (
            u.scheme != "https"
            or not u.netloc
            or u.path
            or u.query
            or u.fragment
            or u.username
        ):
            raise RuntimeError("GDM_SITE_URL must be a bare HTTPS origin")
        return cls(
            token,
            key,
            int(guild),
            os.environ.get("GDM_BOT_DATABASE", "/var/lib/gdmacros-bot/bot.sqlite3"),
            site,
            int(os.environ.get("GDM_BOT_PORT", "8787")),
        )


def authentic(authorization: str, key: str) -> bool:
    return secrets.compare_digest(authorization, "Bearer " + key)


def permission(member, guild, rule) -> bool:
    # Admin Discord permissions do not silently bypass the configured bot roles.
    if not rule.enabled or member.bot:
        return False
    return (
        member.id == guild.owner_id
        or rule.everyone
        or bool({str(r.id) for r in member.roles} & set(rule.roles))
    )


def hierarchy(actor, target, guild, bot_member):
    if target.id in (guild.owner_id, bot_member.id) or target.id == actor.id:
        raise UserError("You cannot moderate the owner, the bot or yourself")
    if target.top_role >= bot_member.top_role:
        raise UserError("Move the bot role above the target's highest role")
    if actor.id != guild.owner_id and target.top_role >= actor.top_role:
        raise UserError("You cannot moderate someone with an equal or higher role")


def ident(value: str) -> str:
    if not re.fullmatch(r"[1-9][0-9]{16,19}", value):
        raise UserError("Enter a valid Discord user ID")
    return value
