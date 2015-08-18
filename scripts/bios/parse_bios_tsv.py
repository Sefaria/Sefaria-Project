# -*- coding: utf-8 -*-

from sefaria.model import *
import csv
import re


"""
0 'Primary English Name'
1 'Secondary English Names'
2 'Primary Hebrew Name'
3 'Secondary Hebrew Names'
4 'Birth Year '
5 'Birth Place'
6 'Birth lat/lon'
7 'Death Year'
8 'Death Place'
9 'Death lat/lon'
10'Halachic Era'
11'English Biography'
12'Hebrew Biography'
13'English Wikipedia Link'
14'Hebrew Wikipedia Link'
15'Jewish Encyclopedia Link'
16'Brill Online Reference Words (Encyclopedia of Jewish in the Islamic Encyclopedia of the Hebrew Language Encyclopedia of Judaism)'
...
25'Sex'
"""

eras = {
    "Gaonim": "GN",
    "Rishonim": "RI",
    "Achronim": "AH",
    "Contemporary": "CO"
}

for foo, symbol in eras.iteritems():
    PersonSet({"era": symbol}).delete()

def _(p, attr, field):
    if field:
        setattr(p, attr, field)

with open("Torah Commentators - Bios - People.tsv") as tsv:
    next(tsv)
    next(tsv)
    next(tsv)
    for l in csv.reader(tsv, dialect="excel-tab"):
        key = l[0].encode('ascii', errors='ignore')
        p = Person().load({"key": key}) or Person()
        p.key = key
        p.name_group.add_title(l[0], "en", primary=True, replace_primary=True)
        p.name_group.add_title(l[2], "he", primary=True, replace_primary=True)
        for x in l[1].split(","):
            p.name_group.add_title(x, "en")
        for x in l[3].split(","):
            p.name_group.add_title(x, "he")
        if len(l[4]) > 0:
            if "c" in l[4]:
                p.birthYearIsApprox = True
            else:
                p.birthYearIsApprox = False
            m = re.search(r"\d+", l[4])
            if m:
                p.birthYear = m.group(0)
        if len(l[7]) > 0:
            if "c" in l[7]:
                p.deathYearIsApprox = True
            else:
                p.deathYearIsApprox = False
            m = re.search(r"\d+", l[7])
            if m:
                p.deathYear = m.group(0)
        _(p, "birthPlace", l[5])
        _(p, "birthPlaceGeo", l[6]) # check format
        _(p, "deathPlace", l[8])
        _(p, "deathPlaceGeo", l[9])
        _(p, "era", eras.get(l[10]))
        _(p, "enBio", l[11])
        _(p, "heBio", l[12])
        _(p, "enWikiLink", l[13])
        _(p, "heWikiLink", l[14])
        _(p, "jeLink", l[15])
        _(p, "sex", l[25])
        p.save()

    #Second Pass
    rowmap = {
        17: 'child',
        18: 'grandchild',
        19: 'childinlaw',
        20: 'student',
        21: 'member',
        22: 'correspondent',
        23: 'opposed',
        24: 'cousin',
    }

    tsv.seek(0)
    next(tsv)
    next(tsv)
    next(tsv)
    for l in csv.reader(tsv, dialect="excel-tab"):
        key = l[0].encode('ascii', errors='ignore')
        p = Person().load({"key": key})
        for i, type in rowmap.items():
            if l[i]:
                for pkey in l[i].split(","):
                    pkey = pkey.strip().encode('ascii', errors='ignore')
                    if Person().load({"key": pkey}):
                        pr = PersonRelationship({
                            "type": type,
                            "from_key": key,
                            "to_key": pkey
                        })
                        pr.save()

