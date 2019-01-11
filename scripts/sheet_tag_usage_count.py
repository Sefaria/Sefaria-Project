import django
django.setup()

import csv
from sefaria.model import *
from sefaria.system.database import db



sheet_tag_usage_count = [["tag","count"]]

tags = db.sheets.distinct("tags")
for tag in tags:
    if tag: #required b/c apparently `None` is a tag somehow...
        sheets_with_tag_count = db.sheets.find({"tags": tag}).count()
        sheet_tag_usage_count.append([tag.encode("utf-8"),sheets_with_tag_count])

with open("output.csv", "wb") as f:
	writer = csv.writer(f)
	writer.writerows(sheet_tag_usage_count)
