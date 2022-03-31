import django
django.setup()
import sys
from sefaria.system.database import db
from sefaria.helper.nationbuilder import get_by_tag, nationbuilder_get_all, update_user_flags, get_everyone, nationbuilder_update_all_tags, get_nationbuilder_connection, update_person
from sefaria.model.user_profile import UserProfile
from sefaria.model.trend import setAllTrends

"""
Flags:
--trends-only - Only run trend updates, don't sync with nationbuilder
"""

# Get list of current sustainers from profiles
sustainers = {profile["id"]: profile for profile in db.profiles.find({"is_sustainer": True})}
added_count = 0
removed_count = 0
no_profile_count = 0
already_synced_count = 0

def sync_sustainers_to_mongo():
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

trends_only = False
if len(sys.argv) - 1 == 1:
    if sys.argv[1] == "--trends-only":
        trends_only = True

if not trends_only:
    sync_sustainers_to_mongo()
    setAllTrends()
    nationbuilder_update_all_tags()
else:
    setAllTrends()