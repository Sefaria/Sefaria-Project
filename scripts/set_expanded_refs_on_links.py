# -*- coding: utf-8 -*-

import django
django.setup()

from sefaria.system.database import db
from sefaria.model.link import LinkSet


db.links.create_index("expandedRefs0")
db.links.create_index("expandedRefs1")

links = LinkSet(query_or_ref={"expandedRefs0": {"$exists": False}})
print("Saving {} links...".format(links.count()))

for i, link in enumerate(links):
	try:
		link._skip_lang_check = True
		link.save()
		if i % 1000 == 1:
			print("\r{}".format(i))
	except:
		if i % 1000 == 1:
			print("\r{}".format(i))		
		continue
