import django
django.setup()
from pymongo import UpdateOne
from tqdm import tqdm
from sefaria.model import *
from sefaria.system.database import db

# SHEETS

sheets = db.sheets.find({}, {"includedRefs": 1, "id": 1})
num_sheets = db.sheets.count_documents({})
updates = []
for s in tqdm(sheets, total=num_sheets):
    try:
        updates += [{"id": s['id'], "expandedRefs": Ref.expand_refs(s["includedRefs"])}]
    except KeyError:
        continue

db.sheets.bulk_write([
    UpdateOne({"id": s['id']}, {"$set": {"expandedRefs": s['expandedRefs']}}) for s in updates
])

# WEBPAGES

webpages = WebPageSet()
num_webpages = webpages.count()
updates = []
for w in tqdm(webpages, total=num_webpages):
    try:
        updates += [{"id": w._id, "expandedRefs": Ref.expand_refs(w.refs)}]
    except KeyError:
        continue

db.webpages.bulk_write([
    UpdateOne({"_id": w['id']}, {"$set": {"expandedRefs": w['expandedRefs']}}) for w in updates
])