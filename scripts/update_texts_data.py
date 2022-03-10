# -*- coding: utf-8 -*-
import django
django.setup()

import csv
import requests
from io import StringIO

from sefaria.model import *
from sefaria.system.database import db


"""
0  Primary English Title
1  Author
2  English Description
3  Hebrew Description
4  English Short Description 
5  Hebrew Short Description
6  Composition Year (loazi)
7  Composition Year Margin of Error (+/- years)
8  Place composed
9  Year of first publication
10 Place of first publication
11 Era
"""
eras = {
    "Gaonim": "GN",
    "Rishonim": "RI",
    "Achronim": "AH",
    "Tannaim": "T",
    "Amoraim": "A",
    "Contemporary": "CO"
}

url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSx60DLNs8Dp0l2xpsPjrxD3dBpIKASXSBiE-zjq74SvUIc-hD-mHwCxsuJpQYNVHIh7FDBwx7Pp9zR/pub?gid=480609494&single=true&output=csv'
response = requests.get(url)
data = response.content.decode("utf-8")
cr = csv.reader(StringIO(data))


rows = list(cr)[2:]
indexes_handled = [row[0] for row in rows]

unhandled = set([i.primary_title() for i in library.get_index_forest()]) - set(indexes_handled)
if len(unhandled) > 0:
    print("Indexes not covered in the sheet:")
    for a in sorted(unhandled):
        print(a)
    print("\n******************\n")

for l in rows:
    needs_save = False
    try:
        i = library.get_index(l[0].strip())
    except Exception as e:
        print("Count not load {}. {}".format(l[0], e))
        continue
    try:
        current_authors = set(getattr(i, "authors", []) or [])
    except TypeError:
        current_authors = set()
    sheet_authors = set([a.strip() for a in l[1].split(",") if AuthorTopic.is_author(a.strip())])
    if sheet_authors != current_authors:
        setattr(i, "authors", list(sheet_authors))
        needs_save = True
    attrs = [("enDesc", l[2]),
        ("heDesc", l[3]),
        ("enShortDesc", l[4]),
        ("heShortDesc", l[5]),
        ("compDate", l[6]),
        ("errorMargin", l[7]),
        ("compPlace", l[8]), #composition place
        ("pubDate", l[9]),
        ("pubPlace", l[10]), # publication place
        ("era", eras.get(l[11]))]

    for aname, value in attrs:
        obj_val = getattr(i, aname, "")
        if (obj_val or value) and (obj_val != value):
            setattr(i, aname, value)
            needs_save = True
    if needs_save:
        print("o - {}".format(l[0]))
        i.save(override_dependencies=True)