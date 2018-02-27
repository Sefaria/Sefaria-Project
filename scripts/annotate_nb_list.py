# -*- coding: utf-8 -*-
import sys
import os
import unicodecsv as csv

from sefaria.model import UserProfile
from sefaria.sheets import sheet_list
from sefaria.system.database import db
from sefaria.utils.util import strip_tags


with open("data/private/nationbuilder-people-export-2017-09-01-1120.csv", 'r') as csv_in:
  reader = csv.reader(csv_in)
  with open("data/private/nationbuilder-people-export-2017-09-01-1120-annotated.csv", 'wb') as csv_out:
    writer = csv.writer(csv_out)
    writer.writerow(next(reader) + [
                                     "has_account", 
                                     "sheets_count", 
                                     "public_sheets_count",
                                     "sheet_views",
                                     "bio",
                                     "organization", 
                                     "position", 
                                     "jewish_education",
                                     "profile_url",
                                   ])

    for row in reader:
      email = row[8]
      profile = UserProfile(email=email)
      
      if not profile.date_joined:
        writer.writerow(row + ["false", 0, 0, "", "", "", ""])
        continue

      has_account         = "true"
      sheets_count        = db.sheets.find({"owner": profile.id}).count()
      public_sheets_count = db.sheets.find({"owner": profile.id, "status": "public"}).count()
      sheet_views         = sum([sheet["views"] for sheet in sheet_list(query={"owner": profile.id})])
      bio                 = strip_tags(profile.bio)
      organization        = profile.organization
      position            = profile.position
      jewish_education    = ". ".join(profile.jewish_education)
      profile_url         = "https://www.sefaria.org/profile/%s" % profile.slug

      new_row = row + [
                        has_account, 
                        sheets_count, 
                        public_sheets_count,
                        sheet_views,
                        bio,
                        organization, 
                        position, 
                        jewish_education,
                        profile_url,
                      ]

      writer.writerow(new_row)