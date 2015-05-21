# -*- coding: utf-8 -*-
"""
Remove all links to Berakhot
Remove text of 
"""
import sys
import os
import csv
from pprint import pprint

p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"

from sefaria.system.database import db


keepers = []
titles = db.index.find({"categories.1": {"$in": ["Torah", "Writings", "Prophets"]}}).distinct("title")
titles += ["Rashi on Berakhot", "Tosafot on Berakhot"]
titles = tuple(titles)

links = db.links.find({"refs": {"$regex": "^Berakhot "}})
for link in links:
    ref1, ref2 = link["refs"]
    if not ref1.startswith(titles) and not ref2.startswith(titles):
        if ref2.find(":") > -1:
            keepers.append((link["refs"][0], link["refs"][1], link["type"], link.get("anchorText", "")))
            db.links.remove(link)
    else:
        db.links.remove(link)

with open("../tmp/berakhot_review_links.csv", 'wb') as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(["Ref 1", "Ref 2", "Type", "Anchort Text"])
    for line in keepers:
        writer.writerow(line)


db.texts.remove({"title": "Rashi on Berakhot"})
db.texts.remove({"title": "Tosafot on Berakhot"})