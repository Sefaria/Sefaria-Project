"""The homepage (PLAN.md Phase 5; brief §4.1, §4.7, §4.9): the seed migration, the server-rendered page and
its payload, the carousel for one to six cards, the Discord buttons (I-3), and the CSP rules (no inline
style or script)."""

import json
import re
from html.parser import HTMLParser

import pytest
from django.test import RequestFactory
from django.urls import include, path

from devportal.models import HomepageCarouselCard, HomepageToolTile
from devportal.views import home, pages

from .portal_helpers import REPO_ROOT, is_standalone, page_payload_validator

# Used by test_served_at_root_with_csp through pytest.mark.urls: the Integrator's wiring of "/" (C9).
urlpatterns = [path("", home.home_page), path("", include("devportal.urls"))]

LIVE_CARDS = ["Yamim Noraim Machzor", "Koveah.org", "Hadran.com"]
LIVE_TILES = [
    ("Download Sefaria Data", "https://github.com/Sefaria/Sefaria-Export"),
    ("AI & ML Assets", "https://huggingface.co/Sefaria"),
    ("Tutorial: Build a Data Visualization", "/reference/data-visualization"),
    ("API Reference", "/reference/getting-started"),
    ("AI at Sefaria", "https://www.sefaria.org.il/ai"),
    ("Documentation", "/docs/welcome"),
]
SIGNUP = "https://sefaria.formstack.com/forms/sefaria_developer_discord_community"
ORIGIN = "http://testserver"


class Tree(HTMLParser):
    """A flat list of (tag, attrs, text-after) for simple queries."""

    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.elements = []
        self.texts = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))

    def handle_data(self, data):
        if data.strip():
            self.texts.append(data.strip())

    def with_class(self, name):
        return [(t, a) for t, a in self.elements if name in (a.get("class") or "").split()]

    def find(self, **attrs):
        return [(t, a) for t, a in self.elements if all(a.get(k) == v for k, v in attrs.items())]


def get_home(method="get"):
    request = getattr(RequestFactory(), method)("/")
    request.devportal_nonce = "test-nonce"
    return home.home_page(request)


def body_of(response):
    return response.content.decode()


@pytest.fixture
def seeded(db):
    """The rows of migration 0002 (the test database is built by running the migrations)."""
    return list(HomepageCarouselCard.objects.order_by("position")), list(HomepageToolTile.objects.order_by("position"))


# Seed migration ------------------------------------------------------------------------------------


def test_migration_seeds_live_cards_and_tiles(seeded):
    cards, tiles = seeded
    assert [c.title for c in cards] == LIVE_CARDS
    assert [(t.title, t.link_url) for t in tiles] == LIVE_TILES
    assert [c.link_label for c in cards] == ["Download the App Now", "Sign Up Now", "Learn Today's Daf"]
    assert [t.icon for t in tiles] == ["database", "model", "code", "api", "sparkle", "document"]
    assert [t.color for t in tiles] == ["#802F3E", "#00827F", "#4B71B7", "#18345D", "#CCB479", "#CB6158"]
    for card in cards:
        assert card.image_url.startswith("/static/bundles/devportal/home/")
        image = REPO_ROOT / "devportal-ui" / "public" / card.image_url.removeprefix("/static/bundles/devportal/")
        assert image.is_file(), image


def test_seed_does_not_overwrite_edited_tables(seeded):
    import importlib  # noqa: PLC0415

    from django.apps import apps  # noqa: PLC0415

    seed = importlib.import_module("devportal.migrations.0002_seed_homepage").seed
    HomepageToolTile.objects.filter(position=1).update(title="Edited")
    seed(apps, None)
    assert HomepageCarouselCard.objects.count() == 3
    assert HomepageToolTile.objects.count() == 6
    assert HomepageToolTile.objects.filter(title="Edited").exists()


# The page --------------------------------------------------------------------------------------------


def test_home_page_renders_live_copy(seeded):
    response = get_home()
    assert response.status_code == 200
    assert response["Content-Type"] == "text/html; charset=utf-8"
    html = body_of(response)
    assert "<title>Sefaria</title>" in html
    tree = Tree(html)
    for text in (
        'Ref("Shabbat 4b").all_segment_refs()',
        "Expand Digital Torah",
        "Leverage the largest open-source database of Jewish texts in history to build apps and services for the "
        "People of the Book.",
        "All Sefaria-Powered Projects",
        "Stay in the loop",
        "with the Sefaria Developer Newsletter",
        "Get quarterly tech updates + behind-the-scenes content from Sefaria's own team of developers.",
        "Sign Up",
    ):
        assert text in tree.texts, text
    assert [a for _, a in tree.find(**{"class": "dp-home__hero-title"})]
    assert [t for t in tree.texts if t in LIVE_CARDS] == LIVE_CARDS
    tools = tree.with_class("dp-home__tool")
    assert [a["href"] for _, a in tools] == [href for _, href in LIVE_TILES]
    body = Tree(home.home_body_html())
    assert [t for t in body.texts if t in dict(LIVE_TILES)] == [title for title, _ in LIVE_TILES]


def test_links_newsletter_gallery_and_logo(seeded):
    tree = Tree(body_of(get_home()))
    (_, signup), *_ = tree.with_class("dp-home__signup-button")
    assert signup["href"] == "https://sefaria.activehosted.com/f/46"
    assert signup["target"] == "_blank"
    (_, gallery), *_ = tree.with_class("dp-home__all-projects-button")
    assert gallery["href"] == "/powered-by"
    (_, logo), *_ = tree.with_class("dp-home__logo-img")
    assert logo["src"] == "/static/bundles/devportal/home/logo-developers-on-sefaria-white.svg"
    assert logo["alt"] == "Sefaria"
    cards = tree.with_class("dp-home__card-link")
    assert cards[0][1]["href"] == "https://play.google.com/store/apps/details?id=com.machzoryamimnoraim&pli=1"
    assert "target" not in cards[0][1]  # as live: same tab


def test_discord_buttons_in_hero_and_community_band(seeded):
    tree = Tree(body_of(get_home()))
    links = tree.with_class("dp-discord-button")
    assert [a["data-discord-cta"] for _, a in links] == ["home_hero", "home_community"]
    for _, attrs in links:
        assert attrs["href"] == SIGNUP
        assert attrs["target"] == "_blank"
        assert attrs["rel"] == "noopener noreferrer"
    assert "dp-discord-button--secondary" in links[0][1]["class"]
    assert "dp-discord-button--primary" in links[1][1]["class"]
    assert tree.texts.count("Join our Discord") == 2
    assert "to talk with other developers building on Sefaria." in tree.texts
    assert len(tree.find(**{"data-visual-deviation": "D-10"})) == 2
    assert tree.find(**{"data-visual-region": "homeHero"})
    assert tree.find(**{"data-visual-region": "homeFooter"})


def test_no_inline_style_or_script(seeded):
    html = body_of(get_home())
    assert "<style" not in html
    assert not re.search(r"\sstyle\s*=", html)
    for match in re.finditer(r"<script\b[^>]*>", html):
        tag = match.group(0)
        assert 'nonce="test-nonce"' in tag or "src=" in tag, tag
    assert "files.readme.io" not in html


def test_payload_carries_the_same_body(seeded):
    site = pages.site_config(ORIGIN, pages._generation())  # noqa: SLF001
    payload = home.home_payload(ORIGIN, site)
    page_payload_validator().validate(payload)
    assert payload["kind"] == "home"
    assert payload["title"] == "Sefaria"
    assert payload["header"]["activeTab"] == "home"
    html = body_of(get_home())
    island = re.search(r'<script type="application/json" id="dp-data"[^>]*>(.*?)</script>', html, re.S).group(1)
    assert json.loads(island)["bodyHtml"] == payload["bodyHtml"]
    adopted = re.search(r'<div data-dp-adopt="body">(.*)</div></main>', html, re.S).group(1)
    assert adopted == payload["bodyHtml"]
    assert payload["bodyHtml"].startswith('<div class="dp-home">')
    assert '<main class="dp-rm-app" id="content" data-visual="main">' in html


def test_head_and_post(seeded):
    assert get_home("head").status_code == 200
    assert get_home("post").status_code == 405


# Carousel -----------------------------------------------------------------------------------------


def _cards(n):
    HomepageCarouselCard.objects.all().delete()
    for i in range(1, n + 1):
        HomepageCarouselCard.objects.create(title=f"Card {i}", blurb="b", link_url=f"/docs/{i}", position=i)


@pytest.mark.parametrize("count", [1, 2, 3, 6])
def test_carousel_works_for_one_to_six_cards(seeded, count):
    _cards(count)
    tree = Tree(home.home_body_html())
    radios = tree.find(type="radio")
    assert [a["id"] for _, a in radios] == [f"dp-home-featured-{i}" for i in range(1, count + 1)]
    assert "checked" in radios[0][1] and all("checked" not in a for _, a in radios[1:])
    assert [a["aria-label"] for _, a in radios] == [f"Card {i}" for i in range(1, count + 1)]
    (_, carousel), *_ = tree.with_class("dp-home__carousel")
    assert f"dp-home__carousel--n{count}" in carousel["class"]
    nav = [a["for"] for _, a in tree.with_class("dp-home__card-nav-button")]
    indicators = tree.with_class("dp-home__indicator")
    if count == 1:
        assert nav == [] and indicators == []
    else:
        assert nav == [f"dp-home-featured-{i % count + 1}" for i in range(1, count + 1)]
        assert len(indicators) == count


def test_carousel_shows_at_most_six_active_cards(seeded):
    _cards(7)
    HomepageCarouselCard.objects.filter(title="Card 2").update(is_active=False)
    html = home.home_body_html()
    titles = re.findall(r'<span class="dp-home__card-title">([^<]*)</span>', html)
    assert titles == ["Card 1", "Card 3", "Card 4", "Card 5", "Card 6", "Card 7"]


def test_no_cards_and_no_tiles_hide_their_sections(seeded):
    HomepageCarouselCard.objects.all().delete()
    HomepageToolTile.objects.update(is_active=False)
    html = home.home_body_html()
    assert "dp-home__featured" not in html
    assert "dp-home__tools" not in html
    assert "dp-home__community" in html


# Admin values are data, never markup ---------------------------------------------------------------


def test_admin_values_are_escaped_and_checked(seeded):
    HomepageCarouselCard.objects.filter(position=1).update(
        title="<script>alert(1)</script>", link_url="javascript:alert(1)", image_url="//evil.example/x.png"
    )
    HomepageToolTile.objects.filter(position=1).update(color="red; background: url(x)", icon="<svg onload=x>")
    html = home.home_body_html()
    assert "<script>alert(1)" not in html
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "javascript:" not in html
    assert "evil.example" not in html
    tree = Tree(html)
    first_icon = tree.with_class("dp-home__tool-icon")[0][1]
    assert first_icon["class"] == "dp-home__tool-icon"
    assert "onload" not in html


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("/docs/welcome", "/docs/welcome"),
        (" https://koveah.org/ ", "https://koveah.org/"),
        ("http://example.org/a?b=1&c=2", "http://example.org/a?b=1&c=2"),
        ("//evil.example", ""),
        ("javascript:alert(1)", ""),
        ("JAVASCRIPT:alert(1)", ""),
        ("data:text/html,x", ""),
        ("https://", ""),
        ('/a"onmouseover="x', ""),
        ("/a b", ""),
        ("", ""),
    ],
)
def test_safe_url(value, expected):
    assert home.safe_url(value) == expected


def test_color_and_icon_names():
    assert home.color_class("#802f3e") == "802f3e"
    assert home.color_class("#123456") == ""
    assert home.icon_name("database") == "database"
    assert home.icon_name("../x") == ""


# Strings ---------------------------------------------------------------------------------------------


def test_discord_strings_equal_en_json():
    en = json.loads((REPO_ROOT / "static/js/sefaria/i18n/interface/en.json").read_text(encoding="utf-8"))
    for key, value in home.DISCORD_STRINGS.items():
        assert en[key] == value, key
    ts = (REPO_ROOT / "devportal-ui/src/discord/strings.ts").read_text(encoding="utf-8")
    for value in home.DISCORD_STRINGS.values():
        assert f"'{value}'" in ts


# Served at "/" (standalone only: under sefaria.settings, django_hosts picks the developers URLconf) -------


@pytest.mark.urls("devportal.tests.home_view_test")
def test_served_at_root_with_csp(seeded, client):
    if not is_standalone():
        pytest.skip("pytest.mark.urls does not apply behind django_hosts; covered by the view tests above")
    response = client.get("/")
    assert response.status_code == 200
    csp = response["Content-Security-Policy"]
    assert "style-src 'self';" in csp and "unsafe-inline" not in csp
    nonce = re.search(r"'nonce-([^']+)'", csp).group(1)
    html = response.content.decode()
    assert f'id="dp-data" nonce="{nonce}"' in html
    assert "<title>Sefaria</title>" in html
