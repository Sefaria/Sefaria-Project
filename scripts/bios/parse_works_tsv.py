# -*- coding: utf-8 -*-

from sefaria.model import *
import csv

# To clear out all earlier author data:
# db.getCollection('index').update({},{$unset:{"authors":1}},{multi:1})


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
9  Geocode of first pub
10 Era
"""
eras = {
    "Gaonim": "GN",
    "Rishonim": "RI",
    "Achronim": "AH",
    "Tannaim": "T",
    "Amoraim": "A"
}

def _(p, attr, field):
    if field:
        setattr(p, attr, field)

commentaries_handled = []

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
        if l[1] in commentaries_handled:
            continue
        try:
            i = get_index(l[0])
        except Exception as e:
            print u"Count not load {}. {}".format(l[0], e)
            continue
        aus = getattr(i, "authors", []) or []
        for a in l[1].split(","):
            a = a.strip()
            if Person().load({"key": a}) and a not in aus:
                aus.append(a)
        if i.is_commentary():
            #todo: Do we handle extended info for commentaries?
            try:
                c = i.c_index
            except Exception as e:
                print u"Failed to get commentary index for {}. {}".format(l[0],e)
                continue
            _(c, "authors", aus)
            print "-"
            c.save()
            commentaries_handled.append(l[1])
            continue
        _(i, "authors", aus)
        _(i, "enDesc", l[2])
        _(i, "heDesc", l[3])
        _(i, "compDate", l[4])
        _(i, "errorMargin", l[5])
        _(i, "compPlace", l[6]) #composition place
        _(i, "pubDate", l[7])
        _(i, "pubPlace", l[8]) # publication place
        _(i, "era", eras.get(l[10]))
        print "."
        i.save()
