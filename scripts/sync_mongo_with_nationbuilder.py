import django
django.setup()
import time
import json
import sys

from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db
from sefaria.helper.nationbuilder import delete_from_nationbuilder_if_spam, get_everyone, nationbuilder_get_all, get_nationbuilder_connection, update_person, create_person, delete_from_nationbuilder_if_spam
from django.contrib.auth.models import User

"""
Run this script once to update mongo profiles with nationbuilder ids and remove existing spam profiles from nationbuilder
--mongo-only -- Only update Mongo; don't update Nationbuilder (don't remove spam profiles)
"""

def add_nationbuilder_id_to_mongo(mongo_only):
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
                if not mongo_only:
                    delete_from_nationbuilder_if_spam(user_profile.id, nationbuilder_id)
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
mongo_only = False
i = 1
while(i < len(sys.argv)):
    if sys.argv[i] == "--mongo-only":
        mongo_only = True
    i+=1
    
add_nationbuilder_id_to_mongo(mongo_only)
if not mongo_only:
    add_profiles_to_nationbuilder()