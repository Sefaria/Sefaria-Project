import django
django.setup()
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db
from sefaria.client.util import get_by_tag, nationbuilder_get_all, update_user_flags

# Get list of sustainers
sustainers = {profile["id"]: profile for profile in db.profiles.find({"is_sustainer": True})}
added_count = 0
removed_count = 0
no_profile_count = 0
already_synced_count = 0

for nationbuilder_sustainer in nationbuilder_get_all(get_by_tag, ['sustainer_current_engineering']):
    
    nationbuilder_sustainer_profile = UserProfile(email=nationbuilder_sustainer['email']) 

    if (nationbuilder_sustainer_profile.id != None): # has user profile
        existing_sustainer = sustainers.get(nationbuilder_sustainer_profile.id) is not None

        if existing_sustainer: # remove sustainer from dictionary; already synced
            del sustainers[nationbuilder_sustainer_profile.id]
            already_synced_count += 1
        else: # add new sustainer to db
            update_user_flags(nationbuilder_sustainer_profile, "is_sustainer", True)
            added_count += 1
    else:
        no_profile_count += 1

for sustainer_to_remove in sustainers:
    profile = UserProfile(sustainer_to_remove)
    update_user_flags(profile, "is_sustainer", False)
    removed_count += 1

print("added: {}".format(added_count))
print("removed: {}".format(removed_count))
print("no_profile: {}".format(no_profile_count))
print("already synced: {}".format(already_synced_count))
