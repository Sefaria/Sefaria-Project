from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

IMAGE_PATH = './images'
FONT_PATHS = {
    'Uchen1': 'static/fonts/wujin+gangbi.ttf',
}

class SyntheticImageGenerator:

    def __init__(self, image_width, image_height, font_size=24, font_type="Uchen") -> None:
        self.image_width = int(image_width)
        self.image_height = int(image_height)
        self.font_size = int(font_size)
        self.font_type = font_type


    def save_image(self, text, img_file_name):
        font_file_name = FONT_PATHS.get(self.font_type, 'Uchen')
        img = Image.new('RGB', (self.image_width,self.image_height), color = (255, 255, 255))
        d = ImageDraw.Draw(img)

        # Define font and text color
        if len(text)<100:
            size = int(self.font_size*1.5)
        else:
            size = self.font_size
            
        font = ImageFont.truetype(font_file_name, size=size, encoding='utf-16')
        text_color = (0,0,0)

        # Write text on image
        
        d.text((40,20), text, fill=text_color,spacing=12, font=font)

        # Save the image
        img.save(img_file_name)


def create_synthetic_data(text):
    synthetic_image_generator = SyntheticImageGenerator(
    image_width=2000,
    image_height=100,
    font_size=30,
    font_type="Uchen1"
    )
    synthetic_image_generator.save_image(text, "output.png")
        

if __name__ == "__main__":
    text = "བྱང་ཆུབ་སེམས་དཔའི་སྤྱོད་པ་ལ་འཇུག་པའི་ཤེས་རབ་ལེའུ་དང་བསྔོ་བའི་དཀའ་འགྲེལ་བཞུགས།"
    create_synthetic_data(text)
    