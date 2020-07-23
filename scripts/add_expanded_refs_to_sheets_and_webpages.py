import django
django.setup()
from pymongo import UpdateOne
from tqdm import tqdm
from sefaria.model import *
from sefaria.system.database import db
from sefaria.sheets import expand_included_refs


sheets = db.sheets.find({}, {"includedRefs": 1, "id": 1})
num_sheets = db.sheets.count_documents({})
updates = []
for s in tqdm(sheets, total=num_sheets):
    try:
        updates += [{"id": s['id'], "expandedRefs": expand_included_refs(s["includedRefs"])}]
    except KeyError:
        continue

db.sheets.bulk_write([
    UpdateOne({"id": s['id']}, {"$set": {"expandedRefs": s['expandedRefs']}}) for s in updates
])