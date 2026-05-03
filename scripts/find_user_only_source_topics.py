"""
Find topics where all linked sources are user-generated (dataSource: "sefaria-users")
or have zero sources linked. Output CSV to stdout.

Columns: En Title, He Title, En Description, He Description, Slug, Num Sources, Num Source Sheets
Sorted by: Num Sources (ascending)
"""
import csv
import sys
import django
django.setup()

from sefaria.system.database import db

# Aggregate refTopic links per topic:
# - num_sources: count of non-sheet links
# - num_non_user_sources: count of non-sheet links NOT from sefaria-users
# - num_sheets: count of sheet links
pipeline = [
    {"$match": {"class": "refTopic"}},
    {"$group": {
        "_id": "$toTopic",
        "num_sources": {
            "$sum": {"$cond": [{"$ne": ["$is_sheet", True]}, 1, 0]}
        },
        "num_non_user_sources": {
            "$sum": {
                "$cond": [
                    {"$and": [
                        {"$ne": ["$is_sheet", True]},
                        {"$ne": ["$dataSource", "sefaria-users"]}
                    ]},
                    1, 0
                ]
            }
        },
        "num_sheets": {
            "$sum": {"$cond": [{"$eq": ["$is_sheet", True]}, 1, 0]}
        }
    }},
]

link_data = {r["_id"]: r for r in db.topic_links.aggregate(pipeline)}

topics = list(db.topics.find({}, {"slug": 1, "titles": 1, "description": 1, "shouldDisplay": 1, "subclass": 1}))

rows = []
for topic in topics:
    slug = topic.get("slug", "")
    if topic.get("shouldDisplay", None) == False or topic.get("subclass") == "author":
        continue
    data = link_data.get(slug)

    if data is None:
        num_sources = 0
        num_sheets = 0
        qualifies = True
    else:
        num_sources = data["num_sources"]
        num_sheets = data["num_sheets"]
        qualifies = data["num_non_user_sources"] == 0

    if not qualifies:
        continue

    titles = topic.get("titles", [])
    en_title = next((t["text"] for t in titles if t.get("lang") == "en" and t.get("primary")), "")
    he_title = next((t["text"] for t in titles if t.get("lang") == "he" and t.get("primary")), "")

    desc = topic.get("description", {}) or {}
    en_desc = desc.get("en", "") or ""
    he_desc = desc.get("he", "") or ""

    rows.append({
        "En Title": en_title,
        "He Title": he_title,
        "En Description": en_desc,
        "He Description": he_desc,
        "Slug": slug,
        "Num Sources": num_sources,
        "Num Source Sheets": num_sheets,
    })

rows.sort(key=lambda r: r["Num Sources"], reverse=True)

writer = csv.DictWriter(
    sys.stdout,
    fieldnames=["En Title", "He Title", "En Description", "He Description", "Slug", "Num Sources", "Num Source Sheets"],
)
writer.writeheader()
writer.writerows(rows)
sys.stderr.write(f"Total topics matching: {len(rows)}\n")
