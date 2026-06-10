
import django
django.setup()
import csv
import json
from sefaria.helper.crm.nationbuilder import get_nationbuilder_connection

session = get_nationbuilder_connection()
BAD_EMAIL_LIST_ID = 1527
SPAM_EMAIL_LIST_ID = 1526

"""
Script to add spam and bad users to lists:
(1) add spam emails to a list, using a CSV of spam users.
(2) add bad users to a list, using a CSV of 'corrected' emails.
Generate output files detailing the actions taken.
"""

with open('spam_emails.csv') as spam_emails, open('spam_outf.csv', 'w+') as outf:
    csv_reader = csv.DictReader(spam_emails, delimiter=',')
    fieldnames = ["email", "status"]
    csv_writer = csv.DictWriter(outf, fieldnames)
    csv_writer.writeheader()
    for index, row in enumerate(csv_reader):
        email = row['email']
        res_get = session.get(f"/api/v1/people/match?email={email}")
        if res_get.status_code == 200:
            res_get_data = res_get.json()
            id = res_get_data["person"]["id"] if "person" in res_get_data else res_get_data["id"]
            try:
                headers = {'Content-type': 'application/json', 'Accept': 'application/json'}
                ids = [id]
                data = json.dumps({"people_ids": ids})
                res_put = session.post(f"/api/v1/lists/{SPAM_EMAIL_LIST_ID}/people", data=data, headers=headers)
                if res_put.status_code == 204:
                    status = "Success - Added to list"
                else:
                    status = f"Failed - post failure. {res_put}. {res_put.text}"
            except Exception as e:
                status = f"Failed - exception: {e}"
            csv_writer.writerow(dict(email=email, status=status))
        else:
            status="Could not find email in nationbuilder"
            csv_writer.writerow(dict(email=email, status=status))
# corrected emails
with open('corrected_emails.csv') as corrected_emails, open('spam_bademails_outf.csv', 'w+') as outf:
    csv_reader = csv.DictReader(corrected_emails, delimiter=',')
    fieldnames = ["correct_email", "first", "last", "incorrect_email", "nb_id", "status", "name_retrieved_from"]
    csv_writer = csv.DictWriter(outf, fieldnames)
    csv_writer.writeheader()
    fieldnames = csv_reader.fieldnames
    for index, row in enumerate(csv_reader):
        first_name = row['first']
        last_name = row['last']
        email = row['correct_email']
        name_retrieved_from = "Spreadsheet"
        status = ""
        if "?" in first_name or "?" in last_name:
            # find user with the correct email & set names
            name_retrieved_from = "Email lookup on Nationbuilder"
            try:
                res_get = session.get(f"/api/v1/people/match?email={email}")
                if res_get.status_code == 200:
                    res_get_data = res_get.json()
                    first_name = res_get_data["person"]["first_name"] if "person" in res_get_data else res_get_data["first_name"]
                    last_name = res_get_data["person"]["last_name"] if "person" in res_get_data else res_get_data["last_name"]
                else:
                    status = "Failed - No name provided and email not found in NB"
            except Exception as e:
                status = "Failed - Exception looking up first/last name on nationbuilder {}".format(e)
        # find users with this name that do not share email, were created in june of 2022, and only have 1 tag
        if "Failed" not in status:
            try:
                res_get = session.get(f"/api/v1/people/search?first_name={first_name}&last_name={last_name}")
                if res_get.status_code == 200:
                    res_get_data = res_get.json()
                    bad_emails = []
                    for result in res_get_data["results"]:
                        if result["email"] != email and result["created_at"].startswith("2022-06") and len(result["tags"]) == 1:
                            bad_emails.append({"email": result["email"], "nb_id": result["id"]}) # add email to list
                    if len(bad_emails) == 0:
                        status = "Failed - No alternate emails found for user email / name"
                    else:
                        try:
                            headers = {'Content-type': 'application/json', 'Accept': 'application/json'}
                            ids = [bad_email["nb_id"] for bad_email in bad_emails]
                            data = json.dumps({"people_ids": ids})
                            print(ids)
                            print(data)
                            res_put = session.post(f"/api/v1/lists/{BAD_EMAIL_LIST_ID}/people", data=data, headers=headers)
                            if res_put.status_code == 204:
                                status = "Success - Added to list"
                                for bad_email in bad_emails:
                                    csv_writer.writerow(dict(correct_email=email, first=first_name, last=last_name, incorrect_email=bad_email["email"], nb_id=bad_email["nb_id"],\
                                        status=status, name_retrieved_from=name_retrieved_from))
                            else:
                                status = f"Failed - post failure. {res_put.request}"
                        except Exception as e:
                            status = f"Failed - Could not add user {first_name} {last_name} with email {email} to bad email list. Exception: {e}. Bad Emails: {bad_emails}"
            except Exception as e:
                status = f"Failed - Could not find user with name {first_name} {last_name}. Exception: {e}"
        
        if "Failed" in status:
            incorrect_email = "See Status" if "Bad Emails:" in status else "N/A"
            csv_writer.writerow(dict(correct_email=email, first=first_name, last=last_name, incorrect_email=incorrect_email,\
                                        status=status, name_retrieved_from=name_retrieved_from))
