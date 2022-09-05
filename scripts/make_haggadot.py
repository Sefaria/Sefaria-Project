# -*- coding: utf-8 -*-
"""
Creates Haggadah source sheets. 
"""
from sefaria.profiling import prof
from sefaria.sheets import db, make_sheet_from_text

commentaries = [
    "Ephod Bad",
    "Kimcha Davshuna",
    "Kos Shel Eliyahu",
    "Maarechet Heidenheim",
    "Maaseh Nissim",
    "Marbeh Lisaper",
    "Naftali Seva Ratzon",
    "Yismach Yisrael",
]

db.sheets.remove({"generatedBy": "Haggadah Maker"})

make_sheet_from_text("Pesach Haggadah", generatedBy="Haggadah Maker")
for commentary in commentaries:
    prof('make_sheet_from_text("Pesach Haggadah", sources=["%s on Pesach Haggadah"], generatedBy="Haggadah Maker")' % commentary)
    #make_sheet_from_text("Pesach Haggadah", sources=["%s on Pesach Haggadah" % commentary], generatedBy="Haggadah Maker")