import django

django.setup()

import csv

from sefaria.model import *

VERSION_IMAGE_BUCKET = "sefaria-physical-editions"


def process_versions_sheet():
    with open("data/versionNotes.csv") as inputfile:
        cin = csv.DictReader(inputfile)
        for row in cin:
            version_index_title = row["title"]
            version_title = row["versionTitle"]
            version_lang = row["language"]
            versionNotes = row.get("versionNotes", None)
            versionNotesInHebrew = row.get("heVersionNotes", None)
            versionTitleInHebrew = row.get("versionTitleInHebrew", None)
            versionSource = row.get("versionSource", None)

            version_obj = Version().load(
                {"title": version_index_title, "versionTitle": version_title, "language": version_lang},
            )

            if version_obj:
                print(f"Version loaded: [{version_index_title}] [{version_title}] ({version_lang})")
                ex_versionNotes = getattr(version_obj, "versionNotes", None)
                ex_versionNotesInHebrew = getattr(version_obj, "versionNotesInHebrew", None)
                ex_versionTitleInHebrew = getattr(version_obj, "versionTitleInHebrew", None)
                ex_versionSource = getattr(version_obj, "versionSource", None)
                if versionNotes != ex_versionNotes:
                    version_obj.versionNotes = versionNotes
                if versionNotesInHebrew != ex_versionNotesInHebrew:
                    version_obj.versionNotesInHebrew = versionNotesInHebrew
                if versionTitleInHebrew != ex_versionTitleInHebrew:
                    version_obj.versionTitleInHebrew = versionTitleInHebrew
                if versionSource != ex_versionSource:
                    version_obj.versionSource = versionSource
                version_obj.save(override_dependencies=True)

            else:
                print(f"No version found for [{version_index_title}] [{version_title}]")


if __name__ == "__main__":
    process_versions_sheet()
