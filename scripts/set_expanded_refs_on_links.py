import django

django.setup()

from sefaria.model.link import LinkSet
from sefaria.system.database import db

db.links.create_index("expandedRefs0")
db.links.create_index("expandedRefs1")

links = LinkSet(query_or_ref={"expandedRefs0": {"$exists": False}})
print(f"Saving {links.count()} links...")

for i, link in enumerate(links):
    try:
        link._skip_lang_check = True
        link.save()
        if i % 1000 == 1:
            print(f"\r{i}")
    except:
        if i % 1000 == 1:
            print(f"\r{i}")
        continue
