import django

django.setup()
from sefaria.system.database import db
from sefaria.model.user_profile import UserProfile
from sefaria.helper.crm.crm_info_store import CrmInfoStore
from datetime import date
import argparse
import csv


def find_matching_and_update(row):
    """
    takes a row, updates info on side and returns the row to write
    """
    matching_mongo_profile = db.profiles.find_one("nb_id")
    if matching_mongo_profile:
        row['nb_id matches'] = True
        profile = UserProfile(uid=matching_mongo_profile['id'])
        if profile.email == row['Sefaria App Email']:
            row['email matches'] = True
        try:
            row['updated'] = CrmInfoStore.save_crm_id(row['Sefaria App User: ID'], profile.email, "SALESFORCE", profile)
        except:
            row['updated'] = False
    else:
        row['nb_id matches'] = False
        profile = UserProfile(email=row['Sefaria App Email'])
        if profile.email == 'test@sefaria.org':
            row['email matches'] = False
            row['updated'] = False
            return row
        else:
            row['email matches'] = True
            row['updated'] = CrmInfoStore.save_crm_id(row['Sefaria App User: ID'], profile.email, "SALESFORCE", profile)
    return row


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        prog="ResolveCrmUsers",
        description="Resolves CRM Users to add Sefaria app user ids (salesforce) based on Nationbuilder ID or Email"
    )
    parser.add_argument("-d", "--dry-run", action='store_false',
                        help="produce output file without actually updating any profiles")

    parser.add_argument("-f", "--file", action='store_const', const='',
                        help='csv file from Salesforce with relevant information')

    args = parser.parse_args()

    with open(args.file, "r") as sf_inf, \
            open(f'{date.today().strftime("%Y_%m_%d")}_resolve_crm_{args.file}') as outf:
        csv_reader = csv.DictReader(sf_inf, delimiter=',')
        fieldnames = ["Contact: NationBuilder Id", "Contact: Contact ID", "Contact: First Name", "Sefaria App Email",
                      "Contact: Sustainer", "nb_id matches", "email matches", "updated"]
        csv_writer = csv.DictWriter(outf, fieldnames)
        csv_writer.writeheader()
        for index, row in enumerate(csv_reader):
            row_w = find_matching_and_update(row)
            csv_writer.writerow(row)
# print sefaria app emails that don't have
