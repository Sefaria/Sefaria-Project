# -*- coding: utf-8 -*-
import django
django.setup()

import re
import csv
import requests
from io import StringIO

from sefaria.system.database import db
from sefaria.model import *

"""
0 key
1 'Primary English Name'
2 'Secondary English Names'
3 'Primary Hebrew Name'
4 'Secondary Hebrew Names'
5 'Birth Year '
6 'Birth Place'
7 'Death Year'
8 'Death Place'
9 'Halachic Era'
10'English Biography'
11'Hebrew Biography'
12'English Wikipedia Link'
13'Hebrew Wikipedia Link'
14'Jewish Encyclopedia Link'
...
24 'Sex'"
"""

eras = {
    "Gaonim": "GN",
    "Rishonim": "RI",
    "Achronim": "AH",
    "Contemporary": "CO"
}

url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSx60DLNs8Dp0l2xpsPjrxD3dBpIKASXSBiE-zjq74SvUIc-hD-mHwCxsuJpQYNVHIh7FDBwx7Pp9zR/pub?gid=0&single=true&output=csv'
response = requests.get(url)
data = response.content.decode("utf-8")
cr = csv.reader(StringIO(data))
rows = list(cr)[4:]


print("*** Deleting old person records ***")
for foo, symbol in eras.items():
    people = PersonSet({"era": symbol}).distinct("key")
    db.person_rel.delete_many({"from_key": {"$in": people}})
    db.person_rel.delete_many({"to_key": {"$in": people}})
    db.person.delete_many({"era": symbol})
    # Dependencies take too long here.  Getting rid of relationship dependencies above.  Assumption is that we'll import works right after to handle those dependencies.
    #PersonSet({"era": symbol}).delete()


def _(p, attr, field):
    if field:
        setattr(p, attr, field)

print("\n*** Adding person records ***\n")
for l in rows:
    key = l[0].encode('ascii', errors='ignore').decode()
    if not key:
        continue
    print(key)
    p = Person().load({"key": key}) or Person()
    p.key = key
    p.name_group.add_title(l[1].strip(), "en", primary=True, replace_primary=True)
    p.name_group.add_title(l[3].strip(), "he", primary=True, replace_primary=True)
    for x in l[2].split(","):
        x = x.strip()
        if len(x):
            p.name_group.add_title(x, "en")
    for x in l[4].split(","):
        x = x.strip()
        if len(x):
            p.name_group.add_title(x, "he")
    if len(l[5]) > 0:
        if "c" in l[5]:
            p.birthYearIsApprox = True
        else:
            p.birthYearIsApprox = False
        m = re.search(r"\d+", l[5])
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
    _(p, "birthPlace", l[6])
    _(p, "deathPlace", l[8])
    _(p, "era", eras.get(l[9]))
    _(p, "enBio", l[10])
    _(p, "heBio", l[11])
    _(p, "enWikiLink", l[12])
    _(p, "heWikiLink", l[13])
    _(p, "jeLink", l[14])
    _(p, "sex", l[24])
    p.save()

#Second Pass
rowmap = {
    16: 'child',
    17: 'grandchild',
    18: 'childinlaw',
    19: 'student',
    20: 'member',
    21: 'correspondent',
    22: 'opposed',
    23: 'cousin',
}

print("\n*** Adding relationships ***\n")
for l in rows:
    key = l[0].encode('ascii', errors='ignore').decode()
    p = Person().load({"key": key})
    for i, type in list(rowmap.items()):
        if l[i]:
            for pkey in l[i].split(","):
                pkey = pkey.strip().encode('ascii', errors='ignore').decode()
                print("{} - {}".format(key, pkey))
                if Person().load({"key": pkey}):
                    pr = PersonRelationship({
                        "type": type,
                        "from_key": key,
                        "to_key": pkey
                    })
                    pr.save()
