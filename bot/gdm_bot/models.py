"""Strict, versioned dashboard settings shared by all bot modules."""

import math
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Snowflake = Annotated[str, StringConstraints(pattern=r"^[1-9][0-9]{16,19}$")]
ShortText = Annotated[str, StringConstraints(max_length=100)]
Ids = Annotated[list[Snowflake], Field(max_length=100)]

COMMANDS = (
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
    "level",
    "xp",
    "importxp",
    "exportxp",
    "syncroles",
    "rank",
    "leaderboard",
    "colour",
    "privacy",
    "background",
    "wrapped",
    "ticket",
    "voice",
)
PUBLIC_COMMANDS = {
    "rank",
    "leaderboard",
    "colour",
    "privacy",
    "background",
    "wrapped",
    "voice",
}
EVENTS = (
    "message_delete",
    "message_edit",
    "image_delete",
    "bulk_message_delete",
    "moderator_command",
    "member_join",
    "member_leave",
    "role_add",
    "role_remove",
    "member_timeout",
    "nickname_change",
    "member_ban",
    "member_unban",
    "role_create",
    "role_delete",
    "role_edit",
    "channel_create",
    "channel_update",
    "channel_delete",
    "emoji_create",
    "emoji_rename",
    "emoji_delete",
    "voice_join",
    "voice_leave",
    "voice_move",
)


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, validate_assignment=True)


class Embed(Model):
    title: Annotated[str, StringConstraints(max_length=256)] = "GDM Community"
    description: Annotated[str, StringConstraints(max_length=3500)] = ""
    color: Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")] = "#3b82f6"
    footer: Annotated[str, StringConstraints(max_length=256)] = "GDMacros • Community"
    image: Annotated[str, StringConstraints(max_length=500)] = ""

    @model_validator(mode="after")
    def safe_image(self):
        # Discord hosts the image; the service never fetches configurable URLs.
        if self.image and not self.image.startswith("https://"):
            raise ValueError("Embed images must use https:// URLs")
        return self


class CommandPermission(Model):
    enabled: bool = True
    roles: Ids = Field(default_factory=list)
    everyone: bool = False


class LogRule(Model):
    enabled: bool = False
    channel_id: Snowflake | None = None


class Moderation(Model):
    enabled: bool = False
    case_channel_id: Snowflake | None = None
    commands: dict[str, CommandPermission] = Field(
        default_factory=lambda: {
            c: CommandPermission(everyone=c in PUBLIC_COMMANDS) for c in COMMANDS
        }
    )
    logs: dict[str, LogRule] = Field(
        default_factory=lambda: {e: LogRule() for e in EVENTS}
    )
    # Never forward private ticket contents to a general server log.
    ignored_channels: Ids = Field(default_factory=list)

    @model_validator(mode="after")
    def known_rules(self):
        if set(self.commands) != set(COMMANDS) or set(self.logs) != set(EVENTS):
            raise ValueError("All recognized command and event rules must be supplied")
        for name, rule in self.commands.items():
            if rule.everyone and name not in PUBLIC_COMMANDS:
                raise ValueError(
                    f"{name} must be restricted to selected roles (or the server owner)"
                )
        if self.enabled and not self.case_channel_id:
            raise ValueError(
                "Choose a permanent case log channel before enabling moderation"
            )
        for rule in self.logs.values():
            if rule.enabled and not rule.channel_id:
                raise ValueError("Enabled logs need a channel")
        return self


class Boosts(Model):
    enabled: bool = False
    channel_id: Snowflake | None = None
    embed: Embed = Field(
        default_factory=lambda: Embed(
            title="Thanks for boosting!",
            description="{user} just boosted **{server}**. Thank you for supporting the GDM Community!",
            color="#a78bfa",
        )
    )


class Honeypot(Model):
    enabled: bool = False
    channel_id: Snowflake | None = None
    exempt_roles: Ids = Field(default_factory=list)
    delete_seconds: Annotated[int, Field(ge=0, le=604800)] = 3600
    # The recognizable warning is based on RiskyMH/Honeypot; see bot/NOTICE.md.
    embed: Embed = Field(
        default_factory=lambda: Embed(
            title="🍯 DO NOT SEND MESSAGES IN THIS CHANNEL",
            description="This channel is used to catch spam bots. Any messages sent here will result in **a softban**.\n\nThis removes you from the server and clears recent messages. You can rejoin using the community invite.",
            color="#fbbf24",
            footer="GDMacros • Honeypot protection",
        )
    )


class Reward(Model):
    level: Annotated[int, Field(ge=1, le=1000)]
    roles: Annotated[list[Snowflake], Field(min_length=1, max_length=10)]
    stack: bool = True


class Leveling(Model):
    enabled: bool = False
    channel_mode: Literal["all_except", "only"] = "all_except"
    channels: Ids = Field(default_factory=list)
    threads: bool = False
    cooldown_seconds: Annotated[int, Field(ge=5, le=3600)] = 10
    min_xp: Annotated[int, Field(ge=1, le=1000)] = 15
    max_xp: Annotated[int, Field(ge=1, le=1000)] = 40
    slash_xp: bool = False
    coefficients: Annotated[list[float], Field(min_length=2, max_length=5)] = [
        150.0,
        100.0,
        48.0,
        0.885,
        0.0,
    ]
    blacklisted_roles: Ids = Field(default_factory=list)
    ignored_prefixes: Annotated[
        list[Annotated[str, StringConstraints(min_length=1, max_length=16)]],
        Field(max_length=25),
    ] = Field(default_factory=list)
    champion_role_id: Snowflake | None = None
    champion_excluded_roles: Ids = Field(default_factory=list)
    notification_mode: Literal["dm", "same_channel", "custom", "none"] = "dm"
    notification_channel_id: Snowflake | None = None
    notification_every: Annotated[int, Field(ge=1, le=250)] = 5
    notification_min_level: Annotated[int, Field(ge=1, le=1000)] = 1
    notification_levels: Annotated[
        list[Annotated[int, Field(ge=1, le=1000)]], Field(max_length=100)
    ] = Field(default_factory=list)
    notify_rewards_only: bool = False
    notification_format: Literal["embed", "text"] = "embed"
    notification_embed: Embed = Field(
        default_factory=lambda: Embed(
            title="Level up!", description="{user} has reached level **{level}**"
        )
    )
    rewards: Annotated[list[Reward], Field(max_length=100)] = Field(
        default_factory=list
    )
    reward_excluded_roles: Ids = Field(default_factory=list)
    reassign_on_rejoin: bool = True
    reset_on_leave: bool = False
    reset_on_ban: bool = True
    rank_color: Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")] = (
        "#bebebe"
    )
    leaderboard_public: bool = True

    @model_validator(mode="after")
    def progression(self):
        if self.max_xp < self.min_xp:
            raise ValueError("Maximum XP must be at least minimum XP")
        last = 0
        for n in range(1, 1001):
            x = sum(c * n**k for k, c in enumerate(self.coefficients))
            if (
                not math.isfinite(x)
                or x > 9_000_000_000_000_000
                or math.floor(x + 0.5) <= last
            ):
                raise ValueError(
                    "XP thresholds must be positive and increase through level 1000"
                )
            last = math.floor(x + 0.5)
        if len({r.level for r in self.rewards}) != len(self.rewards):
            raise ValueError("Use one reward entry per level")
        if self.notification_mode == "custom" and not self.notification_channel_id:
            raise ValueError("Choose a level-up notification channel")
        return self


class TicketPanel(Model):
    id: Annotated[str, StringConstraints(pattern=r"^[a-z0-9-]{1,32}$")]
    name: ShortText
    enabled: bool = True
    channel_id: Snowflake
    category_id: Snowflake
    transcript_channel_id: Snowflake
    staff_roles: Annotated[list[Snowflake], Field(min_length=1, max_length=25)]
    button_label: Annotated[str, StringConstraints(min_length=1, max_length=80)] = (
        "Open a ticket"
    )
    max_open_per_user: Annotated[int, Field(ge=1, le=5)] = 1
    creator_can_close: bool = True
    ask_reason: bool = True
    embed: Embed = Field(
        default_factory=lambda: Embed(
            title="Need a hand?",
            description="Open a private ticket with the GDM Community team.",
        )
    )
    welcome: Embed = Field(
        default_factory=lambda: Embed(
            title="Welcome, {username}",
            description="Tell us what you need help with. A team member will reply here.",
        )
    )


class Tickets(Model):
    enabled: bool = False
    panels: Annotated[list[TicketPanel], Field(max_length=25)] = Field(
        default_factory=list
    )

    @model_validator(mode="after")
    def unique_panels(self):
        if len({p.id for p in self.panels}) != len(self.panels):
            raise ValueError("Ticket panel IDs must be unique")
        return self


class TempVoice(Model):
    enabled: bool = False
    lobby_id: Snowflake | None = None
    category_id: Snowflake | None = None
    user_limit: Annotated[int, Field(ge=0, le=99)] = 0


class Settings(Model):
    boostnotifications: Boosts = Field(default_factory=Boosts)
    honeypot: Honeypot = Field(default_factory=Honeypot)
    moderation: Moderation = Field(default_factory=Moderation)
    leveling: Leveling = Field(default_factory=Leveling)
    tickets: Tickets = Field(default_factory=Tickets)
    tempvoice: TempVoice = Field(default_factory=TempVoice)

    @model_validator(mode="after")
    def complete_modules(self):
        for m in (self.boostnotifications, self.honeypot):
            if m.enabled and not m.channel_id:
                raise ValueError("Enabled modules need a channel")
        if self.honeypot.enabled and not self.moderation.case_channel_id:
            raise ValueError("Honeypot needs a permanent case log channel")
        if self.tempvoice.enabled and (
            not self.tempvoice.lobby_id or not self.tempvoice.category_id
        ):
            raise ValueError("Temporary voice needs a lobby and category")
        if self.tickets.enabled and not self.tickets.panels:
            raise ValueError("Create a ticket panel first")
        return self
