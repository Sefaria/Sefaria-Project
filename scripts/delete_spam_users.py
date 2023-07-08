import django

django.setup()
from sefaria.model import UserProfile
import csv
import json
import sys
from sefaria.system.database import db
from sefaria.views import purge_spammer_account_data
from django.contrib.auth.models import User
from datetime import datetime

"""
usage: python delete_spam_usrs.py path/to/file
--dry-run: produce outfile without actually deleting
"""

def get_outf_name(filename):
    filename_index = filename.rfind('/')
    extension_index = filename.rfind('.')
    return filename[0:filename_index] + '/outf' + filename[filename_index:extension_index] + "_outf.csv"


def main():
    filename = sys.argv[1]
    outf = get_outf_name(filename)
    dry_run = False
    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == "--dry-run":
            dry_run = True
        else:
            raise Exception("Unrecognized argument: " + sys.argv[i])
        i += 1

    if not dry_run:
        if input("This will permanently delete User Data. Are you sure? (Y/N)\n").lower() != "y":
            print("\nExiting\n")
            return

    print(dry_run)
    print(filename)
    print(outf)

    # Open spam csv & read in
    with open(filename) as spam_emails, open(outf, 'w+') as outf:
        csv_reader = csv.DictReader(spam_emails, delimiter=',')
        fieldnames = ["id", "nationbuilder_id", "email_nb", "email_sefaria", "tag_list", "nationbuilder_id_in_mongo",
                      "email_in_mongo", "deleted_status", "dry_run"]
        csv_writer = csv.DictWriter(outf, fieldnames)
        csv_writer.writeheader()
        for index, row in enumerate(csv_reader):
            mongo_profile = db.profiles.find_one({'nationbuilder_id': row['nationbuilder_id']})
            if mongo_profile:
                profile = UserProfile(id=mongo_profile['id'])
                if profile.email == row['email']:
                    status = "delete"
                else:
                    status = "nationbuilder_id_found_email_mismatch"
            else:
                profile = UserProfile(email=row['email'])
                if profile.id:
                    mongo_profile = db.profiles.find_one({'id': profile.id})
                    status = "nationbuilder_id_not_found_email_found"
                else:
                    status = "not_in_db"
                    mongo_profile = None

            nb_id_mongo = mongo_profile['nationbuilder_id'] if mongo_profile else 'No Mongo Profile'
            email_sefaria = profile.email if profile.id else 'No Sefaria Profile'

            csv_writer.writerow(dict(id=profile.id, nationbuilder_id=row['nationbuilder_id'], email_nb=row['email'],
                                     email_sefaria=email_sefaria, tag_list=row['tag_list'],
                                     nationbuilder_id_in_mongo=nb_id_mongo, email_in_mongo=email_sefaria,
                                     deleted_status=status, dry_run=dry_run))
            if not dry_run:
                if profile.id and mongo_profile:
                    purge_spammer_account_data(profile.id, False)


if __name__ == '__main__':
    sys.exit(main())
