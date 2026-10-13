#!/usr/bin/python2.6

import csv
import os
import sys

import sefaria.model.text as txt

path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, path)
sys.path.insert(0, path + "/sefaria")


indexes = txt.IndexSet()

with open("../tmp/text_map.csv", "wb") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(
        [
            "Priority",
            "Section",
            "English Title",
            "Hebrew Title",
            "Transliterated Title",
            "Title Variants",
            "Categories",
            "Text Structure",
            "Ready for Upload?",
            "Length",
        ],
    )
    for i in indexes:
        order = getattr(i, "order", [])
        sectionNames = getattr(i, "sectionNames", [])
        section = ".".join([str(x) for x in order])
        title = i.title
        heTitle = getattr(i, "heTitle", "")
        titleVariants = ", ".join(i.titleVariants)
        categories = ", ".join(i.categories)
        textStructure = ", ".join(sectionNames)
        length = str(getattr(i, "length", ""))

        row = [
            "",
            section,
            title,
            heTitle,
            "",
            titleVariants,
            categories,
            textStructure,
            "",
            length,
        ]
        row = [x.encode("utf-8") for x in row]

        writer.writerow(row)
