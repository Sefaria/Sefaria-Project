"""Django admin for the homepage's carousel cards and tool tiles (PLAN.md Phase 5; brief §4.1).

Drag to reorder, as `guides/` does (adminsortable). The form keeps the page safe without inline styles:
links and images must be a path on this host or an http(s) URL, and a tile's icon and colour are chosen
from the lists the homepage ships markup and CSS for (devportal.views.home.TILE_ICONS, TILE_COLORS).
"""

from adminsortable.admin import SortableAdmin
from django import forms
from django.contrib import admin

from devportal.models import HomepageCarouselCard, HomepageToolTile
from devportal.views.home import MAX_CAROUSEL_CARDS, TILE_COLORS, TILE_ICONS, safe_url

URL_HELP = "A path on this site (/docs/welcome) or a full http(s) URL."


def _clean_url(form, field):
    value = (form.cleaned_data.get(field) or "").strip()
    if value and not safe_url(value):
        raise forms.ValidationError(URL_HELP)
    return value


class HomepageItemForm(forms.ModelForm):
    def clean_link_url(self):
        return _clean_url(self, "link_url")

    def clean_image_url(self):
        return _clean_url(self, "image_url")


class HomepageCarouselCardForm(HomepageItemForm):
    class Meta:
        model = HomepageCarouselCard
        fields = (
            "title",
            "blurb",
            "link_url",
            "link_label",
            "link_new_tab",
            "image_url",
            "image_alt",
            "is_active",
        )
        help_texts = {
            "link_url": URL_HELP,
            "link_label": 'The link text, e.g. "Download the App Now".',
            "image_url": "The screenshot beside the text. " + URL_HELP,
            "image_alt": "Describe the image, or leave empty when it only decorates the card.",
            "is_active": f"Shown on the homepage. The carousel shows at most {MAX_CAROUSEL_CARDS} cards.",
        }


class HomepageToolTileForm(HomepageItemForm):
    icon = forms.ChoiceField(choices=TILE_ICONS)
    color = forms.ChoiceField(choices=TILE_COLORS, label="Icon colour")

    class Meta:
        model = HomepageToolTile
        fields = ("title", "blurb", "link_url", "link_new_tab", "icon", "color", "is_active")
        help_texts = {"link_url": URL_HELP, "is_active": "Shown on the homepage."}


@admin.register(HomepageCarouselCard)
class HomepageCarouselCardAdmin(SortableAdmin):
    form = HomepageCarouselCardForm
    list_display = ("title", "link_url", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("title", "blurb")


@admin.register(HomepageToolTile)
class HomepageToolTileAdmin(SortableAdmin):
    form = HomepageToolTileForm
    list_display = ("title", "link_url", "icon", "color", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("title", "blurb")
