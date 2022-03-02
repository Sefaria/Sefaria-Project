from PIL import Image, ImageDraw, ImageFont
import textwrap
from bidi.algorithm import get_display
import re
from django.http import HttpResponse
import io

palette = {
    "Commentary": (75, 113, 183),
    "Tanakh": (0, 78, 95),
    "Midrash":    (93, 149, 111),
    "Mishnah": (90, 153, 183),
    "Talmud":    (204, 180, 121),
    "Halakhah":    (128, 47, 62),
    "Kabbalah":    (89, 65, 118),
    "Jewish Thought": (127, 133, 169),
    "Liturgy":    (171, 78, 102),
    "Tosefta":    (0, 130, 127),
    "Chasidut":    (151, 179, 134),
    "Musar":    (124, 65, 111),
    "Responsa":    (203, 97, 88),
    "Quoting Commentary": (203, 97, 88),
    "Sheets":    (24, 52, 93),
    "Sheet":    (24, 52, 93),
    "Targum":    (59, 88, 73),
    "Modern Commentary":    (184, 212, 211),
    "Reference":    (212, 137, 108),
    "System":    (24, 52, 93)
}

def smart_truncate(content, length=180, suffix='...'):
    if len(content) <= length:
        return content
    else:
        return ' '.join(content[:length+1].split(' ')[0:-1]) + suffix

def calc_letters_per_line(text, font, img_width):
    uniq_chars_in_text = list(set(text))
    avg_char_width = sum(font.getsize(char)[0] for char in uniq_chars_in_text) / len(uniq_chars_in_text)
    max_char_count = int( (img_width * 1) / avg_char_width )
    return max_char_count

def cleanup_and_format_text(text, language):
    #removes html tags, nikkudot and taamim.
    text = text.replace('<br>', ' ')
    cleanr = re.compile('<.*?>')
    text = re.sub(cleanr, '', text)
    text = text.replace("—", "-")
    text = text.replace(u"\u05BE", " ")  #replace hebrew dash with ascii

    strip_cantillation_vowel_regex = re.compile("[^\u05d0-\u05f4\s^\x00-\x7F\x80-\xFF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u2000-\u206f]")
    text = strip_cantillation_vowel_regex.sub('', text)
    text = smart_truncate(text)
    return text


def generate_image(text="", category="System", lang="he"):
    text_color = '#ffffff'
    font = ImageFont.truetype(font='static/fonts/Amiri-Taamey-Frank-merged.ttf', size=42)
    width = 800
    height = 400
    padding = int(width * .1)
    img = Image.new('RGBA', (width, height), color=palette[category])


    if lang == "en":
        align = "left"
        watermark_url = "static/img/logo-white.png"

    else:
        align = "right"
        watermark_url = "static/img/logo-hebrew-white.png"

    text = cleanup_and_format_text(text, lang)
    text = textwrap.fill(text=text, width= calc_letters_per_line(text, font, int(img.size[0]-padding)))
    text = get_display(text) # Applies BIDI algorithm to text so that letters aren't reversed in PIL.

    draw = ImageDraw.Draw(im=img)
    draw.text(xy=(img.size[0] / 2, img.size[1] / 2), text=text, font=font, align=align, fill=text_color, anchor='mm')

    watermark = Image.open(watermark_url)
    watermark.thumbnail((100,100))
    watermark_padded = Image.new('RGBA', (width, height))
    watermark_pos = int(img.size[0]-(padding/2) - watermark.size[0]) if lang == "en" else int(padding/2)
    watermark_padded.paste(watermark, (watermark_pos, int(height-padding/2)))

    img = Image.alpha_composite(img, watermark_padded)

    buf = io.BytesIO()
    img.save(buf, format='png')
    return(buf.getvalue())

def make_img_http_response(text, category, lang):
    img = generate_image(text, category, lang)
    res = HttpResponse(img, content_type="image/png")
    return res