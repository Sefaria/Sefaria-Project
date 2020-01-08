# -*- coding: utf-8 -*-

# adds nodes to sources w/o nodes
# adds sources to sources w/ refs but w/o texts


import django
django.setup()

from sefaria.model import *
from sefaria.system.database import db
from sefaria.sheets import bleach_text

sheets = db.sheets.find()


for sheet in sheets:
    try:
        olddoc = sheet
        newdoc = olddoc

        newdoc["title"] = bleach_text(sheet.get("title", ""))
        db.sheets.update({'_id': olddoc["_id"]}, newdoc)

    except:
        print(sheet)

