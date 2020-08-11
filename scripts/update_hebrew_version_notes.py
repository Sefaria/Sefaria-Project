# -*- coding: utf-8 -*-
import django
django.setup()

import csv
import re
import hashlib
import argparse



from sefaria.model import *
from sefaria.helper.file import scrape_image, thumbnail_image_file
from sefaria.google_storage_manager import GoogleStorageManager
from sefaria.system.cache import cache_get_key

VERSION_IMAGE_BUCKET = "sefaria-physical-editions"


def process_versions_sheet():
    with open("data/versionNotes.csv", 'r') as inputfile:
        cin = csv.DictReader(inputfile)
        for row in cin:
            version_index_title = row["title"]
            version_title = row["versionTitle"]
            version_lang = row["language"]
            versionNotes = row.get("versionNotes", None)
            versionNotesInHebrew = row.get("heVersionNotes", None)
            versionTitleInHebrew = row.get("versionTitleInHebrew", None)
            versionSource = row.get("versionSource", None)

            version_obj = Version().load({"title": version_index_title, "versionTitle": version_title, "language": version_lang})

            if version_obj:
                print("Version loaded: [{}] [{}] ({})".format(version_index_title, version_title, version_lang))
                ex_versionNotes = getattr(version_obj, "versionNotes", None)
                ex_versionNotesInHebrew = getattr(version_obj, "versionNotesInHebrew", None)
                ex_versionTitleInHebrew = getattr(version_obj, "versionTitleInHebrew", None)
                ex_versionSource = getattr(version_obj, "versionSource", None)
                if versionNotes != ex_versionNotes:
                    setattr(version_obj, "versionNotes", versionNotes)
                if versionNotesInHebrew != ex_versionNotesInHebrew:
                    setattr(version_obj, "versionNotesInHebrew", versionNotesInHebrew)
                if versionTitleInHebrew != ex_versionTitleInHebrew:
                    setattr(version_obj, "versionTitleInHebrew", versionTitleInHebrew)
                if versionSource != ex_versionSource:
                    setattr(version_obj, "versionSource", versionSource)
                version_obj.save(override_dependencies=True)

            else:
                print("No version found for [{}] [{}]".format(version_index_title, version_title))


if __name__ == '__main__':

    process_versions_sheet()

