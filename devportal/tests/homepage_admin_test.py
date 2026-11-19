"""The homepage's admin (PLAN.md Phase 5; brief §4.1 "make the carousel cards and tool tiles editable"):
sortable lists as in guides/, and forms that only accept safe links and the icons and colours the homepage
ships."""

import pytest
from adminsortable.admin import SortableAdmin
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import Client

# Importing the module registers the two admins; devportal/admin/__init__.py imports it once wired.
from devportal.admin import homepage as homepage_admin
from devportal.models import HomepageCarouselCard, HomepageToolTile

from .portal_helpers import is_standalone


def test_both_models_are_registered_as_sortable():
    for model in (HomepageCarouselCard, HomepageToolTile):
        model_admin = admin.site._registry[model]  # noqa: SLF001
        assert isinstance(model_admin, SortableAdmin)
    assert HomepageCarouselCard.is_sortable is not None


def card_form(**data):
    base = {
        "title": "T",
        "blurb": "",
        "link_url": "",
        "link_label": "",
        "image_url": "",
        "image_alt": "",
        "is_active": True,
    }
    return homepage_admin.HomepageCarouselCardForm(data={**base, **data})


def tile_form(**data):
    base = {
        "title": "T",
        "blurb": "",
        "link_url": "/docs/welcome",
        "icon": "code",
        "color": "#4B71B7",
        "is_active": True,
    }
    return homepage_admin.HomepageToolTileForm(data={**base, **data})


@pytest.mark.django_db
def test_card_form_accepts_paths_and_http_urls():
    form = card_form(link_url=" https://koveah.org/ ", image_url="/static/bundles/devportal/home/project-koveah.png")
    assert form.is_valid(), form.errors
    assert form.cleaned_data["link_url"] == "https://koveah.org/"


@pytest.mark.django_db
@pytest.mark.parametrize("bad", ["javascript:alert(1)", "//evil.example", "data:image/png;base64,xx", "ftp://x"])
def test_card_form_rejects_unsafe_urls(bad):
    assert not card_form(link_url=bad).is_valid()
    assert not card_form(image_url=bad).is_valid()


@pytest.mark.django_db
def test_tile_form_offers_only_shipped_icons_and_colours():
    assert tile_form().is_valid()
    assert not tile_form(icon="<svg>").is_valid()
    assert not tile_form(color="red").is_valid()
    assert not tile_form(link_url="javascript:x").is_valid()
    choices = dict(tile_form().fields["icon"].choices)
    assert set(choices) == {"database", "model", "code", "api", "sparkle", "document"}


@pytest.mark.django_db
def test_saved_form_appears_on_the_homepage():
    from devportal.views.home import home_body_html  # noqa: PLC0415

    form = tile_form(title="Linker", link_url="/docs/linker-v3", icon="document", color="#612854")
    assert form.is_valid(), form.errors
    form.save()
    html = home_body_html()
    assert 'href="/docs/linker-v3"' in html
    assert "dp-home__tool-icon--612854" in html


@pytest.mark.django_db
def test_new_rows_go_last():
    last = HomepageToolTile.objects.order_by("-position").first()
    tile = HomepageToolTile.objects.create(title="New")
    assert tile.position == (last.position if last else 0) + 1


@pytest.mark.django_db
def test_changelists_and_sorting_page_load_for_staff():
    if not is_standalone():
        pytest.skip("the Django admin is served on the library host under sefaria.settings")
    user = get_user_model().objects.create_superuser("admin", "admin@example.org", "pw")
    client = Client()
    client.force_login(user)
    for name in ("homepagecarouselcard", "homepagetooltile"):
        changelist = client.get(f"/admin/devportal/{name}/")
        assert changelist.status_code == 200
        sort = client.get(f"/admin/devportal/{name}/sort/")
        assert sort.status_code == 200
    assert "Yamim Noraim Machzor" in client.get("/admin/devportal/homepagecarouselcard/").content.decode()
