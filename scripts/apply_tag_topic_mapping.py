import json
import django
django.setup()
from collections import defaultdict
from sefaria.model import *
from sefaria.system.database import db
from pymongo import UpdateOne

from sefaria.utils.tibetan import has_tibetan
with open('data/sheet_mapping.json', 'r') as fin:
    tag_topic = json.load(fin)

id_map = defaultdict(list)
for ambig_slug, id_array in tag_topic['ambig'].items():
    for _id in id_array:
        id_map[_id] += [ambig_slug]

updates = []
for sheet in db.sheets.find():
    topics = []
    for tag in sheet.get('tags', []):
        if tag in tag_topic['tag_topic']:
            slug_array = tag_topic['tag_topic'].get(tag, None)
            if slug_array is None:
                new_topic = Topic({
                    "slug": tag,
                    "titles": [{
                        "text": tag,
                        "lang": "he" if has_tibetan(tag) else "en",
                        "primary": True
                    }]
                })
                new_topic.save()
                chosen_slug = new_topic.slug
                print("Created topic", chosen_slug)
            else:
                chosen_slug = slug_array[0]
                if sheet['id'] in id_map:
                    chosen_slug = id_map[sheet['id']][0]
            topics += [{
                "slug": chosen_slug,
                "asTyped": tag
            }]
    if sheet.get('id', None) is None:
        print("Sheet id is None")
        continue
    updates += [{'id': sheet['id'], 'topics': topics}]
db.sheets.bulk_write([
    UpdateOne({"id": l['id']}, {"$set": {"topics": l['topics']}}) for l in updates
])
