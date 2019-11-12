from sefaria.model import *
from sefaria.system.database import db

pipe = [{"$group": {"_id": "$ref", "count": {"$sum": 1}}},
        {"$match": {"_id": {"$ne": None}, "count": {"$gt": 1}}},
        {"$project": {"ref": "$_id", "_id": 0}}]

q = db.translation_requests.aggregate(pipe)
refs = [p["ref"] for p in q["result"]]
n = len(refs)
"""
    required_attrs = [
        "ref",             # string ref
        "requesters",      # list of int uids
        "request_count",   # int of requesters length
        "completed",       # bool
        "first_requested", # date
        "last_requested",  # date
        "section_level",   # bool is the ref section level
    ]
    optional_attrs = [
        "completed_date",  # date
        "completer",       # int uid
        "featured",        # bool
        "featured_until",  # date when feature ends
    ]
"""

print("processing {} duplicate refs".format(n))

for i, ref in enumerate(refs):
    if (i + 1) % 10 == 0:
        print("{}/{} - {}".format(i+1, n, ref))

    # Translation requests for this ref, from oldest to newest
    ref_txs = TranslationRequestSet({"ref": ref}, sort=[["first_requested", 1]]).array()

    # Curry the newest for saving
    if len(ref_txs) == 1:
        continue
    newest = ref_txs[-1]
    oldest = ref_txs[0]
    newest.first_requested = oldest.first_requested
    if newest.request_count == 1:
        newest.last_requested = newest.first_requested
    else:
        # get oldest instance of this many requests (not clear this branch is ever triggered)
        subset = TranslationRequestSet({"ref": ref, "request_count": newest.request_count}, sort=[["first_requested", 1]]).array()
        oldest_current = subset[0]
        newest.last_requested = oldest_current.last_requested
    print(vars(newest))
    print("Deleting {}".format(len(ref_txs[:-1])))
    print()
    for t in ref_txs[:-1]:
        t.delete()
    newest.save()