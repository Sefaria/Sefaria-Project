from sefaria.system.database import db
from collections import defaultdict
import csv
import sys
import argparse

"""
Deletes duplicate profiles in the database and produces an output file documenting
which profiles were deleted.
:flag --dry-run, -d: produce output file without actually deleting any profiles

Notes:
"Duplicate profiles" are defined as mongo profile documents that have the same profile id, but a different slug and a
different _id. They were created by the bug identified here: https://trello.com/c/pUEf6Awr/2828-user-accounts-are-duplicated
"""


def dedupe(profile_id, dry_run):
    """
    Returns a dictionary with information about id attempted to delete.

    Current profile accessor functions pull by id and do not have a mechanism for determining the 'primary' profile.
    Values are read from and written to the "first" profile match (based on insertion order -- Mongo's default)
    Therefore, we too make the "assumption" that the first profile pulled is the "main" profile.
    """
    duplicates = db.profiles.find({"id": profile_id})
    profiles = [profile for profile in duplicates]
    if len(profiles) < 2:
        return {"id": profile_id, "notes":"2 profiles not found: database change error", "dry_run": dry_run}
    try:
        to_keep = profiles[0]
        output_log = {"id": to_keep['id'], "_id_deleted": '', "_id_remaining": '', "dry_run": dry_run,
                      '_id_remaining': to_keep['_id']}
        deleted = []
        for profile in profiles[1:]:
            deleted.append(str(profile['_id']))
            if not dry_run:
                update_empty(to_keep, profile)
                db.profiles.delete_one({'_id': profile['_id']})
        output_log['_id_deleted'] = '+'.join(deleted)
    except Exception as e:
        output_log['notes'] = e
    return output_log


def profiles_empty(non_primary_profiles):
    """
    Ensure that non-primary profiles do not have anything useful in them
    """
    non_primaries_empty = True
    for non_primary_profile in non_primary_profiles:
        # Check that non-primary profiles do not have any important info
        # Note: We don't check profile_pic_url or nationbuilder_id because
        # these were populated in the duplicate profile by a script
        non_primaries_empty = non_primary_profile.get('bio', '') == '' \
                              and non_primary_profile.get('gauth_email') is None \
                              and non_primary_profile.get('public_email', '') == '' \
                              and non_primary_profile.get('position', '') == ''
    return non_primaries_empty


def update_empty(copy_into, copy_from):
    for k, v in list(copy_from.items()):
        if v:
            if k not in copy_into or copy_into[k] == '' or copy_into[k] == []:
                copy_into[k] = v
    db.profiles.update_one({"id": copy_into["id"]}, {"$set": copy_into})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        prog="DeleteDuplicateProfile",
        description="Deletes duplicate profiles in mongo (same id)"
    )
    parser.add_argument("-d", "--dry-run", action='store_true',
                        help="produce output file without actually deleting any profiles")
    args = parser.parse_args()

    with open("duplicate_profiles_outf.csv", "w+") as outf:
        fieldnames = ["id", "_id_deleted", "_id_remaining", "notes", "dry_run"]
        csv_writer = csv.DictWriter(outf, fieldnames)
        csv_writer.writeheader()
        for p in db.profiles.aggregate([
            {"$group": {"_id": "$id", "count": {"$sum": 1}}},
            {"$match": {"_id": {"$ne": None}, "count": {"$gt": 1}}},
            {"$project": {"_id": 1}}
        ]):  # get profiles that are duplicated
            csv_writer.writerow(dedupe(p['_id'], args.dry_run))

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
