# -*- coding: utf-8 -*-
from PIL import Image
from io import BytesIO
import requests

import logging
logger = logging.getLogger(__name__)


def get_resized_file(image, size, format="PNG"):
    resized_image = image.resize(size, resample=Image.LANCZOS)
    resized_image_file = BytesIO()
    resized_image.save(resized_image_file, format=format)
    resized_image_file.seek(0)
    return resized_image_file

def scrape_file(url):
    r = requests.get(url, allow_redirects=True)
    return BytesIO(r.content).seek(0)

def scrape_image(url):
    return Image.open(scrape_file(url))
