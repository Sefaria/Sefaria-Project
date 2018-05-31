# -*- coding: utf-8 -*-
"""
Creates Haggadah source sheets with all earlier texts.
"""
from sefaria.model import *
from sefaria.sheets import db, make_sheet_from_text
from sefaria.profiling import prof


categories = [
    "Talmud",
    "Midrash",
    "Mishnah",
    "Tosefta"
]

titles = []
for c in categories:
    titles += library.get_indexes_in_category(c)

db.sheets.remove({"generatedBy": "Roots Haggadah Maker"})
make_sheet_from_text("Pesach Haggadah", sources = titles, uid=28, generatedBy="Roots Haggadah Maker", title="Haggadah with Roots")
