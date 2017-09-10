# -*- coding: utf-8 -*-
from collections import defaultdict

from sefaria.system.database import db
from sefaria.model import *

authors        = defaultdict(int)
public_authors = defaultdict(int)

sheets = db.sheets.find()

for sheet in sheets:
    owner = sheet.get("owner", 0)
    authors[owner] += 1
    if "status" in sheet and sheet["status"] == "public":
        public_authors[owner] += 1

sorted_authors        = sorted(authors.iteritems(), key=lambda x: -x[1])
sorted_public_authors = sorted(public_authors.iteritems(), key=lambda x: -x[1])

print "Top Public Sheet Authors"
for author in sorted_public_authors[:10]:
    profile = UserProfile(id=author[0])
    print "%s: %d public sheets - www.sefaria.org/profile/%s" % (profile.full_name, author[1], profile.slug)
print "Top Total Sheet Authors"
for author in sorted_authors[:10]:
    profile = UserProfile(id=author[0])
    print "%s: %d sheets - www.sefaria.org/profile/%s" % (profile.full_name, author[1], profile.slug)