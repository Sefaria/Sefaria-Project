import django
django.setup()
from sefaria.system.database import db
from sefaria.model.user_profile import UserProfile
from datetime import date
import csv

if __name__ == '__main__':
    no_sf = db.profiles.find({"sf_app_user_id": {"$exists": 0}})
    with open(f'{date.today().strftime("%Y_%m_%d")}_not_in_sf.csv', "w+") as outf:
        fieldnames = ["id", "email", "first", "last", "slug"]
        csv_writer = csv.DictWriter(outf, fieldnames)
        csv_writer.writeheader()
        for profile in no_sf:
            outr = {}
            user_profile = UserProfile(id=profile["id"])
            outr["id"] = user_profile.id
            outr["email"] = user_profile.email
            outr["first"] = user_profile.first_name
            outr["last"] = user_profile.last_name
            outr["slug"] = user_profile.slug
            csv_writer.writerow(outr)
