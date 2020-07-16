# -*- coding: utf-8 -*-
import django
django.setup()

import csv
import re


from sefaria.model import *

with open("data/tmp/Versions_OCLC_BuyLinks - Versions_OCLC_BuyLinks.csv", 'r') as inputfile:
    cin = csv.DictReader(inputfile)
    titles_by_oclc = {}
    for row in cin:
        try:
            version_index_title = row["title"]
            version_title = row["versionTitle"]
            version_lang = row["language"]
            updated_version_source = row.get("updated_version_source", None)
            oclc_number = row.get("OCLC_number", None)
            version_obj = Version().load({"title": version_index_title, "versionTitle": version_title, "language": version_lang})


            if version_obj:
                if updated_version_source:
                    version_obj.versionSource = updated_version_source
                if oclc_number:
                    titles_by_oclc.setdefault(oclc_number,[]).append({"title": version_index_title, "versionTitle": version_title, "language": version_lang})
                    version_obj.oclcNumber = oclc_number

                version_obj.save(override_dependencies=True)

            else:
                print("No version found for {} {}".format(version_index_title, version_title))
        except (KeyboardInterrupt, SystemExit):
            raise
        except:
            print("Error at: {} {}".format(version_index_title, version_title))

    toc_tree = library.get_toc_tree().flatten()
    for oclc_num in titles_by_oclc:
        if len(titles_by_oclc[oclc_num]) > 1:
            titles = sorted(titles_by_oclc[oclc_num],key=lambda x:toc_tree.index(x['title']))
            for index, title in enumerate(titles):
                version_obj = Version().load({"title": title["title"], "versionTitle": title["versionTitle"], "language": title["language"]})
                version_obj.oclcSortOrder = index
                version_obj.save(override_dependencies=True)
