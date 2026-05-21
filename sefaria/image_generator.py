from PIL import Image, ImageDraw, ImageFont, features
import textwrap
from bidi.algorithm import get_display
import re
from django.http import HttpResponse
import io
from bs4 import BeautifulSoup
from sefaria.constants.model import LIBRARY_MODULE, VOICES_MODULE

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


def get_category_colors(category):
    if category in palette:
        return palette[category]
    category = category if isinstance(category, str) else ""
    index = sum(ord(char) for char in category) % len(fallback_palette_colors)
    return [fallback_palette_colors[index], (255, 255, 255)]


def normalize_social_image_module(module):
    return module if module in SUPPORTED_SOCIAL_IMAGE_MODULES else LIBRARY_MODULE


def social_image_logo_path(module=LIBRARY_MODULE, lang="en", variant="header"):
    module = normalize_social_image_module(module)
    lang = "he" if lang == "he" else "en"
    return SOCIAL_IMAGE_LOGOS[module][lang][variant]


def social_image_fallback_bg_color(module=LIBRARY_MODULE):
    module = normalize_social_image_module(module)
    return SOCIAL_IMAGE_FALLBACK_BG_COLORS[module]


def open_social_image_logo(path):
    # Logo assets may be paletted PNGs. Convert before resizing so antialiased
    # transparent edges stay smooth when composited onto the generated image.
    return Image.open(path).convert("RGBA")

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

def smart_truncate(content, length=180, suffix='...'):
    if len(content) <= length:
        return content
    else:
        return ' '.join(content[:length+1].split(' ')[0:-1]) + suffix

def get_text_width(text, font):
    if hasattr(font, "getlength"):
        return font.getlength(text)
    if hasattr(font, "getbbox"):
        left, _, right, _ = font.getbbox(text)
        return right - left
    return font.getsize(text)[0]


def calc_letters_per_line(text, font, img_width):
    if not text:
        return 1
    avg_char_width = sum(get_text_width(char, font) for char in text) / len(text)
    if avg_char_width <= 0:
        return len(text)
    max_char_count = int(img_width / avg_char_width)
    return max(1, max_char_count)


def wrap_text_preserving_linebreaks(text, width):
    # HTML cleanup turns <br> and block boundaries into "\n". Wrap each line
    # independently so those intentional breaks survive textwrap's whitespace handling.
    return "\n".join(
        textwrap.fill(text=line, width=width, replace_whitespace=False)
        for line in text.split("\n")
    )


def supports_rtl_text_layout():
    return features.check("raqm")


def prepare_text_for_drawing(text, lang):
    if lang == "en" or supports_rtl_text_layout():
        return text
    return get_display(text)


def get_text_direction(lang):
    if lang != "en" and supports_rtl_text_layout():
        return "rtl"
    return None


def html_to_text_canonical(html):
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

def cleanup_and_format_text(text, language):
    # Removes HTML tags/entities according to canonical web copy behavior,
    # then removes nikkudot and taamim.
    text = html_to_text_canonical(text)
    text = text.replace("—", "-")
    text = text.replace(u"\u05BE", " ")  #replace hebrew dash with ascii

    strip_cantillation_vowel_regex = re.compile("[^\u05d0-\u05f4\\s^\x00-\x7F\x80-\xFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2000-\u206f]")
    text = strip_cantillation_vowel_regex.sub('', text)
    text = smart_truncate(text)
    return text


def generate_image(text="", category="System", ref_str="", lang="he", platform="twitter", module=LIBRARY_MODULE):
    bg_color, text_color = get_category_colors(category)
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


    #category line
    draw.line(cat_border_pos, fill=bg_color, width=int(width*.02))

    #header white
    draw.line((0, int(height*.05), img.size[0], int(height*.05)), fill=(255, 255, 255), width=int(height*.1))
    draw.line((0, int(height*.1), img.size[0], int(height*.1)), fill="#CCCCCC", width=int(height*.0025))

    #write ref
    ref_text = prepare_text_for_drawing(ref_str.upper(), lang)
    draw.text(xy=(img.size[0] / 2, img.size[1]-padding_y/2), text=ref_text, font=ref_font, spacing=spacing, align=align, fill=text_color, anchor='mm', direction=direction)


    #border
    draw.line((0, 0, width, 0), fill="#666666", width=1)
    draw.line((0, 0, 0, height), fill="#666666", width=1)
    draw.line((width-1, 0, width-1, height), fill="#666666", width=1)
    draw.line((0, height-1, width, height-1), fill="#666666", width=1)


    #add sefaria logo
    logo = open_social_image_logo(logo_url)
    logo.thumbnail((width, int(height*.06)), Image.LANCZOS)
    logo_padded = Image.new('RGBA', (width, height))
    logo_padded.paste(logo, (int(width/2-logo.size[0]/2), int(height*.05-logo.size[1]/2)))

    img = Image.alpha_composite(img, logo_padded)


    return(img)

def make_img_http_response(text, category, ref_str, lang, platform, module=LIBRARY_MODULE):
    module = normalize_social_image_module(module)
    try:
        img = generate_image(text, category, ref_str, lang, platform, module)
    except Exception as e:
        print(e)
        height = platforms[platform]["height"]
        width = platforms[platform]["width"]
        img = Image.new('RGBA', (width, height), color=social_image_fallback_bg_color(module))
        logo = open_social_image_logo(social_image_logo_path(module, lang, "fallback"))
        logo.thumbnail((400, 400), Image.LANCZOS)
        logo_padded = Image.new('RGBA', (width, height))
        logo_padded.paste(logo, (int(width/2-logo.size[0]/2), int(height/2-logo.size[1]/2)))
        img = Image.alpha_composite(img, logo_padded)

    buf = io.BytesIO()
    img.save(buf, format='png')

    res = HttpResponse(buf.getvalue(), content_type="image/png")
    return res
