from PIL import ImageChops, ImageStat

import pytest
from bidi.algorithm import get_display

from sefaria import image_generator
from sefaria.image_generator import generate_image, palette, platforms


def _pixel_variance(img, box):
    # A blank text area has nearly one color throughout, so brightness variance
    # stays close to zero. Rendered letters add light/dark pixels and raise it.
    region = img.crop(box).convert("L")
    return ImageStat.Stat(region).var[0]


def _rms_brightness_delta(img, box_a, box_b):
    # RMS compares two regions by the size of their pixel differences. Here we
    # compare the text area to a plain background area to catch blank/no-text renders.
    region_a = img.crop(box_a).convert("L")
    region_b = img.crop(box_b).resize(region_a.size).convert("L")
    diff = ImageStat.Stat(ImageChops.difference(region_a, region_b))
    return diff.rms[0]


def _text_box(img):
    # Central body area where the main quote should be drawn.
    width, height = img.size
    return (
        int(width * 0.25),
        int(height * 0.30),
        int(width * 0.75),
        int(height * 0.70),
    )


def _background_box(img):
    # Plain colored area away from text/header/logo, used as a baseline.
    width, height = img.size
    return (
        int(width * 0.05),
        int(height * 0.25),
        int(width * 0.20),
        int(height * 0.40),
    )


def _logo_box(img):
    # Top-center header area where the Sefaria logo is composited.
    width, height = img.size
    return (
        int(width * 0.43),
        int(height * 0.02),
        int(width * 0.57),
        int(height * 0.085),
    )


def _plain_header_box(img):
    # Header area away from the logo; should remain close to solid white.
    width, height = img.size
    return (
        int(width * 0.05),
        int(height * 0.02),
        int(width * 0.19),
        int(height * 0.085),
    )


def _assert_text_rendered(img):
    # Use both local variance and RMS-vs-background so a blank body cannot pass.
    text_box = _text_box(img)
    background_box = _background_box(img)
    assert _pixel_variance(img, text_box) > 1
    assert _rms_brightness_delta(img, text_box, background_box) > 1


def _assert_logo_rendered(img):
    # Same idea as the text check, but scoped to the logo's header position.
    logo_box = _logo_box(img)
    plain_header_box = _plain_header_box(img)
    assert _pixel_variance(img, logo_box) > 1
    assert _rms_brightness_delta(img, logo_box, plain_header_box) > 1


@pytest.mark.parametrize(
    ("text", "category", "ref_str", "lang", "platform"),
    [
        (
            "In the beginning God created the heaven and the earth.",
            "Tanakh",
            "Genesis 1:1",
            "en",
            "facebook",
        ),
        (
            "From what time may one recite Shema in the evening?",
            "Talmud",
            "Berakhot 2a",
            "en",
            "twitter",
        ),
    ],
)
def test_generate_social_image_smoke(text, category, ref_str, lang, platform):
    img = generate_image(
        text=text,
        category=category,
        ref_str=ref_str,
        lang=lang,
        platform=platform,
    )

    expected_size = (platforms[platform]["width"], platforms[platform]["height"])
    assert img.size == expected_size
    assert img.getpixel((100, 200))[:3] == palette[category][0]
    _assert_text_rendered(img)


def test_generate_social_image_renders_logo_in_header():
    img = generate_image(
        text="In the beginning God created the heaven and the earth.",
        category="Tanakh",
        ref_str="Genesis 1:1",
        lang="en",
        platform="facebook",
    )

    _assert_logo_rendered(img)


def test_hebrew_text_keeps_logical_order_when_pillow_supports_rtl(monkeypatch):
    text = "בראשית ברא אלהים"

    monkeypatch.setattr(image_generator, "supports_rtl_text_layout", lambda: True)

    assert image_generator.prepare_text_for_drawing(text, "he") == text
    assert image_generator.get_text_direction("he") == "rtl"


def test_hebrew_text_uses_bidi_fallback_without_pillow_rtl_support(monkeypatch):
    text = "בראשית ברא אלהים"

    monkeypatch.setattr(image_generator, "supports_rtl_text_layout", lambda: False)

    assert image_generator.prepare_text_for_drawing(text, "he") == get_display(text)
    assert image_generator.get_text_direction("he") is None
