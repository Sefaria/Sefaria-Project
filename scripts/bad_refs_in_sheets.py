# -*- coding: utf-8 -*-
import django
django.setup()

import re

from sefaria.model import *
from sefaria.system.database import db

sheets = db.sheets.find()
bad_refs   = 0
bad_sheets = set([])

bad_book_count = {}

for sheet in sheets:
    for ref in sheet["sources"]:
        if "ref" in ref:
            try:
                Ref(ref["ref"])
            except:
                bad_refs += 1
                book_title = ref["ref"].split(',')[0]
                book_title = re.split('\d+', book_title)[0]
                bad_book_count[book_title] = bad_book_count.get(book_title, 0) + 1
                bad_sheets.add(sheet["id"])
                print(book_title)
                print("%s --- bad ref in sheet %d" % (ref["ref"], sheet["id"]))

print("***")
print(bad_book_count)
print("%d bad refs in %d sheets" % (bad_refs, len(bad_sheets)))
