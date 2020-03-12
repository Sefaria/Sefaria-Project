# -*- coding: utf-8 -*-
from datetime import datetime, timedelta
import csv
import argparse
import re
import django
django.setup()

from sefaria.system.database import db
from sefaria.model import *


def write_sheet_makers_csv(query={}):
    """
    `query` - limit on which sheets to examine
    """    
    authors = {}
    author_ids = db.sheets.find(query).distinct("owner")
    sheets = db.sheets.find({}, {"owner":1, "status":1, "dateModified":1})

    for sheet in sheets:
        owner = sheet.get("owner", 0)
        if owner not in author_ids:
            continue

        author = authors.get(owner, {
                "total_sheet_count": 0,
                "private_sheet_count": 0,
                "last_modified_date": datetime(2000, 1, 1, 00, 00)
            }
        )
        author["total_sheet_count"] = author["total_sheet_count"] + 1

        if "status" in sheet and sheet["status"] == "unlisted":
            author["private_sheet_count"] = author["private_sheet_count"] + 1

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

        author_list_for_csv.append([
            author,
            profile.full_name.encode("utf-8"),
            profile.email.encode("utf-8"), 
            profile.slug.encode("utf-8"),
            profile.position.encode("utf-8"),
            profile.organization.encode("utf-8"),
            profile.bio.encode("utf-8"),
            profile.website.encode("utf-8"),
            authors[author]["total_sheet_count"],
            authors[author]["private_sheet_count"],
            authors[author]["last_modified_date"]])


    with open("output.csv", 'wb') as resultFile:
        wr = csv.writer(resultFile)
        wr.writerow(["user_id","full name","email","profile_slug","position","organization","bio","website","total_sheet_count","private_sheet_count","latest_sheet_editted_date"])
        wr.writerows(author_list_for_csv)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", action='store_true', help="only write sheet makers active in the last year")
    args = parser.parse_args()
    if args.year:
        cutoff = datetime.now() - timedelta(days=365)
        query = {"dateModified": {"$gt": cutoff.isoformat()}}
    else:
        query = {}

    write_sheet_makers_csv(query=query)

