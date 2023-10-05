import django
django.setup()
import time

from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db
from sefaria.helper.crm.nationbuilder import get_everyone, get_person_by_email, nationbuilder_get_all, get_nationbuilder_connection, \
    create_person, delete_from_nationbuilder_if_spam
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

def add_profiles_to_nationbuilder(gt=0):
    """
    Adds mongo profiles without corresponding mongo account to nationbuilder.
    If account exists add nb id to mongo.
    """
    session = get_nationbuilder_connection()
    for profile in db.profiles.find({"nationbuilder_id": { "$exists": False}, "id": {"$gt": gt}}):
        user_profile = UserProfile(id=profile["id"])
        try:
            active_user =  User.objects.get(id=user_profile.id).is_active
        except:
            active_user = False
            print("Failed to get user: " + str(user_profile.id))
        if active_user == True:
            for attempt in range(0,3):
                try:
                    res_get = session.get(get_person_by_email(user_profile.email))
                    if res_get.status_code == 200:
                        res_get_data = res_get.json()
                        nationbuilder_id = res_get_data["person"]["id"] if "person" in res_get_data else res_get_data["id"]
                        user_profile.nationbuilder_id = nationbuilder_id
                        user_profile.save()
                        # update nb_id
                    else:
                        res = session.post(create_person(), json={
                            "person": {
                                "email": user_profile.email,
                                "first_name": user_profile.first_name,
                                "last_name": user_profile.last_name,
                                "tags": ["Signed_Up_on_Sefaria"]
                            }
                        })
                        res_data = res.json()
                        try:
                            nationbuilder_id = res_data["person"]["id"] if "person" in res_data else res_data["id"]
                            user_profile.nationbuilder_id = nationbuilder_id
                            user_profile.save()
                            print("added user with nationbuilder_id: " + str(nationbuilder_id))
                        except:
                            print("failed to save added user: " + user_profile.email)
                            print(res_data)
                    break
                except Exception as e:
                    time.sleep(5)
                    session = get_nationbuilder_connection()
                    print("Trying again to create nationbuilder user of mongo user id: {}. Attempts: {}. Exception: {}".format(user_profile.id,attempt+1, e))
            else:
                session.close()
                raise Exception("Error when attempting to create nb user")


# # TODO: handle changed emails? Think this through re: crm
# mongo_only = False
# nonexistent_nb_id_only = False
# i = 1
# while(i < len(sys.argv)):
#     if sys.argv[i] == "--mongo-only":
#         mongo_only = True
#     elif sys.argv[i] == "--sync-only":
#         nonexistent_nb_id_only = True
#     i+=1

# # TODO comment out before mergin to master
# if mongo_only:
#     print("MONGO ONLY")
    
# if nonexistent_nb_id_only:
#     print("Add nonexistend nb id Only")
#     add_profiles_to_nationbuilder()
# else:
#     add_nationbuilder_id_to_mongo(mongo_only)
#     if not mongo_only:
#         add_profiles_to_nationbuilder()
