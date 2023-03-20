# -*- coding: utf-8 -*-
from datetime import datetime, timedelta
import csv
import argparse
import re
import django
django.setup()

from sefaria.system.database import db
from sefaria.model import *


def write_sheet_makers_csv(query={}, cutoff=False):
    """
    `query` - limit on which sheets to examine
    """
    print("Writing sheet makers CSV")
    authors = {}
    if cutoff:
        query["dateCreated"] = {"$gt": cutoff.isoformat()}

    author_ids = db.sheets.find(query).distinct("owner")
    sheets = db.sheets.find({}, {"owner":1, "status":1, "dateCreated":1, "tags": 1})

    for sheet in sheets:
        owner = sheet.get("owner", 0)
        if owner not in author_ids:
            continue

        author = authors.get(owner, {
                "total_sheet_count": 0,
                "public_sheet_count": 0,
                "private_sheet_count": 0,
                "untagged_public_sheet_count": 0,
                "sheets_in_cut_off": 0,
                "public_sheets_in_cut_off": 0,
                "date_created": datetime(2000, 1, 1, 00, 00)
            }
        )
        author["total_sheet_count"] += 1


        if "status" in sheet and sheet["status"] == "unlisted":
            author["private_sheet_count"] += 1
        else:
            author["public_sheet_count"] += 1
            if len(sheet.get("tags", [])) == 0:
                author["untagged_public_sheet_count"] += 1

        cur_date_created = author.get("dateCreated", datetime(2000, 1, 1, 00, 00))

        try:
            sheet_create_time = datetime.strptime(sheet["dateCreated"], '%Y-%m-%dT%H:%M:%S.%f')
        except:
            sheet_create_time = datetime(2000, 1, 1, 00, 00)

        if "dateCreated" in sheet and sheet_create_time > cur_date_created:
            author["dateCreated"] = sheet_create_time

        if cutoff:
            if (sheet_create_time-cutoff).days > 0:
                author["sheets_in_cut_off"] += 1
                if "status" in sheet and sheet["status"] != "unlisted":
                    author["public_sheets_in_cut_off"] += 1
        else:
            author["sheets_in_cut_off"] = author["total_sheet_count"]

        authors[owner] = author


    author_list_for_csv = []

    for author in authors:
        profile = UserProfile(id=author)

        author_list_for_csv.append([
            author,
            profile.first_name,
            profile.last_name,
            profile.email,
            profile.slug,
            profile.position,
            profile.organization,
            profile.bio,
            profile.website,
            profile.settings.get("interface_language", "english"),
            authors[author]["total_sheet_count"],
            authors[author]["public_sheet_count"],
            authors[author]["private_sheet_count"],
            authors[author]["untagged_public_sheet_count"],
            authors[author]["sheets_in_cut_off"],
            authors[author]["public_sheets_in_cut_off"],
            authors[author]["date_created"]])


    with open("output.csv", 'w') as resultFile:
        wr = csv.writer(resultFile)
        wr.writerow(["user_id","firt_name","last_name","email","profile_slug","position","organization","bio","website","interface_language","total_sheet_count","public_sheet_count","private_sheet_count","untagged_public_sheet_count","sheets_in_cut_off","public_sheets_in_cut_off","latest_sheet_editted_date"])
        wr.writerows(author_list_for_csv)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", action='store_true', help="only write sheet makers active in the last year")
    parser.add_argument("--days", help="only find sheet makers active in the x days")
    args = parser.parse_args()

    query = {}
    cutoff = False

    if args.year:
        cutoff = datetime.now() - timedelta(days=365)
    if args.days:
        cutoff = datetime.now() - timedelta(days=int(args.days))
    write_sheet_makers_csv(query=query, cutoff=cutoff)
