# -*- coding: utf-8 -*-
import django
django.setup()

from sefaria.system.database import db
from sefaria.model import *
from datetime import datetime
import csv

authors = {}

sheets = db.sheets.find()

for sheet in sheets:
    owner = sheet.get("owner", 0)

    author = authors.get(owner, {
            "total_sheet_count": 0,
            "private_sheet_count": 0,
            "last_modified_date": datetime(2000, 1, 1, 00, 00)
        }
    )


    cur_total_count = author.get("total_sheet_count", 0)
    author["total_sheet_count"] = cur_total_count + 1

    if "status" in sheet and sheet["status"] == "unlisted":
        cur_private_count = author.get("private_sheet_count", 0)
        author["private_sheet_count"] = cur_private_count + 1

    cur_last_modified_date = author.get("last_modified_date", datetime(2000, 1, 1, 00, 00))

    try:
        sheet_mod_time = datetime.strptime(sheet["dateModified"], '%Y-%m-%dT%H:%M:%S.%f')
    except:
        sheet_mod_time = datetime(2000, 1, 1, 00, 00)

    if "dateModified" in sheet and sheet_mod_time > cur_last_modified_date:
        author["last_modified_date"] = sheet_mod_time

    authors[owner] = author



author_list_for_csv = []

for author in authors:
    profile = UserProfile(id=author)

    author_list_for_csv.append([author, profile.full_name.encode("utf-8"), profile.email, profile.slug, authors[author]["total_sheet_count"], authors[author]["private_sheet_count"], authors[author]["last_modified_date"]])


with open("output.csv", 'wb') as resultFile:
    wr = csv.writer(resultFile)
    wr.writerow(["user_id","full name","email","profile_slug","total_sheet_count","private_sheet_count","latest_sheet_editted_date"])
    wr.writerows(author_list_for_csv)
