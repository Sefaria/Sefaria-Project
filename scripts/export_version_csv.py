import csv
from sefaria.model import *

with open("data/tmp/versions.csv", 'w+') as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(["Text", "Version Title", "Version Source"])
    vs = VersionSet()
    for v in vs:
        writer.writerow([unicode(s).encode("utf-8") for s in [v.title, v.versionTitle, v.versionSource]])