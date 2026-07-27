from PIL import Image, ImageDraw, ImageFont, features
import textwrap
from bidi.algorithm import get_display
import re
import structlog
from django.http import HttpResponse
import io
from bs4 import BeautifulSoup
from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE
from typing import Literal, TypeAlias, cast

logger = structlog.get_logger(__name__)

SocialImageLang: TypeAlias = Literal["en", "he"]
SocialImagePlatform: TypeAlias = Literal["facebook", "twitter"]
SocialImageLogoVariant: TypeAlias = Literal["header", "fallback"]
SocialImageModule: TypeAlias = Literal["library", "voices"]
ColorRGB: TypeAlias = tuple[int, int, int]
CategoryColors: TypeAlias = list[ColorRGB]

SUPPORTED_SOCIAL_IMAGE_MODULES = {LIBRARY_MODULE, VOICES_MODULE}

SOCIAL_IMAGE_FALLBACK_BG_COLORS = {
    LIBRARY_MODULE: "#18345D",
    VOICES_MODULE: "#518159",
}

# Per-language render settings. spacing_key, when set, indexes into platforms[platform] for an extra inter-line spacing nudge needed by Hebrew. 
# cat_border_side selects which edge of the image gets the colored category accent stripe.
LANG_RENDER_CONFIG = {
    "en": {
        "align": "left",
        "ref_font_file": "static/fonts/Roboto-Regular.ttf",
        "spacing_key": None,
        "cat_border_side": "left",
    },
    "he": {
        "align": "right",
        "ref_font_file": "static/fonts/Heebo-Regular.ttf",
        "spacing_key": "he_spacing",
        "cat_border_side": "right",
    },
}

palette = { # [(bg), (font)]
    "Commentary": [(75, 113, 183), (255, 255, 255)],
    "Tanakh": [(0, 78, 95), (255, 255, 255)],
    "Midrash":    [(93, 149, 111), (255, 255, 255)],
    "Mishnah": [(90, 153, 183), (0, 0, 0)],
    "Talmud":    [(204, 180, 121), (0, 0, 0)],
    "Halakhah":    [(128, 47, 62), (255, 255, 255)],
    "Kabbalah":    [(89, 65, 118), (255, 255, 255)],
    "Jewish Thought": [(127, 133, 169), (0, 0, 0)],
    "Liturgy":    [(171, 78, 102), (255, 255, 255)],
    "Tosefta":    [(0, 130, 127), (255, 255, 255)],
    "Chasidut":    [(151, 179, 134), (0, 0, 0)],
    "Musar":    [(124, 65, 111), (255, 255, 255)],
    "Responsa":    [(203, 97, 88), (255, 255, 255)],
    "Second Temple": [(198, 167, 180), (0, 0, 0)],
    "Quoting Commentary": [(203, 97, 88), (255, 255, 255)],
    "Sheets":    [(81, 129, 89), (255, 255, 255)],
    "Sheet":    [(81, 129, 89), (255, 255, 255)],
    "Targum":    [(59, 88, 73), (255, 255, 255)],
    "Modern Commentary":    [(184, 212, 211), (255, 255, 255)],
    "Reference":    [(212, 137, 108), (255, 255, 255)],
    "System":    [(24, 52, 93), (255, 255, 255)],
    "Static":    [(0, 80, 94), (255, 255, 255)]
}

fallback_palette_colors = [
    (0, 78, 95),
    (124, 65, 111),
    (93, 149, 111),
    (154, 184, 203),
    (72, 113, 191),
    (203, 97, 88),
    (199, 167, 180),
    (7, 53, 112),
    (171, 78, 102),
    (127, 133, 169),
    (204, 180, 121),
    (89, 65, 118),
    (90, 153, 183),
    (151, 179, 134),
    (128, 47, 62),
    (0, 130, 127),
    (184, 212, 211),
    (212, 137, 108),
]


def get_category_colors(category: str | None) -> CategoryColors:
    if category in palette:
        return palette[category]
    category = category if isinstance(category, str) else ""
    # Unknown categories still need a stable color. This simple hash picks one
    # fallback color based on the category name, so the same category does not
    # change color between requests.
    index = sum(ord(char) for char in category) % len(fallback_palette_colors)
    return [fallback_palette_colors[index], (255, 255, 255)]


def social_image_color_category_for_path(category_path: list[str] | tuple[str, ...]) -> str | None:
    # Use the most specific category that has an explicit image color. This
    # lets /texts/Tanakh/Targum use the Targum color while /texts/Tanakh uses
    # Tanakh. If no category is configured, get_category_colors() will use a
    # stable fallback color based on the returned category name.
    for category in reversed(category_path):
        if category in palette:
            return category
    return category_path[0] if category_path else None


def normalize_social_image_module(module: str | None) -> SocialImageModule:
    # Only modules with logo assets are supported here. Anything else uses the
    # Library image style until a module-specific image is intentionally added.
    # This makes sure future modules if they are ever added to still produce an image.
    if module in SUPPORTED_SOCIAL_IMAGE_MODULES:
        return cast(SocialImageModule, module)
    return cast(SocialImageModule, LIBRARY_MODULE)


def social_image_logo_path(
    module: str | None = LIBRARY_MODULE,
    lang: str = "en",
    variant: SocialImageLogoVariant = "header",
) -> str:
    module = normalize_social_image_module(module)
    normalized_lang: SocialImageLang = "he" if lang == "he" else "en"
    variant_suffix = "-white" if variant == "fallback" else ""
    return f"static/img/{module}/{module}-logo-{normalized_lang}{variant_suffix}.png"


def social_image_fallback_bg_color(module: str | None = LIBRARY_MODULE) -> str:
    module = normalize_social_image_module(module)
    return SOCIAL_IMAGE_FALLBACK_BG_COLORS[module]


def open_social_image_logo(path: str) -> Image.Image:
    # Logo assets may be paletted PNGs. Convert before resizing so antialiased
    # transparent edges stay smooth when composited onto the generated image.
    return Image.open(path).convert("RGBA")


def generate_centered_logo_image(
    platform: SocialImagePlatform,
    bg_color: str | ColorRGB,
    logo_path: str,
    max_logo_size: int = 400,
) -> Image.Image:
    # Used for fallback images that only show a centered logo. The caller
    # chooses the color and logo so static pages can keep the old Sefaria logo
    # while module pages can use Library or Voices branding.
    height = platforms[platform]["height"]
    width = platforms[platform]["width"]
    img = Image.new('RGBA', (width, height), color=bg_color)
    logo = open_social_image_logo(logo_path)
    logo.thumbnail((max_logo_size, max_logo_size), Image.LANCZOS)
    logo_padded = Image.new('RGBA', (width, height))
    logo_padded.paste(logo, (int(width/2-logo.size[0]/2), int(height/2-logo.size[1]/2)))
    return Image.alpha_composite(img, logo_padded)


def add_social_image_header(
    img: Image.Image, lang: str, platform: SocialImagePlatform, module: str | None
) -> Image.Image:
    # All non-fallback social images share the same white header. Keeping this
    # in one helper prevents the quote and TOC renderers from drifting apart.
    width, height = img.size
    draw = ImageDraw.Draw(im=img)
    draw.line(
        (0, int(height * 0.05), width, int(height * 0.05)),
        fill=(255, 255, 255),
        width=int(height * 0.1),
    )
    draw.line(
        (0, int(height * 0.1), width, int(height * 0.1)),
        fill="#CCCCCC",
        width=int(height * 0.0025),
    )

    logo = open_social_image_logo(social_image_logo_path(module, lang, "header"))
    logo.thumbnail((width, int(height * 0.06)), Image.LANCZOS)
    logo_padded = Image.new("RGBA", (width, height))
    logo_padded.paste(
        logo, (int(width / 2 - logo.size[0] / 2), int(height * 0.05 - logo.size[1] / 2))
    )
    return Image.alpha_composite(img, logo_padded)


def make_png_http_response(img: Image.Image) -> HttpResponse:
    buf = io.BytesIO()
    img.save(buf, format='png')
    response = HttpResponse(buf.getvalue(), content_type="image/png")
    # Social images are mostly stable, so cache briefly to avoid unnecessary
    # image rendering while still allowing text or asset corrections to appear.
    response["Cache-Control"] = "public, max-age=3600"
    return response


def make_module_fallback_img_http_response(
    lang: str,
    platform: SocialImagePlatform,
    module: str | None = LIBRARY_MODULE,
) -> HttpResponse:
    # Module fallbacks are for pages that do not have a custom renderer, such
    # as topics or sheets. They use module-specific color and logo assets.
    module = normalize_social_image_module(module)
    img = generate_centered_logo_image(
        platform,
        social_image_fallback_bg_color(module),
        social_image_logo_path(module, lang, "fallback"),
        max_logo_size=500,
    )
    return make_png_http_response(img)


def make_static_img_http_response(platform: SocialImagePlatform) -> HttpResponse:
    # Static marketing/about pages are shared by modules. Keep these visually
    # neutral by using the Static category color and original white Sefaria logo.
    bg_color, _ = get_category_colors("Static")
    img = generate_centered_logo_image(platform, bg_color, "static/img/logo-white.png")
    return make_png_http_response(img)


def generate_toc_image(
    title: str | None,
    subtitle: str | None,
    category: str | None,
    lang: str,
    platform: SocialImagePlatform,
    module: str | None = LIBRARY_MODULE,
    category_path: tuple[str, ...] = (),
) -> Image.Image:
    bg_color, text_color = get_category_colors(category)
    width = platforms[platform]["width"]
    height = platforms[platform]["height"]
    img = Image.new("RGBA", (width, height), color=bg_color)

    lang_config = LANG_RENDER_CONFIG["en"] if lang == "en" else LANG_RENDER_CONFIG["he"]
    align = lang_config["align"]
    direction = get_text_direction(lang)
    spacing_key = lang_config["spacing_key"]
    spacing = platforms[platform][spacing_key] if spacing_key else 0

    # Primary category pages (/texts/Tanakh, /texts/Mishnah, etc.) get larger,
    # vertically-centered text. Nested categories and book-level TOC pages use
    # the standard quote-image layout.
    is_primary_category = len(category_path) == 1

    if is_primary_category:
        title_font = ImageFont.truetype(
            font="static/fonts/Amiri-Taamey-Frank-merged.ttf", size=90
        )
        subtitle_font = ImageFont.truetype(font=lang_config["ref_font_file"], size=38)
    else:
        title_font = ImageFont.truetype(
            font="static/fonts/Amiri-Taamey-Frank-merged.ttf", size=72
        )
        subtitle_font = ImageFont.truetype(font=lang_config["ref_font_file"], size=30)

    title_text = prepare_text_for_drawing(title or "", lang)
    subtitle_text = prepare_text_for_drawing((subtitle or "").upper(), lang)

    if is_primary_category:

        def _bbox_h(text, font):
            b = font.getbbox(text)
            return b[3] - b[1]

        title_h = _bbox_h(title_text, title_font) if title_text else 0
        sub_h = _bbox_h(subtitle_text, subtitle_font) if subtitle_text else 0
        gap = int(height * 0.04) if subtitle_text else 0
        block_h = title_h + gap + sub_h
        content_center_y = (height * 0.1 + height) / 2
        block_top = content_center_y - block_h / 2
        title_y = block_top + title_h / 2
        subtitle_y = block_top + title_h + gap + sub_h / 2
    else:
        title_y = height * 0.47
        subtitle_y = height * 0.61

    draw = ImageDraw.Draw(im=img)
    draw.text(
        xy=(width / 2, title_y),
        text=title_text,
        font=title_font,
        spacing=spacing,
        align=align,
        fill=text_color,
        anchor="mm",
        direction=direction,
    )
    if subtitle_text:
        draw.text(
            xy=(width / 2, subtitle_y),
            text=subtitle_text,
            font=subtitle_font,
            spacing=spacing,
            align=align,
            fill=text_color,
            anchor="mm",
            direction=direction,
        )

    cat_border_x = 0 if lang_config["cat_border_side"] == "left" else width
    draw.line(
        (cat_border_x, 0, cat_border_x, height), fill=bg_color, width=int(width * 0.02)
    )
    draw.line((0, 0, width, 0), fill="#666666", width=1)
    draw.line((0, 0, 0, height), fill="#666666", width=1)
    draw.line((width - 1, 0, width - 1, height), fill="#666666", width=1)
    draw.line((0, height - 1, width, height - 1), fill="#666666", width=1)

    return add_social_image_header(img, lang, platform, module)


def make_toc_img_http_response(
    title: str | None,
    subtitle: str | None,
    category: str | None,
    lang: str,
    platform: SocialImagePlatform,
    module: str | None = LIBRARY_MODULE,
    category_path: tuple[str, ...] = (),
) -> HttpResponse:
    try:
        img = generate_toc_image(
            title,
            subtitle,
            category,
            lang,
            platform,
            module,
            category_path=category_path,
        )
    except Exception:
        logger.exception(
            "social_toc_image_generation_failed",
            lang=lang,
            platform=platform,
            module=module,
            category=category,
        )
        return make_module_fallback_img_http_response(lang, platform, module)
    return make_png_http_response(img)


platforms = {
    "facebook": {
        "width": 1200,
        "height": 630,
        "padding": 260,
        "font_size": 60,
        "ref_font_size": 24,
        "he_spacing": 5,
    },
    "twitter": {
        "width": 1200,
        "height": 600,
        "padding": 260,
        "font_size": 60,
        "ref_font_size": 24,
        "he_spacing": 5,
    }

}

def smart_truncate(content: str, length: int = 180, suffix: str = '...') -> str:
    if len(content) <= length:
        return content
    else:
        return ' '.join(content[:length+1].split(' ')[0:-1]) + suffix

def calc_letters_per_line(text: str, font: ImageFont.FreeTypeFont, img_width: int) -> int:
    if not text:
        return 1
    avg_char_width = sum(font.getlength(char) for char in text) / len(text)
    if avg_char_width <= 0:
        return len(text)
    max_char_count = int(img_width / avg_char_width)
    return max(1, max_char_count)


def wrap_text_preserving_linebreaks(text: str, width: int) -> str:
    # HTML cleanup turns <br> and block boundaries into "\n". Wrap each line
    # independently so those intentional breaks survive textwrap's whitespace handling.
    return "\n".join(
        textwrap.fill(text=line, width=width, replace_whitespace=False)
        for line in text.split("\n")
    )


def supports_rtl_text_layout() -> bool:
    return features.check("raqm")


def prepare_text_for_drawing(text: str, lang: str) -> str:
    if lang == "en" or supports_rtl_text_layout():
        return text
    return get_display(text)


def get_text_direction(lang: str) -> Literal["rtl"] | None:
    if lang != "en" and supports_rtl_text_layout():
        return "rtl"
    return None


def html_to_text_canonical(html: str | None) -> str:
    """
    Canonical HTML-to-text normalization matching Sefaria-Project `Sefaria.util.htmlToText`.
    """
    if not html:
        return ""

    # Remove literal newlines and tabs
    html = html.replace("\n", "").replace("\t", "")

    # Insert structural separators (case-sensitive, to match canonical behavior)
    html = html.replace("</td>", "\t")
    html = html.replace("</table>", "\n")
    html = html.replace("</tr>", "\n")
    html = html.replace("</p>", "\n")
    html = html.replace("</div>", "\n")
    html = html.replace("<br>", "\n")
    html = re.sub(r"<br( )*/>", "\n", html)

    # Parse HTML and extract text via BeautifulSoup, which mirrors the JS DOMParser+textContent path in Sefaria-Project `Sefaria.util.htmlToText`.
    text = BeautifulSoup(html, "lxml").get_text()

    # Collapse duplicate blank lines
    text = re.sub(r"\n\s*\n", "\n", text)
    return text

def cleanup_and_format_text(text: str | None) -> str:
    # Removes HTML tags/entities according to canonical web copy behavior,
    # then removes nikkudot and taamim. The cantillation strip is Hebrew-specific
    # but a safe no-op on English text since the regex only matches Hebrew/CJK ranges.
    text = html_to_text_canonical(text)
    text = text.replace("—", "-")
    text = text.replace(u"\u05BE", " ")  #replace hebrew dash with ascii

    strip_cantillation_vowel_regex = re.compile("[^\u05d0-\u05f4\\s^\x00-\x7F\x80-\xFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2000-\u206f]")
    text = strip_cantillation_vowel_regex.sub('', text)
    text = smart_truncate(text)
    return text


def generate_image(
    text: str | None = "",
    category: str | None = "System",
    ref_str: str | None = "",
    lang: str = "he",
    platform: SocialImagePlatform = "twitter",
    module: str | None = LIBRARY_MODULE,
) -> Image.Image:
    bg_color, text_color = get_category_colors(category)
    ref_str = ref_str or ""

    font = ImageFont.truetype(font='static/fonts/Amiri-Taamey-Frank-merged.ttf', size=platforms[platform]["font_size"])
    width = platforms[platform]["width"]
    height = platforms[platform]["height"]
    padding_x = platforms[platform]["padding"]
    padding_y = padding_x/2
    img = Image.new('RGBA', (width, height), color=bg_color)

    lang_config = LANG_RENDER_CONFIG["en"] if lang == "en" else LANG_RENDER_CONFIG["he"]
    align = lang_config["align"]
    spacing_key = lang_config["spacing_key"]
    spacing = platforms[platform][spacing_key] if spacing_key else 0
    ref_font = ImageFont.truetype(
        font=lang_config["ref_font_file"], size=platforms[platform]["ref_font_size"]
    )
    cat_border_x = 0 if lang_config["cat_border_side"] == "left" else img.size[0]
    cat_border_pos = (cat_border_x, 0, cat_border_x, img.size[1])

    text = cleanup_and_format_text(text)
    text = wrap_text_preserving_linebreaks(text, calc_letters_per_line(text, font, int(img.size[0]-padding_x)))
    text = prepare_text_for_drawing(text, lang)
    direction = get_text_direction(lang)

    draw = ImageDraw.Draw(im=img)
    draw.text(xy=(img.size[0] / 2, img.size[1] / 2), text=text, font=font, spacing=spacing, align=align,
              fill=text_color, anchor='mm', direction=direction)

    # category line
    draw.line(cat_border_pos, fill=bg_color, width=int(width*.02))

    img = add_social_image_header(img, lang, platform, module)
    draw = ImageDraw.Draw(im=img)

    # write ref
    ref_text = prepare_text_for_drawing(ref_str.upper(), lang)
    draw.text(xy=(img.size[0] / 2, img.size[1]-padding_y/2), text=ref_text, font=ref_font, spacing=spacing, align=align, fill=text_color, anchor='mm', direction=direction)

    # border
    draw.line((0, 0, width, 0), fill="#666666", width=1)
    draw.line((0, 0, 0, height), fill="#666666", width=1)
    draw.line((width-1, 0, width-1, height), fill="#666666", width=1)
    draw.line((0, height-1, width, height-1), fill="#666666", width=1)

    return img


def make_img_http_response(
    text: str | None,
    category: str | None,
    ref_str: str | None,
    lang: str,
    platform: SocialImagePlatform,
    module: str | None = LIBRARY_MODULE,
) -> HttpResponse:
    try:
        img = generate_image(text, category, ref_str, lang, platform, module)
    except Exception:
        logger.exception(
            "social_image_generation_failed",
            lang=lang,
            platform=platform,
            module=module,
            category=category,
        )
        return make_module_fallback_img_http_response(lang, platform, module)

    return make_png_http_response(img)
