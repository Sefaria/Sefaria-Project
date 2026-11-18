"""The homepage of the developers host (PLAN.md Phase 5; brief §4.1).

Live's homepage is one custom HTML block with about 31 KB of CSS and no JavaScript. Here it is a Django
template, `devportal/home_body.html`, with its CSS in `devportal-ui/src/home/home.css` (scoped under
`.dp-home`, no inline style or script: the CSP has no 'unsafe-inline'). The carousel cards and tool tiles
come from `HomepageCarouselCard` and `HomepageToolTile` (edited in the Django admin); everything else is
live's copy, unchanged.

`home_body_html()` renders the body. The page payload carries it as `bodyHtml` (contract C3), so the
same markup is served in the HTML page (`home_page`, `devportal/home.html`) and in
`/_portal/page.json?path=/` for a client-side navigation to `/`, where React adopts it unchanged
(`AdoptedHtml`).

Values from the admin are escaped by the template. Link and image URLs are checked again here
(`safe_url`), and the tile's icon and colour are names from fixed lists that map to markup and CSS
classes shipped with the portal: the database never holds markup or CSS.
"""

from django.http import HttpResponseNotAllowed
from django.template.loader import render_to_string

from devportal.models import HomepageCarouselCard, HomepageToolTile
from devportal.security.headers import request_origin

from . import pages

HOME_BODY_TEMPLATE = "devportal/home_body.html"
HOME_TEMPLATE = "devportal/home.html"

# The portal's own copy of the three interface strings it uses (PLAN Phase 5). Tests assert they equal
# static/js/sefaria/i18n/interface/en.json; devportal-ui/src/discord/strings.ts holds the same copy.
DISCORD_SIGNUP_URL_KEY = "developer.common.discord_signup.url"
DISCORD_LINK_LABEL_KEY = "developer.about_you.community.discord.join_discord_link"
DISCORD_BODY_KEY = "developer.about_you.community.discord.body"
DISCORD_STRINGS = {
    DISCORD_SIGNUP_URL_KEY: "https://sefaria.formstack.com/forms/sefaria_developer_discord_community",
    DISCORD_LINK_LABEL_KEY: "Join our Discord",
    DISCORD_BODY_KEY: "{join_discord_link} to talk with other developers building on Sefaria.",
}
DISCORD_LINK_PLACEHOLDER = "{join_discord_link}"

# The carousel's "All Sefaria-Powered Projects" button: the gallery now lives on this host (PLAN Phase 5).
GALLERY_PATH = "/powered-by"
# Live's newsletter link: ActiveCampaign form 46, unchanged (brief §4.7, Q22).
NEWSLETTER_URL = "https://sefaria.activehosted.com/f/46"
# Where the Vite build serves devportal-ui/public/ (devportal_assets.BUNDLE_URL).
ASSET_BASE = "/static/bundles/devportal/"
FOOTER_LOGO = f"{ASSET_BASE}home/logo-developers-on-sefaria-white.svg"  # the designer's 214x25 logo, as live's footer

# The carousel's CSS is written for one to six cards (home.css); more are not shown.
MAX_CAROUSEL_CARDS = 6

# Tile icons: the names the admin offers, each drawn by home_body.html (live's six icons).
TILE_ICONS = (
    ("database", "Database (Download Sefaria Data)"),
    ("model", "Window (AI & ML Assets)"),
    ("code", "Code (Tutorial)"),
    ("api", "Diamonds (API Reference)"),
    ("sparkle", "Sparkles (AI at Sefaria)"),
    ("document", "Document (Documentation)"),
)
# Tile colours: live's six, plus live's purple. Each maps to a class in home.css
# (`dp-home__tool-icon--<hex>`), because the CSP allows no inline style.
TILE_COLORS = (
    ("#802F3E", "Burgundy #802F3E"),
    ("#00827F", "Teal #00827F"),
    ("#4B71B7", "Blue #4B71B7"),
    ("#18345D", "Navy #18345D"),
    ("#CCB479", "Gold #CCB479"),
    ("#CB6158", "Coral #CB6158"),
    ("#612854", "Purple #612854"),
)
_ICON_NAMES = {name for name, _ in TILE_ICONS}
_COLOR_CLASSES = {value.upper(): value[1:].lower() for value, _ in TILE_COLORS}


def safe_url(value):
    """A link or image URL the homepage may print: a path on this host, or an http(s) URL. Else ""."""
    url = (value or "").strip()
    if not url or any(ord(c) < 32 or c in "\\\"'<>` " for c in url):
        return ""
    if url.startswith("/") and not url.startswith("//"):
        return url
    if url.lower().startswith(("https://", "http://")) and len(url) > len("https://"):
        return url
    return ""


def color_class(value):
    """The home.css modifier for a tile colour, or "" (the default navy) for an unknown value."""
    return _COLOR_CLASSES.get((value or "").strip().upper(), "")


def icon_name(value):
    return value if value in _ICON_NAMES else ""


def _card(card, index, count):
    return {
        "index": index,
        "next": index % count + 1,
        "title": card.title,
        "blurb": card.blurb,
        "link_url": safe_url(card.link_url),
        "link_label": card.link_label,
        "link_new_tab": card.link_new_tab,
        "image_url": safe_url(card.image_url),
        "image_alt": card.image_alt,
    }


def _tile(tile):
    return {
        "title": tile.title,
        "blurb": tile.blurb,
        "link_url": safe_url(tile.link_url),
        "link_new_tab": tile.link_new_tab,
        "icon": icon_name(tile.icon),
        "color": color_class(tile.color),
    }


def home_context():
    cards = list(HomepageCarouselCard.objects.filter(is_active=True).order_by("position", "id")[:MAX_CAROUSEL_CARDS])
    tiles = list(HomepageToolTile.objects.filter(is_active=True).order_by("position", "id"))
    count = len(cards)
    label = DISCORD_STRINGS[DISCORD_LINK_LABEL_KEY]
    before, _, after = DISCORD_STRINGS[DISCORD_BODY_KEY].partition(DISCORD_LINK_PLACEHOLDER)
    return {
        "cards": [_card(card, i, count) for i, card in enumerate(cards, start=1)],
        "card_count": count,
        "tiles": [_tile(tile) for tile in tiles],
        "discord": {
            "url": DISCORD_STRINGS[DISCORD_SIGNUP_URL_KEY],
            "label": label,
            "body_before": before.strip(),
            "body_after": after.strip(),
        },
        "gallery_path": GALLERY_PATH,
        "newsletter_url": NEWSLETTER_URL,
        "asset_base": ASSET_BASE,
        "footer_logo": FOOTER_LOGO,
    }


def home_body_html():
    """The homepage body (`.dp-home`), as the server page and the C3 payload's `bodyHtml` carry it."""
    return render_to_string(HOME_BODY_TEMPLATE, home_context())


def home_payload(origin, site):
    """The C3 `home` payload with the real body (replaces the Phase 1 placeholder of pages.home_payload)."""
    return pages.home_payload(origin, site)


def home_page(request, *args, **kwargs):
    """`/`: the homepage. The Integrator routes it above the fallback (contract C9)."""
    if request.method not in ("GET", "HEAD"):
        return HttpResponseNotAllowed(["GET", "HEAD"])
    origin = request_origin(request)
    site = pages.site_config(origin, pages._generation())  # noqa: SLF001 - same module family, shared helper
    payload = home_payload(origin, site)
    return pages.render_page(payload, pages.nonce_for(request), origin, template=HOME_TEMPLATE)
