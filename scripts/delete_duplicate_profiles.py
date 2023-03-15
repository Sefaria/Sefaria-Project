from sefaria.system.database import db
from collections import defaultdict
import csv
import sys
import argparse


"""
Deletes duplicate profiles in the database and produces an output file documenting
which profiles were deleted

usage: python delete_duplicate_profiles.py

parameters:
--dry-run: produce output file without actually deleting any profiles
"""


def add_nationbuilder_id_to_correct_profile(first, second):
    pass
    to_update = db.profiles.find_one({"_id": first['_id']})
    to_update['nationbuilder_id'] = second['nationbuilder_id']
    db.profile.save(to_update)


def dedupe(profile, dry_run):
    duplicates = db.profiles.find({"id": profile['_id']})
    first = next(duplicates)
    second = next(duplicates)
    fields = dict(id=first['id'],
                  _id_deleted='',
                  _id_remaining='',
                  copied_nb_id=False,
                  dry_run=dry_run
                  )

    if first.get('nationbuilder_id') is None and second.get('nationbuilder_id') is not None:
        if not dry_run:
            add_nationbuilder_id_to_correct_profile(first, second)
        fields['copied_nb_id'] = True
    if second.get('bio', '') == '' and second.get('gauth_email') is None and second.get('public_email', '') == '':
        if not dry_run:
            pass
            db.profiles.delete_one({'_id': second['_id']})
        fields['_id_deleted'] = second['_id']
        fields['_id_remaining'] = first['_id']
    else:
        fields['_id_deleted'] = 'FAILED TO DELETE'
    csv_writer.writerow(fields)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        prog="DeleteDuplicateProfile",
        description="Deletes duplicate profiles in mongo (same id)"
    )
    parser.add_argument("--d", "--dry-run", action='store_true',
                        help="produce output file without actually deleting any profiles")
    args = parser.parse_args()

    with open("duplicate_profiles_outf.csv", "w+") as outf:
        fieldnames = ["id", "_id_deleted", "_id_remaining", "copied_nb_id", "dry_run"]
        csv_writer = csv.DictWriter(outf, fieldnames)
        csv_writer.writeheader()
        for profile in db.profiles.aggregate([
            {"$group": {"_id": "$id", "count": {"$sum": 1}}},
            {"$match": {"_id": {"$ne": None}, "count": {"$gt": 1}}},
            {"$project": {"_id": 1}}
        ]):  # get profiles that are duplicated
            dedupe(profile, parser.d)

# old code -- does not work because all profiles have slugs, including duplicate profiles
# for p in db.profiles.find({}):
#     id_map[p["id"]] += [p]
#
# bad_accounts  =0
# for k, v in list(id_map.items()):
#     if len(v) == 2:
#         empty_p, normal_p = (v[0], v[1]) if v[0]["slug"] == "" and v[1]["slug"] != "" else (v[1], v[0])
#         try:
#             assert empty_p["slug"] == ""
#             assert normal_p["slug"] != ""
#             bad_accounts += 1
#         except AssertionError:
#             continue
#         print(empty_p["_id"])
#         # db.profiles.delete_one({"_id": empty_p["_id"]})
# print(bad_accounts)
