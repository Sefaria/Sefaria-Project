from urllib.parse import urlparse

from sefaria.system.database import db

links = db.texts.distinct("versionSource")
not_sites = set()
sites = set()

for link in links:
    olink = urlparse(link)
    if not olink.netloc:
        not_sites.add(link)
        continue
    sites.add(olink.netloc)

print(f"\n********* {len(sites)} sites ***********\n")
for site in list(sites):
    print(site)

print(f"\n******** {len(not_sites)} not sites **********\n")
for site in list(not_sites):
    print(site)
