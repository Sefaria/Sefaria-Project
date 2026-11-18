"""The "Join our Discord" button in server-rendered pages (brief §4.7, PLAN I-3, D-2 and D-7).

The same markup as devportal-ui/src/discord/DiscordButton.tsx, so a page without JavaScript shows the
button where the client puts it, and React's takeover moves nothing (PLAN §2.5).
"""

from django import template
from django.utils.html import format_html

register = template.Library()

PLACEMENTS = ("sidebar_footer", "docs_page_end")


@register.simple_tag
def devportal_discord_button(placement, variant="primary"):
    from devportal.views.home import DISCORD_LINK_LABEL_KEY, DISCORD_SIGNUP_URL_KEY, DISCORD_STRINGS

    if placement not in PLACEMENTS:
        raise template.TemplateSyntaxError(f"unknown Discord placement {placement!r}")
    return format_html(
        '<a class="dp-discord-button dp-discord-button--{}" href="{}" target="_blank" rel="noopener noreferrer"'
        ' data-discord-cta="{}">{}</a>',
        variant,
        DISCORD_STRINGS[DISCORD_SIGNUP_URL_KEY],
        placement,
        DISCORD_STRINGS[DISCORD_LINK_LABEL_KEY],
    )
