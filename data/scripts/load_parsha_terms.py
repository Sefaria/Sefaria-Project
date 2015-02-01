# -*- coding: utf-8 -*-

import csv

import sefaria.model as model


cfile = "../tmp/parsha.csv"

ts = model.TermScheme()
if not ts.load({"name": "Parasha"}):
    ts.name = "Parasha"
    ts.save()

with open(cfile, 'rb') as pfile:
    parashiot = csv.reader(pfile)
    parashiot.next()
    order = 1
    for row in parashiot:
        (en, he, ref) = row
        if en == "Lech-Lecha":
            en = "Lech Lecha"
        term = model.Term()
        if term.load({"name": en}):
            order += 1
            continue
        term.name = en
        term.scheme = ts.name
        term.order = order
        term.ref = ref
        term.titles = [
            {
                "lang": "en",
                "text": en,
                "primary": True
            },
            {
                "lang": "he",
                "text": he,
                "primary": True
            }
        ]
        term.save()
        order += 1
