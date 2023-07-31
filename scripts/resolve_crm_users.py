import django

django.setup()
from sefaria.system.database import db
from sefaria.model.user_profile import UserProfile
from sefaria.helper.crm.crm_info_store import CrmInfoStore
from datetime import date
import argparse
import csv


def is_sustainer(row):
    sustainer_status = row['Contact: Sustainer']
    if sustainer_status == "Active":
        return True
    elif sustainer_status == "Former": # maybe we will change this later
        return False
    else:
        return False


def find_matching_and_update(row, dry_run):
    """
    takes a row, updates info on side and returns the row to write
    """
    matching_mongo_profile = db.profiles.find_one("nb_id")
    if matching_mongo_profile:
        row['nb_id matches'] = True
        profile = UserProfile(uid=matching_mongo_profile['id'])
        row['mongo_id'] = profile.id
        if profile.email == row['Sefaria App Email']:
            row['email matches'] = True
        try:
            if dry_run:
                row['updated'] = "dry_run"
            else:
                row['updated'] = CrmInfoStore.save_crm_id(row['Sefaria App User: ID'], profile.email, "SALESFORCE", profile)
                CrmInfoStore.mark_sustainer(profile, is_sustainer(row))
        except:
            row['updated'] = False
    else:
        row['nb_id matches'] = False
        profile = UserProfile(email=row['Sefaria App Email'])
        row['mongo_id'] = profile.id
        if profile.email == 'test@sefaria.org':
            row['email matches'] = False
            row['updated'] = False
            return row
        else:
            row['email matches'] = True
            if dry_run:
                row['updated'] = "dry_run"
            else:
                row['updated'] = CrmInfoStore.save_crm_id(row['Sefaria App User: ID'], profile.email, "SALESFORCE", profile)
                CrmInfoStore.mark_sustainer(profile, is_sustainer(row))
    return row


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        prog="ResolveCrmUsers",
        description="Resolves CRM Users to add Sefaria app user ids (salesforce) based on Nationbuilder ID or Email"
    )
    parser.add_argument("-d", "--dry-run", action='store_true',
                        help="produce output file without actually updating any profiles")

    parser.add_argument("-f", "--file", nargs=1,
                        help='csv file from Salesforce with relevant information')

    parser.add_argument("-l", "--line", nargs=1,
                        help="line of file to start on")

    args = parser.parse_args()

    with open(args.file[0], "r") as sf_inf, \
            open(f'{date.today().strftime("%Y_%m_%d")}_resolve_crm_{args.file[0]}', "w+") as outf:
        csv_reader = csv.DictReader(sf_inf, delimiter=',')
        fieldnames = ["Contact: NationBuilder Id", "Contact: Contact ID", "Contact: First Name", 'Contact: Last Name',
                      'Sefaria App User: Sefaria App User Name', 'Sefaria App User: ID', "Sefaria App Email",
                      "Contact: Sustainer", "nb_id matches", "email matches", "updated", "mongo_id"]
        csv_writer = csv.DictWriter(outf, fieldnames)
        csv_writer.writeheader()
        last_skipped_line = 0
        if args.line:
            for i in range(int(args.line[0])):
                next(csv_reader)
                last_skipped_line = last_skipped_line + 1
        for index, row_r in enumerate(csv_reader):
            row_w = find_matching_and_update(row_r, args.dry_run)
            csv_writer.writerow(row_r)
            if index % 1000 == 0:  # in case script gets dropped
                print(f'Row {index+last_skipped_line+2}: {row_r["Sefaria App User: ID"]}')
