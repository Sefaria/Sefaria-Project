# -*- coding: utf-8 -*-

import django
django.setup()

from sefaria.model.link import LinkSet

links = LinkSet()
print("Saving {} links...".format(links.count()))

for i, link in enumerate(links):
	try:
		link._skip_expanded_refs_set = True
		link.save()
		if i % 1000 == 1:
			print("\r{}".format(i))
	except:
		continue
