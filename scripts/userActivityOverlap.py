# -*- coding: utf-8 -*-
import django
django.setup()

import itertools
from sefaria.system.database import db


# get all active users

def _(cursor):
    data = {d["_id"]: d for d in cursor}
    users = set(data.keys())
    return data, users

# _id, count

all_sheet_users_data, all_sheet_users = _(db.sheets.aggregate([{"$sortByCount" : "$owner"}]))
public_sheets_data, public_sheets_users = _(db.sheets.aggregate([{"$match" : {"status": "public"}}, {"$sortByCount" : "$owner"}]))
all_notes_data, all_notes_users = _(db.notes.aggregate([{"$sortByCount" : "$owner"}]))
bookmark_data, bookmark_users = _(db.user_history.aggregate([{"$match" : {"saved": True}}, {"$sortByCount" : "$uid"}]))
followers_data, followers_users = _(db.following.aggregate([{"$sortByCount": "$follower"}]))

# a,b,c,d,e

names= ["sheets", "public sheets", "notes", "bookmarks", "followers"]
sets = [all_sheet_users, public_sheets_users, all_notes_users, bookmark_users, followers_users]
for n, s in zip(names, sets):
    print(f"{n}: {len(s)}")

print()
combos = itertools.combinations(zip(names, sets), 2)
for _1st, _2nd in combos:
    print(f"{_1st[0]} and {_2nd[0]}:  {len(set.intersection(_1st[1], _2nd[1]))}")

print()
u = set.intersection(*sets)
print(f"Using all: {len(u)}")





