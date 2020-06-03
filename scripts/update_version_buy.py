# -*- coding: utf-8 -*-
import django
django.setup()

import csv
import re
import hashlib


from sefaria.model import *
from sefaria.helper.file import get_resized_file, scrape_image
from sefaria.google_storage_manager import GoogleStorageManager
from sefaria.system.cache import cache_get_key

VERSION_IMAGE_BUCKET = "sefaria-physical-editions"

with open("data/Versions_OCLC_BuyLinks.csv", 'r') as inputfile:
    cin = csv.DictReader(inputfile)
    for row in cin:
        version_index_title = row["title"]
        version_title = row["versionTitle"]
        version_lang = row["language"]
        version_buy_link = row.get("purchaseInformationURL", None)
        external_image_url = row.get("image url", None)

        version_obj = Version.load({"title": version_index_title, "versionTile": version_title, "language": version_lang})
        if version_obj:
            if version_buy_link:
                version_obj["purchaseInformationURL"] = version_buy_link
            if external_image_url:
                version_image_file_old = None
                if version_obj.get("purchaseInformationImage", None):
                    version_image_file_old = re.findall(r"/([^/]+)$", version_obj.purchaseInformationImage)[0] if version_obj.purchaseInformationImage.startswith(GoogleStorageManager.BASE_URL) else None
                image = scrape_image(external_image_url)
                resized_image_file = get_resized_file(image, (400, 400), format="JPG")
                version_image_file = cache_get_key([version_index_title, version_title, version_lang])
                version_image_url = GoogleStorageManager.upload_file(resized_image_file, version_image_file, VERSION_IMAGE_BUCKET, version_image_file_old)
                version_obj.purchaseInformationImage = version_image_url

            version_obj.save(override_dependencies=True)

        else:
            print("No version found for {} {}".format(version_index_title, version_title))
