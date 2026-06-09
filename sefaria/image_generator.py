from PIL import Image, ImageDraw, ImageFont, features
import textwrap
from bidi.algorithm import get_display
import re
from django.http import HttpResponse
import io
from bs4 import BeautifulSoup
from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE
from typing import Literal, TypeAlias, cast

SocialImageLang: TypeAlias = Literal["en", "he"]
SocialImagePlatform: TypeAlias = Literal["facebook", "twitter"]
SocialImageLogoVariant: TypeAlias = Literal["header", "fallback"]
SocialImageModule: TypeAlias = Literal["library", "voices"]
ColorRGB: TypeAlias = tuple[int, int, int]
CategoryColors: TypeAlias = list[ColorRGB]

SUPPORTED_SOCIAL_IMAGE_MODULES = {LIBRARY_MODULE, VOICES_MODULE}

SOCIAL_IMAGE_LOGOS = {
    LIBRARY_MODULE: {
        "en": {
            "header": "static/img/library-logo-english.png",
            "fallback": "static/img/library-logo-english-white.png",
        },
        "he": {
            "header": "static/img/library-logo-hebrew.png",
            "fallback": "static/img/library-logo-hebrew-white.png",
        },
    },
    VOICES_MODULE: {
        "en": {
            "header": "static/img/voices-logo-english.png",
            "fallback": "static/img/voices-logo-english-white.png",
        },
        "he": {
            "header": "static/img/voices-logo-hebrew.png",
            "fallback": "static/img/voices-logo-hebrew-white.png",
        },
    },
}

SOCIAL_IMAGE_FALLBACK_BG_COLORS = {
    LIBRARY_MODULE: "#18345D",
    VOICES_MODULE: "#518159",
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
    """
    Return ``[background_color, font_color]`` for the given category name.

    Colors are defined in the ``palette`` dict above. 
    If ``category`` is not in the palette (or is ``None``), a fallback color is chosen deterministically by hashing the category string — 
    so the same unknown category always gets the same color on every request rather than a random one.

    The return value is always a two-element list of RGB tuples:
    ``[(R, G, B), (R, G, B)]``, background first, font color second.
    """
    if category in palette:
        return palette[category]
    category = category if isinstance(category, str) else ""
    # Unknown categories still need a stable color. This simple hash picks one
    # fallback color based on the category name, so the same category does not
    # change color between requests.
    index = sum(ord(char) for char in category) % len(fallback_palette_colors)
    return [fallback_palette_colors[index], (255, 255, 255)]


def normalize_social_image_module(module: str | None) -> SocialImageModule:
    """
    Validate that ``module`` is one of the two supported module names
    (``"library"`` or ``"voices"``) and return it unchanged if so.

    If the value is anything else — including ``None`` or an unrecognised
    future module name — ``LIBRARY_MODULE`` (``"library"``) is returned as a
    safe default. This is called before any logo lookup or URL-conf resolution
    so those functions never receive an invalid module name.
    """
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
    """
    Return the relative file path for the logo asset to use in a social image.

    ``module`` is either ``"library"`` or ``"voices"``; anything else is normalised to ``"library"``.
    ``lang`` selects the English or Hebrew version of the logo (anything that is not ``"he"`` is treated as English).
    ``variant`` is ``"header"`` for the coloured logo shown at the top of a text image, or ``"fallback"`` for the white logo shown on the solid-colour fallback images.

    All logo paths are defined in ``SOCIAL_IMAGE_LOGOS`` at the top of this file.
    """
    module = normalize_social_image_module(module)
    normalized_lang: SocialImageLang = "he" if lang == "he" else "en"
    return SOCIAL_IMAGE_LOGOS[module][normalized_lang][variant]


def social_image_fallback_bg_color(module: str | None = LIBRARY_MODULE) -> str:
    """
    Return the CSS hex color string (e.g. ``"#18345D"``) to use as the background of a module fallback image.

    Each Sefaria module has its own brand color defined in ``SOCIAL_IMAGE_FALLBACK_BG_COLORS``. 
    This is used when there is no category-specific color available — for example on a Voices page that does not map to a text ref.
    """
    module = normalize_social_image_module(module)
    return SOCIAL_IMAGE_FALLBACK_BG_COLORS[module]


def open_social_image_logo(path: str) -> Image.Image:
    """
    Open a logo PNG from ``path`` and convert it to RGBA mode.

    The conversion matters because logo files may be saved in palette mode (``"P"``). 
    Resizing a palette-mode image produces jagged transparent edges; converting to RGBA first lets Pillow antialias the edges smoothly when the logo is composited onto the generated image.
    """
    # Logo assets may be paletted PNGs. Convert before resizing so antialiased
    # transparent edges stay smooth when composited onto the generated image.
    return Image.open(path).convert("RGBA")


def generate_centered_logo_image(platform: SocialImagePlatform, bg_color: str | ColorRGB, logo_path: str) -> Image.Image:
    """
    Create a plain solid-color image with a single logo centered on it.

    Used for fallback images — pages that don't have a custom image renderer (e.g. topic pages, Voices pages). 
    The logo is scaled to fit within a 400×400 pixel box while preserving its aspect ratio, then pasted exactly in the middle of the canvas.

    ``bg_color`` can be an RGB tuple or a CSS hex string (Pillow accepts both).
    ``logo_path`` should be a path returned by ``social_image_logo_path``.
    """
    # Used for fallback images that only show a centered logo. The caller
    # chooses the color and logo so static pages can keep the old Sefaria logo
    # while module pages can use Library or Voices branding.
    height = platforms[platform]["height"]
    width = platforms[platform]["width"]
    img = Image.new('RGBA', (width, height), color=bg_color)
    logo = open_social_image_logo(logo_path)
    logo.thumbnail((400, 400), Image.LANCZOS)
    logo_padded = Image.new('RGBA', (width, height))
    logo_padded.paste(logo, (int(width/2-logo.size[0]/2), int(height/2-logo.size[1]/2)))
    return Image.alpha_composite(img, logo_padded)


def make_png_http_response(img: Image.Image) -> HttpResponse:
    """
    Encode a Pillow ``Image`` as a PNG and return it as a Django
    ``HttpResponse`` with the correct ``Content-Type``.

    The response includes a one-hour ``Cache-Control`` header so CDNs and browsers can reuse cached images without re-rendering on every page load,
    while still allowing corrections to appear within a reasonable time.
    """
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
    """
    Generate and return the fallback social image for a specific Sefaria module.

    This is shown for pages that belong to Library or Voices but do not have a custom image renderer (e.g. topic pages, sheet pages). 
    It shows the module's brand color as the background with its white logo centered on top.

    ``lang`` picks the Hebrew or English version of the logo.
    ``platform`` sets the canvas dimensions (Facebook vs Twitter).
    """
    # Module fallbacks are for pages that do not have a custom renderer, such
    # as topics or sheets. They use module-specific color and logo assets.
    module = normalize_social_image_module(module)
    img = generate_centered_logo_image(
        platform,
        social_image_fallback_bg_color(module),
        social_image_logo_path(module, lang, "fallback"),
    )
    return make_png_http_response(img)


def make_static_img_http_response(platform: SocialImagePlatform) -> HttpResponse:
    """
    Generate and return the fallback social image for static marketing pages
    (About, Jobs, etc.).

    Static pages are shared across all modules, so this image is deliberately module-neutral: 
    it uses the ``"Static"`` category color and the original white Sefaria logo rather than a Library- or Voices-specific asset.
    """
    # Static marketing/about pages are shared by modules. Keep these visually
    # neutral by using the Static category color and original white Sefaria logo.
    bg_color, _ = get_category_colors("Static")
    img = generate_centered_logo_image(platform, bg_color, "static/img/logo-white.png")
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
    """
    Shorten ``content`` to at most ``length`` characters without cutting a word in half.

    If the text is already within ``length``, it is returned unchanged.
    Otherwise the text is trimmed to ``length`` characters, the last (potentially partial) word is dropped, and ``suffix`` (default ``"..."``) is appended. 
    This keeps image text readable rather than ending mid-word.
    """
    if len(content) <= length:
        return content
    else:
        return ' '.join(content[:length+1].split(' ')[0:-1]) + suffix

def get_text_width(text: str, font: ImageFont.FreeTypeFont) -> float:
    """
    Return the rendered pixel width of ``text`` in the given ``font``.

    Pillow's API for measuring text has changed across versions. This function tries ``getlength`` first (the modern API), then ``getbbox`` (intermediate), 
    then falls back to ``getsize`` (legacy) so the code works on any installed version of Pillow.
    """
    if hasattr(font, "getlength"):
        return font.getlength(text)
    if hasattr(font, "getbbox"):
        left, _, right, _ = font.getbbox(text)
        return right - left
    return font.getsize(text)[0]


def calc_letters_per_line(text: str, font: ImageFont.FreeTypeFont, img_width: int) -> int:
    """
    Estimate how many characters fit on one line of ``img_width`` pixels wide in the given ``font``.

    Uses the average character width across all characters in ``text`` as a rough measure. 
    The result is passed to ``textwrap.fill`` so the text wraps before reaching the image edge. 
    Returns at least ``1`` to avoid a zero-width wrap that would produce an infinite loop.
    """
    if not text:
        return 1
    avg_char_width = sum(get_text_width(char, font) for char in text) / len(text)
    if avg_char_width <= 0:
        return len(text)
    max_char_count = int(img_width / avg_char_width)
    return max(1, max_char_count)


def wrap_text_preserving_linebreaks(text: str, width: int) -> str:
    """
    Wrap ``text`` to ``width`` characters per line while keeping any existing newline characters in place.

    ``html_to_text_canonical`` converts HTML block tags (``</p>``, ``<br>``, etc.) into ``"\\n"`` before this function is called. 
    Passing the whole string to ``textwrap.fill`` would collapse those intentional breaks.
    Instead this function splits on ``"\\n"`` first, wraps each segment independently, then rejoins them so the original paragraph structure survives.
    """
    return "\n".join(
        textwrap.fill(text=line, width=width, replace_whitespace=False)
        for line in text.split("\n")
    )


def supports_rtl_text_layout() -> bool:
    """
    Return ``True`` if the Raqm library is available on this system.

    Raqm is a C library that handles complex text layout including right-to-left scripts. 
    When it is present, Pillow can draw Hebrew text directly in the correct visual order. 
    When it is absent, the ``python-bidi`` library is used as a fallback to reorder the characters before passing them to Pillow.
    """
    return features.check("raqm")


def prepare_text_for_drawing(text: str, lang: str) -> str:
    """
    Reorder ``text`` so Pillow draws characters in the correct visual sequence, including Hebrew words embedded inside English passages.

    When Raqm is available (``supports_rtl_text_layout()`` returns ``True``),
    Pillow handles all BiDi reordering internally, so the text is passed through unchanged. 
    The ``direction`` hint returned by ``get_text_direction()`` tells Raqm the paragraph base direction so it can correctly place neutral characters (commas, spaces) at LTR/RTL boundaries.

    When Raqm is absent, ``python-bidi``'s ``get_display()`` applies the Unicode Bidirectional Algorithm manually. 
    ``base_dir`` is set to ``'L'`` for English so neutral characters at Hebrew/English boundaries are resolved with left-to-right as the paragraph direction, 
    matching how the text looks when read as English with embedded Hebrew words.
    Hebrew-primary text uses automatic base-direction detection (which will resolve to right-to-left for Hebrew).
    """
    if supports_rtl_text_layout():
        # Raqm handles all layout; direction hint is in get_text_direction().
        return text
    base_dir = 'L' if lang == "en" else 'R'
    return get_display(text, base_dir=base_dir)


def get_text_direction(lang: str) -> Literal["rtl", "ltr"] | None:
    """
    Return the ``direction`` keyword argument to pass to Pillow's
    ``draw.text()``.

    When Raqm is available, this hint tells Raqm the paragraph base direction so it resolves neutral characters (commas, spaces) at LTR/RTL boundaries correctly:
    - ``"rtl"`` for Hebrew text.
    - ``"ltr"`` for English text (even English that contains Hebrew words — a comma in "fathers ,יהוה" should stay on the English side of the Hebrew word, not drift to the far side).

    When Raqm is absent, ``prepare_text_for_drawing`` has already reordered the characters to visual order, 
    so no direction hint is needed and ``None`` is returned.
    """
    if not supports_rtl_text_layout():
        return None
    return "rtl" if lang == "he" else "ltr"


def html_to_text_canonical(html: str | None) -> str:
    """
    Strip HTML tags from ``html`` and return plain text, matching the
    behaviour of ``Sefaria.util.htmlToText`` in the JavaScript frontend.

    Block-level tags (``</p>``, ``</div>``, ``<br>``, ``</tr>``, etc.) are
    converted to newlines before parsing so paragraph structure is preserved.
    Consecutive blank lines are collapsed to a single newline. Returns an
    empty string if ``html`` is ``None`` or empty.

    Keeping this in sync with the JS function matters because the same text
    is rendered in both the browser and in generated social images.
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

def cleanup_and_format_text(text: str | None, language: str) -> str:
    """
    Prepare raw Sefaria text for rendering inside a social image.

    Applies the following steps in order:

    1. Strips HTML tags via ``html_to_text_canonical``.
    2. Replaces em-dashes and Hebrew maqafs (``\\u05BE``) with plain ASCII equivalents so the image font renders them correctly.
    3. Strips Hebrew cantillation marks (ta'amei hamikra) and nikud (vowel points) using a Unicode range regex — 
    these are decorative in the source text but make social image text harder to read.
    4. Truncates to 180 characters at a word boundary via ``smart_truncate``.
    """
    # Removes HTML tags/entities according to canonical web copy behavior, then removes nikkudot and taamim.
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
    """
    Render and return a social-sharing image as a Pillow ``Image``.

    The image has three visible regions:

    - A white header bar at the top containing the module logo (Library, Voices, or Sefaria depending on ``module``).
    - A colored body area (color determined by ``category``) containing the passage text centered vertically.
    - A footer area showing ``ref_str`` (the source reference) in small caps.

    A thin colored bar on the left edge (English) or right edge (Hebrew) marks the category, and a thin grey border frames the whole image.

    ``text`` is the passage body — raw HTML is accepted and cleaned internally via ``cleanup_and_format_text``.
    ``category`` picks the background/font color pair from the ``palette`` dict above. Unknown categories get a stable hash-based fallback color.
    ``lang`` controls font choice, text alignment, and RTL handling.
    ``platform`` sets canvas dimensions (``"facebook"`` = 1200×630, ``"twitter"`` = 1200×600).
    ``module`` selects which logo appears in the header.
    """
    bg_color, text_color = get_category_colors(category)
    ref_str = ref_str or ""
    module = normalize_social_image_module(module)

    font = ImageFont.truetype(font='static/fonts/Amiri-Taamey-Frank-merged.ttf', size=platforms[platform]["font_size"])
    width = platforms[platform]["width"]
    height = platforms[platform]["height"]
    padding_x = platforms[platform]["padding"]
    padding_y = padding_x/2
    img = Image.new('RGBA', (width, height), color=bg_color)

    if lang == "en":
        align = "left"
        logo_url = social_image_logo_path(module, lang, "header")
        spacing = 0
        ref_font = ImageFont.truetype(font='static/fonts/Roboto-Regular.ttf', size=platforms[platform]["ref_font_size"])
        cat_border_pos = (0, 0, 0, img.size[1])

    else:
        align = "right"
        logo_url = social_image_logo_path(module, lang, "header")
        spacing = platforms[platform]["he_spacing"]
        ref_font = ImageFont.truetype(font='static/fonts/Heebo-Regular.ttf', size=platforms[platform]["ref_font_size"])
        cat_border_pos = (img.size[0], 0, img.size[0], img.size[1])

    text = cleanup_and_format_text(text, lang)
    text = wrap_text_preserving_linebreaks(text, calc_letters_per_line(text, font, int(img.size[0]-padding_x)))
    text = prepare_text_for_drawing(text, lang)
    direction = get_text_direction(lang)

    draw = ImageDraw.Draw(im=img)
    draw.text(xy=(img.size[0] / 2, img.size[1] / 2), text=text, font=font, spacing=spacing, align=align,
              fill=text_color, anchor='mm', direction=direction)

    # category line
    draw.line(cat_border_pos, fill=bg_color, width=int(width*.02))

    # header white
    draw.line((0, int(height*.05), img.size[0], int(height*.05)), fill=(255, 255, 255), width=int(height*.1))
    draw.line((0, int(height*.1), img.size[0], int(height*.1)), fill="#CCCCCC", width=int(height*.0025))

    # write ref
    ref_text = prepare_text_for_drawing(ref_str.upper(), lang)
    draw.text(xy=(img.size[0] / 2, img.size[1]-padding_y/2), text=ref_text, font=ref_font, spacing=spacing, align=align, fill=text_color, anchor='mm', direction=direction)

    # border
    draw.line((0, 0, width, 0), fill="#666666", width=1)
    draw.line((0, 0, 0, height), fill="#666666", width=1)
    draw.line((width-1, 0, width-1, height), fill="#666666", width=1)
    draw.line((0, height-1, width, height-1), fill="#666666", width=1)

    # add sefaria logo
    logo = open_social_image_logo(logo_url)
    logo.thumbnail((width, int(height*.06)), Image.LANCZOS)
    logo_padded = Image.new('RGBA', (width, height))
    logo_padded.paste(logo, (int(width/2-logo.size[0]/2), int(height*.05-logo.size[1]/2)))

    img = Image.alpha_composite(img, logo_padded)

    return(img)


def make_img_http_response(
    text: str | None,
    category: str | None,
    ref_str: str | None,
    lang: str,
    platform: SocialImagePlatform,
    module: str | None = LIBRARY_MODULE,
) -> HttpResponse:
    """
    Top-level entry point: render a social image and return it as an HTTP
    response.

    Delegates to ``generate_image`` for the actual drawing. 
    If anything goes wrong (e.g. a font file is missing, a text processing step raises), the exception is caught, printed to the server log, 
    and the module fallback image is returned instead so the caller always gets a valid PNG response.
    """
    module = normalize_social_image_module(module)
    try:
        img = generate_image(text, category, ref_str, lang, platform, module)
    except Exception as e:
        print(e)
        return make_module_fallback_img_http_response(lang, platform, module)

    return make_png_http_response(img)
