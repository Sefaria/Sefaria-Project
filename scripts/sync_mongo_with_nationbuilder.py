import django
django.setup()
import time
import json

from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db
from sefaria.helper.nationbuilder import get_everyone, nationbuilder_get_all, get_nationbuilder_connection, update_person, create_person
from django.contrib.auth.models import User

def add_nationbuilder_id_to_mongo():
    """
    Adds existing nationbuilder account ids to mongo profiles collection
    """
    added_count = 0
    no_profile_count = 0
    already_synced_count = 0
    for nationbuilder_user in nationbuilder_get_all(get_everyone):
        user_profile = UserProfile(email=nationbuilder_user['email']) 
        if (user_profile.id != None): # has user profile
            nationbuilder_id = nationbuilder_user["person"]["id"] if "person" in nationbuilder_user else nationbuilder_user["id"]
            if User.objects.get(id=user_profile.id).is_active == False: # delete spam users
                session = get_nationbuilder_connection()
                r = session.get(update_person(nationbuilder_id))
                try:
                    tags = r.json()["person"]["tags"].filter(lambda x: x.lower() not in ["announcements_general_hebrew", "announcements_general", "announcements_edu_hebrew", "announcements_edu", "signed_up_on_sefaria"]) # tags that aren't auto signup
                    if len(tags) == 0:
                        session.delete(update_person(nationbuilder_id))
                    else:
                        print(f"{user_profile.id} not deleted -- has tags {','.join(tags)}")
                except Exception as e:
                    print(f"Failed to delete {user_profile.id}. Error: {e}")
            elif user_profile.nationbuilder_id != nationbuilder_id: # add nb id to mongo
                user_profile.nationbuilder_id = nationbuilder_id
                user_profile.save()
                added_count += 1
            else:
                already_synced_count += 1
        else:
            no_profile_count += 1

    print("added/updated: {}".format(added_count))
    print("no_profile: {}".format(no_profile_count))
    print("already synced: {}".format(already_synced_count))

def add_profiles_to_nationbuilder():
    """
    Adds mongo profiles without corresponding mongo account to nationbuilder
    """
    session = get_nationbuilder_connection()
    for profile in db.profiles.find({"nationbuilder_id": { "$exists": False}}):
        user_profile = UserProfile(id=profile["id"])
        if User.objects.get(id=user_profile.id).is_active == True:
            for attempt in range(0,3):
                try:
                    res = session.post(create_person, json.dumps({
                        "person": {
                            "email": user_profile.email,
                            "first_name": user_profile.first_name,
                            "last_name": user_profile.last_name,
                            "tags": ["Signed_Up_on_Sefaria"]
                        }
                    }))
                    res_data = res.json()
                    nationbuilder_id = res_data["person"]["id"] if "person" in res_data else res_data["id"]
                    user_profile.nationbuilder_id = nationbuilder_id
                    user_profile.save()
                except Exception as e:
                    time.sleep(5)
                    session = get_nationbuilder_connection()
                    print("Trying again to create nationbuilder user of mongo user id: {}. Attempts: {}. Exception: {}".format(user_profile.id,attempt+1, e))
            else:
                session.close()
                raise Exception("Error when attempting to create nb user")


# TODO: handle changed emails? Think this through re: crm

add_nationbuilder_id_to_mongo()
add_profiles_to_nationbuilder()