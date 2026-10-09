import discord
from .models import Embed


def render(template: Embed, values=None) -> discord.Embed:
    values = values or {}

    def replace(s, limit):
        # Literal replacement, never eval/format arbitrary attributes.
        for key, value in values.items():
            s = s.replace("{" + key + "}", str(value))
        return s[:limit]

    e = discord.Embed(
        title=replace(template.title, 256),
        description=replace(template.description, 4096),
        color=int(template.color[1:], 16),
    )
    if template.footer:
        e.set_footer(text=replace(template.footer, 2048))
    if template.image:
        e.set_image(url=template.image)
    return e


def log_embed(title, description="", fields=None, color=0x3B82F6):
    e = discord.Embed(
        title=title[:256],
        description=description[:3500],
        color=color,
        timestamp=discord.utils.utcnow(),
    )
    for name, value in (fields or {}).items():
        if value is not None and str(value):
            e.add_field(name=name[:256], value=str(value)[:1024], inline=False)
    e.set_footer(text="GDMacros • Community logs")
    return e


def user_label(user):
    return f"{discord.utils.escape_markdown(str(user))} • <@{user.id}> • `{user.id}`"
