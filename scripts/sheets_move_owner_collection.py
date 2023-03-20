# -*- coding: utf-8 -*-
import django

django.setup()

import re
import csv
import sys
from datetime import date

from sefaria.sheets import get_sheet, save_sheet, add_sheet_to_collection, change_sheet_owner
from sefaria.model.collection import Collection

"""
usage: python make_collection_from_spreadsheet.py filename
"""


def main():
    filename = sys.argv[1]
    outf = f'collections_outf_{date.today().strftime("%Y_%m_%d")}.csv'
    with open(filename) as inf, open(outf, 'w+') as outf:
        fieldnames = ["Sheet_Name", "Sheet_URL", "Sheet_ID", "Current_Acct_Name", "Current_Acct_ID", "New_Acct_Name",
                      "New_Acct_ID", "moved_into_their_account", "Name_of_collection", "URL_of_collection",
                      "moved_into_collection"]
        csv_reader = csv.DictReader(inf, delimiter=',')
        csv_writer = csv.DictWriter(outf, fieldnames)
        csv_writer.writeheader()
        collection = None
        for index, row in enumerate(csv_reader):
            outdict = {k: row[k] for k in row.keys()}
            try:
                new_user_id = int(row["New_Acct_ID"])
                sheet_id = int(row["Sheet_ID"])
                collection_slug = re.search(r"https://www\.sefaria\.org/collections/([a-zA-Z0-9\-_]+)", row["URL_of_collection"]).group(1)
                if not collection or collection.slug != collection_slug:
                    collection = Collection().load({"slug": collection_slug})
                add_sheet_to_collection(sheet_id, collection, True, True)
                outdict["moved_into_collection"] = True
                change_sheet_owner(sheet_id, new_user_id)
                outdict["moved_into_their_account"] = True
            except Exception as e:
                outdict["moved_into_collection"] = f'Error: {str(e)}'
                outdict["moved_into_their_account"] = f'Error: {str(e)}'
            csv_writer.writerow(outdict)


if __name__ == '__main__':
    sys.exit(main())
