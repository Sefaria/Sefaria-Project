from sefaria.system.database import db
from collections import defaultdict

id_map = defaultdict(list)
for p in db.profiles.find({}):
    id_map[p["id"]] += [p]

bad_accounts  =0
for k, v in list(id_map.items()):
    if len(v) == 2:
        empty_p, normal_p = (v[0], v[1]) if v[0]["slug"] == "" and v[1]["slug"] != "" else (v[1], v[0])
        try:
            assert empty_p["slug"] == ""
            assert normal_p["slug"] != ""
            bad_accounts += 1
        except AssertionError:
            continue
        print(empty_p["_id"])
        # db.profiles.delete_one({"_id": empty_p["_id"]})
print(bad_accounts)
