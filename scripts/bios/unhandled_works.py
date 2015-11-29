# -*- coding: utf-8 -*-

from sefaria.model import *
import csv


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