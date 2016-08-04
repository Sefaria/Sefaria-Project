# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.system.database import db
import unicodecsv as csv

# clear out all earlier author data:
"""
db.index.update({}, {"$unset": {
    "authors": 1,
    "enDesc: 1": 1,
    "heDesc": 1,
    "pubDate": 1,
    "compDate": 1,
    "compPlace": 1,
    "pubPlace": 1,
    "errorMargin": 1,
    "era": 1,
}}, multi=True)
"""

"""
0  Primary English Title
1  Author
2  English Description
3  Hebrew Description
4  Composition Year (loazi)
5  Composition Year Margin of Error (+/- years)
6  Place composed
7  Year of first publication
8  Place of first publication
X 9  Geocode of first pub
9 Era
"""
eras = {
    "Gaonim": "GN",
    "Rishonim": "RI",
    "Achronim": "AH",
    "Tannaim": "T",
    "Amoraim": "A",
    "Contemporary": "CO"
}


with open("Torah Commentators - Bios - Works.tsv") as tsv:
    indexes_handled = []
    next(tsv)
    next(tsv)
    next(tsv)
    for l in csv.reader(tsv, dialect="excel-tab"):
        indexes_handled.append(l[0])
    unhandled = set([i.primary_title() for i in library.get_index_forest(True)]) - set(indexes_handled)
    if len(unhandled) > 0:
        print "Indexes not covered in the sheet:"
        for a in sorted(unhandled):
            print a

    tsv.seek(0)
    next(tsv)
    next(tsv)
    next(tsv)
    for l in csv.reader(tsv, dialect="excel-tab"):
        try:
            i = library.get_index(l[0])
        except Exception as e:
            print u"Count not load {}. {}".format(l[0], e)
            continue
        current_authors = set(getattr(i, "authors", []) or [])
        sheet_authors = set([a.strip() for a in l[1].split(",") if Person().load({"key": a.strip()})])
        needs_save = current_authors != sheet_authors
        sheet_authors = list(sheet_authors)
        if i.is_commentary():
            #todo: Do we handle extended info for commentaries?
            if needs_save:
                try:
                    c = i.c_index
                except Exception as e:
                    print u"Failed to get commentary index for {}. {}".format(l[0], e)
                    continue
                setattr(c, "authors", sheet_authors)
                print "= - {}".format(l[0])
                c.save()
            else:
                print "-"
            continue

        setattr(i, "authors", sheet_authors)
        attrs = [("enDesc", l[2]),
            ("heDesc", l[3]),
            ("compDate", l[4]),
            ("errorMargin", l[5]),
            ("compPlace", l[6]), #composition place
            ("pubDate", l[7]),
            ("pubPlace", l[8]), # publication place
            ("era", eras.get(l[9]))]

        for aname, value in attrs:
            obj_val = getattr(i, aname, None)
            if (obj_val or value) and (getattr(i, aname, None) != value):
                setattr(i, aname, value)
                needs_save = True
        if needs_save:
            print "o - {}".format(l[0])
            i.save()
        else:
            print "."
