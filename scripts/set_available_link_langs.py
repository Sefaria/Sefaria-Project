# -*- coding: utf-8 -*-

import django
django.setup()

from sefaria.model.link import LinkSet

links = LinkSet(query_or_ref={"availableLangs": {"$exists": False}})
print("Saving {} links...".format(links.count()))

for i, link in enumerate(links):
	try:
		link.save()
		if i % 1000 == 1:
			print("\r{}".format(i))
	except:
		continue
