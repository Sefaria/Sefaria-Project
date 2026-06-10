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
    print("Writing sheet makers CSV")
    authors = {}
    author_ids = db.sheets.find(query).distinct("owner")
    sheets = db.sheets.find({}, {"owner":1, "status":1, "dateModified":1, "tags": 1})

    for sheet in sheets:
        owner = sheet.get("owner", 0)
        if owner not in author_ids:
            continue

        author = authors.get(owner, {
                "total_sheet_count": 0,
                "public_sheet_count": 0,
                "private_sheet_count": 0,
                "untagged_public_sheet_count": 0,
                "last_modified_date": datetime(2000, 1, 1, 00, 00)
            }
        )
        author["total_sheet_count"] += 1

        if "status" in sheet and sheet["status"] == "unlisted":
            author["private_sheet_count"] += 1
        else:
            author["public_sheet_count"] += 1
            if len(sheet.get("tags", [])) == 0:
                author["untagged_public_sheet_count"] += 1

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

        add_author = False

        educator_keywords = ["Hebrew", "School", "Yeshiva", "Academy"]

        if any(kw in profile.position for kw in educator_keywords):
            add_author = True

        elif any(kw in profile.organization for kw in educator_keywords):
            add_author = True

        elif any(kw in profile.bio for kw in educator_keywords):
            add_author = True

        else:

            with open('/school-lookup-data/schools.tsv') as tsvfile:
                reader = csv.reader(tsvfile, delimiter='\t')
                for row in reader:
                    try:
                        if (profile.email.split("@")[1] == row[1]):
                            add_author = True
                    except:
                        add_author = False

                    if row[0] in profile.position:
                        add_author = True
                    elif row[0] in profile.organization:
                        add_author = True
                    elif row[0] in profile.bio:
                        add_author = True


        if add_author == True:

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
                authors[author]["last_modified_date"]])

    with open("output.csv", 'w') as resultFile:
        wr = csv.writer(resultFile)
        wr.writerow(["user_id","firt_name","last_name","email","profile_slug","position","organization","bio","website","interface_language","total_sheet_count","public_sheet_count","private_sheet_count","untagged_public_sheet_count","latest_sheet_editted_date"])
        wr.writerows(author_list_for_csv)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", action='store_true', help="only write sheet makers active in the last year")
    args = parser.parse_args()
    query = {}
    if args.year:
        cutoff = datetime.now() - timedelta(days=365)
        query["dateModified"] = {"$gt": cutoff.isoformat()}

    write_sheet_makers_csv(query=query)
