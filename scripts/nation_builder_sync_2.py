import django
django.setup()
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db
from sefaria.helper.nationbuilder import get_everyone, nationbuilder_get_all

def add_sustainer_nationbuilder_ids():
# Add people in nationbuilder's ids
    added_count = 0
    no_profile_count = 0
    already_synced_count = 0

    for nationbuilder_user in nationbuilder_get_all(get_everyone):
        
        user_profile = UserProfile(email=nationbuilder_user['email']) 

        if (user_profile.id != None): # has user profile
            nationbuilder_id = nationbuilder_user["person"]["id"] if "person" in nationbuilder_user else nationbuilder_user["id"]
            if user_profile.nationbuilder_id != nationbuilder_id:
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
    for profile in db.profiles.find({"nationbuilder_id": { "$exists": False}}):
        # TODO: write code to add to nationbuilder
        print(profile)

add_sustainer_nationbuilder_ids()
