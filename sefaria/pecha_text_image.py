from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import textwrap
import os

IMAGE_PATH = './images'
FONT_PATHS = {
    'Uchen1': 'static/fonts/wujin+gangbi.ttf',
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

    def save_image(self, text, ref_str, img_file_name, logo_path=None):
        font_file_name = FONT_PATHS.get(self.font_type, 'Uchen')
        
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
            
        main_font = ImageFont.truetype(font_file_name, size=main_size, encoding='utf-16')
        ref_font = ImageFont.truetype(font_file_name, size=int(main_size/2), encoding='utf-16')
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
    """Remove HTML break tags and clean up the text"""
    # Replace </br> with space or newline depending on your preference
    cleaned_text = text.replace('</br>', ' ').replace('<br>', ' ').replace('<br/>', ' ')
    # Remove multiple spaces that might have been created
    cleaned_text = ' '.join(cleaned_text.split())
    return cleaned_text


def create_synthetic_data(text, ref_str, logo_path=None):
    cleaned_text = clean_text(text)
    synthetic_image_generator = SyntheticImageGenerator(
        image_width=700,
        image_height=400,
        font_size=30,
        font_type="Uchen1",
        bg_color="#ac1c22"
    )
    synthetic_image_generator.save_image(cleaned_text, ref_str, "output.png", logo_path)
        

if __name__ == "__main__":
    text = os.environ.get('PECHA_TEXT', "Default text")
    ref_str = os.environ.get('PECHA_REF', "Default ref")
    create_synthetic_data(text, ref_str, logo_path="static/img/pecha-icon.png")