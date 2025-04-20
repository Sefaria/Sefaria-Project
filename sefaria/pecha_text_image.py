from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import textwrap
import os

IMAGE_PATH = './images'
FONT_PATHS = {
    "ar": "static/fonts/Noto-font/NotoFont-ar.ttf",
    "bn": "static/fonts/Noto-font/NotoFont-bn.ttf",
    "bo": "static/fonts/wujin+gangbi.ttf",
    "de": "static/fonts/Noto-font/NotoFont-de.ttf",
    "dz": "static/fonts/Noto-font/NotoFont-dz.ttf",
    "en": "static/fonts/Noto-font/NotoFont-en.ttf",
    "es": "static/fonts/Noto-font/NotoFont-es.ttf",
    "fa": "static/fonts/Noto-font/NotoFont-fa.ttf",
    "fr": "static/fonts/Noto-font/NotoFont-fr.ttf",
    "gu": "static/fonts/Noto-font/NotoFont-gu.ttf",
    "he": "static/fonts/wujin+gangbi.ttf",
    "hi": "static/fonts/Noto-font/NotoFont-hi.ttf",
    "hy": "static/fonts/Noto-font/NotoFont-hy.ttf",
    "it": "static/fonts/Noto-font/NotoFont-it.ttf",
    "ja": "static/fonts/Noto-font/NotoFont-ja.ttf",
    "ka": "static/fonts/Noto-font/NotoFont-ka.ttf",
    "km": "static/fonts/Noto-font/NotoFont-km.ttf",
    "kn": "static/fonts/Noto-font/NotoFont-kn.ttf",
    "ko": "static/fonts/Noto-font/NotoFont-ko.ttf",
    "lo": "static/fonts/Noto-font/NotoFont-lo.ttf",
    "ml": "static/fonts/Noto-font/NotoFont-ml.ttf",
    "mn": "static/fonts/Noto-font/NotoFont-mn.ttf",
    "mr": "static/fonts/Noto-font/NotoFont-mr.ttf",
    "ms": "static/fonts/Noto-font/NotoFont-general.ttf",
    "my": "static/fonts/Noto-font/NotoFont-my.ttf",
    "ne": "static/fonts/Noto-font/NotoFont-ne.ttf",
    "pa": "static/fonts/Noto-font/NotoFont-pa.ttf",
    "pt": "static/fonts/Noto-font/NotoFont-pt.ttf",
    "ru": "static/fonts/Noto-font/NotoFont-ru.ttf",
    "sa": "static/fonts/Noto-font/NotoFont-hi.ttf",
    "si": "static/fonts/Noto-font/NotoFont-si.ttf",
    "ta": "static/fonts/Noto-font/NotoFont-ta.ttf",
    "th": "static/fonts/Noto-font/NotoFont-th.ttf",
    "te": "static/fonts/Noto-font/NotoFont-te.ttf",
    "ur": "static/fonts/Noto-font/NotoFont-ur.ttf",
    "vi": "static/fonts/Noto-font/NotoFont-general.ttf",
    "zh": "static/fonts/Noto-font/NotoFont-zh.ttf"
}


class SyntheticImageGenerator:

    def __init__(self, image_width, image_height, font_size=24, font_type="Uchen", bg_color="#ac1c22") -> None:
        self.image_width = int(image_width)
        self.image_height = int(image_height)
        self.font_size = int(font_size)
        self.font_type = font_type
        self.bg_color = tuple(int(bg_color.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
        
    def calc_letters_per_line(self, text, font, max_width):
        """Calculate approximately how many characters can fit in the given width."""
        avg_char_width = font.getlength("བ")  # Use a typical character for estimation
        return int(max_width / avg_char_width)

    def add_borders(self, draw):
        """Add borders to the image"""
        # Draw border lines
        border_color = "#666666"
        draw.line((0, 0, self.image_width, 0), fill=border_color, width=1)  # Top
        draw.line((0, 0, 0, self.image_height), fill=border_color, width=1)  # Left
        draw.line((self.image_width-1, 0, self.image_width-1, self.image_height), fill=border_color, width=1)  # Right
        draw.line((0, self.image_height-1, self.image_width, self.image_height-1), fill=border_color, width=1)  # Bottom

    def add_header(self, draw):
        """Add white header section"""
        header_height = int(self.image_height * 0.05)
        # White header background
        draw.line((0, header_height, self.image_width, header_height), 
                 fill=(255, 255, 255), 
                 width=int(self.image_height * 0.1))
        # Gray separator line
        draw.line((0, header_height * 2, self.image_width, header_height * 2), 
                 fill="#CCCCCC", 
                 width=int(self.image_height * 0.0025))

    def add_logo(self, img, logo_path):
        """Add logo to the image"""
        try:
            logo = Image.open(logo_path).convert('RGBA')
            # Calculate logo size (6% of image height)
            logo_height = int(self.image_height * 0.06)
            logo_ratio = logo.size[0] / logo.size[1]
            logo_width = int(logo_height * logo_ratio)
            logo = logo.resize((logo_width, logo_height), Image.Resampling.LANCZOS)
            
            # Create a padded transparent image for the logo
            logo_padded = Image.new('RGBA', (self.image_width, self.image_height), (0, 0, 0, 0))
            
            # Calculate position to center the logo
            logo_x = int(self.image_width/2 - logo_width/2)
            logo_y = int(self.image_height * 0.05 - logo_height/2)
            
            # Paste the logo
            logo_padded.paste(logo, (logo_x, logo_y))
            
            # Composite the images
            return Image.alpha_composite(img, logo_padded)
        except Exception as e:
            print(f"Error adding logo: {e}")
            return img

    def save_image(self, text, ref_str, lang, img_file_name, logo_path=None):
        
        font_file_name_text = FONT_PATHS.get(self.font_type, 'en')
        font_file_name_ref = FONT_PATHS.get(self.font_type, 'he') if lang == "he" else FONT_PATHS.get('en')

        
        # Create base image with RGBA mode to support transparency
        img = Image.new('RGBA', (self.image_width, self.image_height), 
                       color=self.bg_color + (255,))  # Add alpha channel
        d = ImageDraw.Draw(img)

        # Add header and borders
        self.add_header(d)
        self.add_borders(d)

        # Define fonts and text color
        if len(text) < 100:
            main_size = int(self.font_size * 1.5)
        else:
            main_size = self.font_size
            
        main_font = ImageFont.truetype(font_file_name_text, size=main_size, encoding='utf-16')
        ref_font = ImageFont.truetype(font_file_name_ref, size=int(main_size/2), encoding='utf-16')
        text_color = (255, 255, 255)

        # Calculate padding and max width
        padding_x = 5  # Padding from edges
        max_width = self.image_width - (padding_x * 2)
        
        # Wrap text using textwrap
        chars_per_line = self.calc_letters_per_line(text, main_font, max_width)
        wrapped_text = textwrap.fill(text=text, width=chars_per_line)
        
        # Draw main text
        d.text(
            xy=(self.image_width / 2, self.image_height / 2),
            text=wrapped_text,
            font=main_font,
            fill=text_color,
            anchor='mm',
            align='center',
            spacing=int(main_size * 0.5)
        )
        
        # Draw reference text
        d.text(
            xy=(self.image_width / 2, self.image_height - 40),
            text=ref_str,
            font=ref_font,
            fill=text_color,
            anchor='mm'
        )

        # Add logo if provided
        if logo_path:
            img = self.add_logo(img, logo_path)

        # Save the image
        img.save(img_file_name)


def clean_text(text):
    if len(text) > 180:
        text = text[:180] + " ..."
    """Remove HTML break tags and clean up the text"""
    # Replace </br> with space or newline depending on your preference
    cleaned_text = text.replace('</br>', ' ').replace('<br>', ' ').replace('<br/>', ' ').replace('<b', ' ').replace('</', ' ').replace('<', ' ').replace('>', ' ')
    # Remove multiple spaces that might have been created
    cleaned_text = ' '.join(cleaned_text.split())
    return cleaned_text


def create_synthetic_data(text, ref_str, lang, version_lang, logo_path=None):
    cleaned_text = clean_text(text)
    font_type_lang = lang
    if version_lang:
        font_type_lang = version_lang

    synthetic_image_generator = SyntheticImageGenerator(
        image_width=700,
        image_height=400,
        font_size=25,
        font_type=font_type_lang,
        bg_color="#ac1c22"
    )
    synthetic_image_generator.save_image(cleaned_text, ref_str, lang, "output.png", logo_path)
        

if __name__ == "__main__":
    text = os.environ.get('PECHA_TEXT', "Default text")
    ref_str = os.environ.get('PECHA_REF', "Default ref")
    version_lang = os.environ.get('PECHA_VERSION_LANG', None)
    lang = os.environ.get('PECHA_LANG', None)
    create_synthetic_data(text, ref_str, lang, version_lang, logo_path="static/img/pecha-icon.png")