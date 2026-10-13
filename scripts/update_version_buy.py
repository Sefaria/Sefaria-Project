import django

django.setup()

import argparse
import csv
import re

from sefaria.google_storage_manager import GoogleStorageManager
from sefaria.helper.file import scrape_image, thumbnail_image_file
from sefaria.model import *
from sefaria.system.cache import cache_get_key

VERSION_IMAGE_BUCKET = "sefaria-physical-editions"


def process_versions_sheet(incremental=False, process_images=True):
    with open("data/Versions_OCLC_BuyLinks.csv") as inputfile:
        cin = csv.DictReader(inputfile)
        counter_urls = 0
        counter_images = 0
        for row in cin:
            version_index_title = row["title"]
            version_title = row["versionTitle"]
            version_lang = row["language"]
            version_buy_link = row.get("purchaseInformationURL", None)
            external_image_url = row.get("image url", None)
            image_update = not incremental or bool(row.get("update image", False))
            version_obj = Version().load(
                {"title": version_index_title, "versionTitle": version_title, "language": version_lang},
            )

            if version_obj:
                print(f"Version loaded: [{version_index_title}] [{version_title}] ({version_lang})")
                if version_buy_link:
                    old_buy_link = getattr(version_obj, "purchaseInformationURL", None)
                    if version_buy_link not in [None, ""] and version_buy_link != old_buy_link:
                        version_obj.purchaseInformationURL = version_buy_link
                        counter_urls += 1
                        version_obj.save(override_dependencies=True)
                        print(f"     -Adding buy url for [{version_index_title}] [{version_title}]")
                if process_images and image_update and external_image_url:
                    try:
                        print("Downloading: {}".format(external_image_url.encode("utf-8")))
                        image = scrape_image(external_image_url)
                    except Exception as e:
                        print(f"      -Error: getting image for [{version_index_title}] [{version_title}]: ({e})")
                        continue
                    try:
                        resized_image_file = thumbnail_image_file(image, (400, 400))
                    except Exception as e:
                        print(f"      -Error: processing image for [{version_index_title}] [{version_title}]: ({e})")
                        continue

                    version_image_file = f"{cache_get_key([version_index_title, version_title, version_lang])}.png"
                    version_image_url = GoogleStorageManager.upload_file(
                        resized_image_file,
                        version_image_file,
                        VERSION_IMAGE_BUCKET,
                    )
                    try:
                        old_version_image_filename = (
                            re.findall(r"/([^/]+)$", version_obj.purchaseInformationImage)[0]
                            if version_obj.purchaseInformationImage.startswith(GoogleStorageManager.BASE_URL)
                            else None
                        )
                        if old_version_image_filename is not None and old_version_image_filename != version_image_file:
                            GoogleStorageManager.delete_filename(old_version_image_filename, VERSION_IMAGE_BUCKET)
                    except AttributeError:
                        pass
                    version_obj.purchaseInformationImage = version_image_url
                    version_obj.save(override_dependencies=True)
                    counter_images += 1
                    print(
                        f"     -scraped and uploaded version image file for [{version_index_title}] [{version_title}]",
                    )

                elif image_update and external_image_url:  # image was already processed and uploaded
                    version_image_file = f"{cache_get_key([version_index_title, version_title, version_lang])}.png"
                    if GoogleStorageManager.file_exists(version_image_file, VERSION_IMAGE_BUCKET):
                        version_obj.purchaseInformationImage = GoogleStorageManager.get_url(
                            version_image_file,
                            VERSION_IMAGE_BUCKET,
                        )
                        version_obj.save(override_dependencies=True)
                        counter_images += 1
                        print(f"     -just saving image url on object for [{version_index_title}] [{version_title}]")
            else:
                print(f"No version found for [{version_index_title}] [{version_title}]")

        print(f"Processed {counter_images} images and {counter_urls} urls")


if __name__ == "__main__":
    argparser = argparse.ArgumentParser()
    argparser.add_argument(
        "-u",
        "--incremental",
        action="store_true",
        help="Pass this flag to link the text. Requires a user id to run",
    )
    argparser.add_argument(
        "-i",
        "--process_images",
        action="store_true",
        help="Run the tests without making any changes",
    )

    arguments = argparser.parse_args()
    print(arguments)
    process_versions_sheet(arguments.incremental, arguments.process_images)
