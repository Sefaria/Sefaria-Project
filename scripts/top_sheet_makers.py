# -*- coding: utf-8 -*-
import django
django.setup()

from collections import defaultdict

from sefaria.system.database import db
from sefaria.model import *

authors          = defaultdict(int)
public_authors   = defaultdict(int)
authors_by_views = defaultdict(int)

sheets = db.sheets.find()

for sheet in sheets:
    owner = sheet.get("owner", 0)
    authors[owner] += 1
    authors_by_views[owner] += sheet.get("views", 0)
    if "status" in sheet and sheet["status"] == "public":
        public_authors[owner] += 1

sorted_authors          = sorted(iter(authors.items()), key=lambda x: -x[1])
sorted_public_authors   = sorted(iter(public_authors.items()), key=lambda x: -x[1])
sorted_authors_by_views = sorted(iter(authors_by_views.items()), key=lambda x: -x[1])


print("\n\nTop Public Sheet Authors")
for author in sorted_public_authors[:10]:
    profile = UserProfile(id=author[0])
    print("%s: %d public sheets - www.sefaria.org/profile/%s" % (profile.full_name, author[1], profile.slug))

print("\n\nTop Total Sheet Authors")
for author in sorted_authors[:10]:
    profile = UserProfile(id=author[0])
    print("%s: %d sheets - www.sefaria.org/profile/%s" % (profile.full_name, author[1], profile.slug))

print("\n\nTop Total Sheet Authors by Views")
for author in sorted_authors_by_views[:10]:
    profile = UserProfile(id=author[0])
    print("%s: %d total sheet views - www.sefaria.org/profile/%s" % (profile.full_name, author[1], profile.slug))
