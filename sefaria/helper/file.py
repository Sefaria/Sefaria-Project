# -*- coding: utf-8 -*-
from PIL import Image
from io import BytesIO
import requests

import structlog
logger = structlog.get_logger(__name__)


def get_resized_file(image, size, to_format="PNG"):
    resized_image = image.resize(size, resample=Image.LANCZOS)
    #resized_image.convert('RGB')
    resized_image_file = BytesIO()
    resized_image.save(resized_image_file, format=to_format)
    resized_image_file.seek(0)
    return resized_image_file


def thumbnail_image_file(image, size, to_format="PNG"):
    image.thumbnail(size, resample=Image.BICUBIC)
    resized_image_file = BytesIO()
    image.save(resized_image_file, format=to_format)
    resized_image_file.seek(0)
    return resized_image_file


def scrape_file(url):
    r = requests.get(url, allow_redirects=True)
    fileobj = BytesIO(r.content)
    fileobj.seek(0)
    return fileobj


def scrape_image(url):
    try:
        return Image.open(scrape_file(url))
    except Exception as e:
        raise e
