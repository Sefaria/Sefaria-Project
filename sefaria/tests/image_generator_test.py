import io

from PIL import Image, ImageChops, ImageStat

import pytest
from bidi.algorithm import get_display

from sefaria import image_generator
from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE
from sefaria.image_generator import (
    generate_image,
    get_category_colors,
    make_img_http_response,
    make_png_http_response,
    make_static_img_http_response,
    open_social_image_logo,
    palette,
    platforms,
    social_image_fallback_bg_color,
    social_image_logo_path,
)


def test_png_response_sets_short_cache_header():
    response = make_png_http_response(Image.new("RGBA", (10, 10), color="#18345D"))

    assert response["Cache-Control"] == "public, max-age=3600"


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


def _rms_image_delta(img_a, img_b, box):
    region_a = img_a.crop(box).convert("L")
    region_b = img_b.crop(box).convert("L")
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
        (
            "And the king said to the wise men who knew the times.",
            "Second Temple",
            "Esther 1:13",
            "en",
            "facebook",
        ),
        (
            "Explore Jewish texts, translations, commentaries, and source sheets.",
            "Static",
            "Sefaria",
            "en",
            "facebook",
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


@pytest.mark.parametrize(
    ("module", "lang", "expected_logo"),
    [
        (LIBRARY_MODULE, "en", "static/img/library-logo-english.png"),
        (LIBRARY_MODULE, "he", "static/img/library-logo-hebrew.png"),
        (VOICES_MODULE, "en", "static/img/voices-logo-english.png"),
        (VOICES_MODULE, "he", "static/img/voices-logo-hebrew.png"),
    ],
)
def test_generate_social_image_uses_module_and_language_header_logo(monkeypatch, module, lang, expected_logo):
    opened_paths = []
    original_open = image_generator.Image.open

    def capture_open(path, *args, **kwargs):
        opened_paths.append(path)
        return original_open(path, *args, **kwargs)

    monkeypatch.setattr(image_generator.Image, "open", capture_open)

    generate_image(
        text="In the beginning God created the heaven and the earth.",
        category="Tanakh",
        ref_str="Genesis 1:1",
        lang=lang,
        platform="facebook",
        module=module,
    )

    assert expected_logo in opened_paths


@pytest.mark.parametrize(
    ("module", "lang", "expected_logo"),
    [
        (LIBRARY_MODULE, "en", "static/img/library-logo-english-white.png"),
        (LIBRARY_MODULE, "he", "static/img/library-logo-hebrew-white.png"),
        (VOICES_MODULE, "en", "static/img/voices-logo-english-white.png"),
        (VOICES_MODULE, "he", "static/img/voices-logo-hebrew-white.png"),
    ],
)
def test_social_image_exception_fallback_uses_module_and_language_logo(monkeypatch, module, lang, expected_logo):
    opened_paths = []
    original_open = image_generator.Image.open

    def capture_open(path, *args, **kwargs):
        opened_paths.append(path)
        return original_open(path, *args, **kwargs)

    def fail_generation(*args, **kwargs):
        raise RuntimeError("force fallback")

    monkeypatch.setattr(image_generator.Image, "open", capture_open)
    monkeypatch.setattr(image_generator, "generate_image", fail_generation)

    response = make_img_http_response(
        text=None,
        category=None,
        ref_str=None,
        lang=lang,
        platform="facebook",
        module=module,
    )

    assert response["Content-Type"] == "image/png"
    assert expected_logo in opened_paths


def test_voices_social_image_exception_fallback_uses_voices_background_color():
    assert social_image_fallback_bg_color(VOICES_MODULE) == "#518159"


def test_static_social_image_uses_static_color_and_original_fallback_logo(monkeypatch):
    opened_paths = []
    original_open = image_generator.Image.open

    def capture_open(path, *args, **kwargs):
        opened_paths.append(path)
        return original_open(path, *args, **kwargs)

    monkeypatch.setattr(image_generator.Image, "open", capture_open)

    response = make_static_img_http_response("facebook")
    img = Image.open(io.BytesIO(response.content))

    assert response["Content-Type"] == "image/png"
    assert img.size == (platforms["facebook"]["width"], platforms["facebook"]["height"])
    assert img.getpixel((100, 100))[:3] == palette["Static"][0]
    assert "static/img/logo-white.png" in opened_paths


def test_social_image_logo_path_defaults_unknown_module_to_library():
    assert social_image_logo_path("unknown", "en", "header") == "static/img/library-logo-english.png"


def test_social_image_logo_assets_are_converted_to_rgba_before_resizing():
    logo = open_social_image_logo("static/img/library-logo-english-white.png")

    assert logo.mode == "RGBA"


def test_generate_social_image_renders_unknown_category_with_stable_fallback_color():
    category = "New Category"
    img = generate_image(
        text="A new category should still produce a usable social image.",
        category=category,
        ref_str="New Category 1",
        lang="en",
        platform="facebook",
    )

    expected_bg, _ = get_category_colors(category)
    assert img.getpixel((100, 200))[:3] == expected_bg
    _assert_text_rendered(img)
    _assert_logo_rendered(img)


def test_unknown_category_color_fallback_is_deterministic():
    assert get_category_colors("New Category") == get_category_colors("New Category")
    assert get_category_colors("New Category") != palette["System"]


@pytest.mark.parametrize(
    ("html_text", "expected_drawn_text"),
    [
        ("First line<br>Second line<br />Third line", "First line\nSecond line\nThird line"),
        ("<p>First paragraph</p><p>Second paragraph</p>", "First paragraph\nSecond paragraph\n"),
        ("<div>First block</div><div>Second block</div>", "First block\nSecond block\n"),
    ],
)
def test_generate_social_image_preserves_linebreaks_created_from_html(monkeypatch, html_text, expected_drawn_text):
    drawn_texts = []
    original_text = image_generator.ImageDraw.ImageDraw.text

    def capture_text(self, *args, **kwargs):
        drawn_texts.append(kwargs.get("text"))
        return original_text(self, *args, **kwargs)

    monkeypatch.setattr(image_generator.ImageDraw.ImageDraw, "text", capture_text)

    generate_image(
        text=html_text,
        category="Tanakh",
        ref_str="Genesis 1:1",
        lang="en",
        platform="facebook",
    )

    # Literal source newlines are stripped during HTML cleanup, but HTML layout
    # tags become real line breaks and should not be flattened by text wrapping.
    assert drawn_texts[0] == expected_drawn_text


def test_generate_social_image_visually_renders_br_linebreaks():
    image_with_break = generate_image(
        text="First line<br>Second line",
        category="Tanakh",
        ref_str="Genesis 1:1",
        lang="en",
        platform="facebook",
    )
    image_with_space = generate_image(
        text="First line Second line",
        category="Tanakh",
        ref_str="Genesis 1:1",
        lang="en",
        platform="facebook",
    )

    # If <br> is flattened to a space, these two images are identical in the
    # quote area. A preserved line break moves text onto a second visual line.
    assert _rms_image_delta(image_with_break, image_with_space, _text_box(image_with_break)) > 1


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
