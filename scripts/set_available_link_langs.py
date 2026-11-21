import django

django.setup()

from sefaria.model.link import LinkSet

links = LinkSet()
print(f"Saving {links.count()} links...")

for i, link in enumerate(links):
    try:
        link._skip_expanded_refs_set = True
        link.save()
        if i % 1000 == 1:
            print(f"\r{i}")
    except:
        continue
