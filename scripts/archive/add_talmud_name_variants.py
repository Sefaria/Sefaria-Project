# -*- coding: utf-8 -*-
#!/usr/bin/python2.6

import sys
import os
import pymongo
p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
from sefaria.settings import *

connection = pymongo.Connection()
db = connection[SEFARIA_DB]
db.authenticate(SEFARIA_DB_USER, SEFARIA_DB_PASSWORD)

talmuds = db.index.find({"categories.0": "Talmud"})

for t in talmuds:
    variant = "Talmud %s" % t["title"]
    if variant not in t["titleVariants"]:
        t["titleVariants"].append(variant)
    db.index.save(t)