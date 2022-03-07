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

def calc_letters_per_line(text, font, img_width):
    avg_char_width = sum(font.getsize(char)[0] for char in text) / len(text)
    max_char_count = int(img_width / avg_char_width )
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


def generate_image(text="", category="System", ref_str="", lang="he", platform="twitter", colored=False):
    text_color = '#fff' if colored else '#666666'# dark-grey
    bg_color = palette[category] if colored else (251, 251, 249) # lightest-grey

    font = ImageFont.truetype(font='static/fonts/Amiri-Taamey-Frank-merged.ttf', size=platforms[platform]["font_size"])
    width = platforms[platform]["width"]
    height = platforms[platform]["height"]
    padding_x = platforms[platform]["padding"]
    padding_y = padding_x/2
    img = Image.new('RGBA', (width, height), color=bg_color)


    if lang == "en":
        align = "left"
        logo_url = f"static/img/{'logo-white' if colored else 'logo' }.png"
        spacing = 0
        ref_font = ImageFont.truetype(font='static/fonts/Roboto-Regular.ttf', size=platforms[platform]["ref_font_size"])
        cat_border_pos = (0, 0, 0, img.size[1])

    else:
        align = "right"
        logo_url = f"static/img/{'logo-hebrew-white' if colored else 'logo-hebrew' }.png"
        spacing = platforms[platform]["he_spacing"]
        ref_font = ImageFont.truetype(font='static/fonts/Heebo-Regular.ttf', size=platforms[platform]["ref_font_size"])
        cat_border_pos = (img.size[0], 0, img.size[0], img.size[1])

    text = cleanup_and_format_text(text, lang)
    text = textwrap.fill(text=text, width= calc_letters_per_line(text, font, int(img.size[0]-padding_x)))
    text = get_display(text) # Applies BIDI algorithm to text so that letters aren't reversed in PIL.

    draw = ImageDraw.Draw(im=img)
    draw.text(xy=(img.size[0] / 2, img.size[1] / 2), text=text, font=font, spacing=spacing, align=align,
              fill=text_color, anchor='mm')

    if not colored:

        #category line
        draw.line(cat_border_pos, fill=palette[category], width=int(width*.02))


        #header white
        draw.line((0, int(height*.05), img.size[0], int(height*.05)), fill=(255, 255, 255), width=int(height*.1))
        draw.line((0, int(height*.1), img.size[0], int(height*.1)), fill="#CCCCCC", width=int(height*.0025))

        #write ref
        draw.text(xy=(img.size[0] / 2, img.size[1]-padding_y/2), text=get_display(ref_str.upper()), font=ref_font, spacing=spacing, align=align, fill=text_color, anchor='mm')

        #add sefaria logo
        logo = Image.open(logo_url)
        logo.thumbnail((width, int(height*.06)))
        logo_padded = Image.new('RGBA', (width, height))
        logo_padded.paste(logo, (int(width/2-logo.size[0]/2), int(height*.05-logo.size[1]/2)))

        img = Image.alpha_composite(img, logo_padded)

    else:
        watermark = Image.open(logo_url)
        watermark.thumbnail((200, 200))
        watermark_padded = Image.new('RGBA', (width, height))
        watermark_pos = int(img.size[0]-(padding_x/2) - watermark.size[0]) if lang == "en" else int(padding_x/2)
        watermark_padded.paste(watermark, (watermark_pos, int(height-watermark.size[1]- (padding_y/4))))
        img = Image.alpha_composite(img, watermark_padded)


    buf = io.BytesIO()
    img.save(buf, format='png')
    return(buf.getvalue())

def make_img_http_response(text, category, ref_str, lang, platform, colored):
    img = generate_image(text, category, ref_str, lang, platform, colored)
    res = HttpResponse(img, content_type="image/png")
    return res