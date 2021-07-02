import django
django.setup()
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db
from sefaria.client.util import get_by_tag, nationbuilder_get_all

def update_user_flags(profile, isSustainer): 
    profile.update({"is_sustainer": isSustainer})
    profile.save()

# Get list of sustainers
sustainers = list(db.profiles.find({"is_sustainer": True}))
added_count = 0
removed_count = 0
no_profile_count = 0
already_synced_count = 0

for nationbuilder_sustainer in nationbuilder_get_all(get_by_tag, ['sustainer_current_engineering']):
    
    nationbuilder_sustainer_profile = UserProfile(email=nationbuilder_sustainer['email']) 

    if (nationbuilder_sustainer_profile.id != None): # has user profile
        existing_sustainer = [x for x in sustainers if x['id'] and x['id'] == nationbuilder_sustainer_profile.id]
        
        if len(existing_sustainer) != 1: 
            update_user_flags(nationbuilder_sustainer_profile, True)
            added_count += 1
        else:
            sustainers.remove(existing_sustainer[0]) 
            already_synced_count += 1

    else:
        no_profile_count += 1

for sustainer_to_remove in sustainers:
    profile = UserProfile(id=sustainer_to_remove['id'])
    update_user_flags(profile, False)
    removed_count += 1

print("added: {}".format(added_count))
print("removed: {}".format(removed_count))
print("no_profile: {}".format(no_profile_count))
print("already synced: {}".format(already_synced_count))
