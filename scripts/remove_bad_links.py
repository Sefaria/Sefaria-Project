from sefaria.model import *

links = LinkSet({})
for link in links:
    try:
        link.save()
    except Exception:
        print(link.contents())
        link.delete()