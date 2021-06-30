import django
django.setup()
from sefaria.tracker import update
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db
from sefaria.client.util import get_by_tag, nationbuilder_get_all
import sys

def update_user_flags(profile, isSustainer): 
    # profile = UserProfile(email=email)
    profile.update({"is_sustainer": isSustainer})
    profile.save()

# Get list of sustainers
sustainers = list(db.profiles.find({"is_sustainer": True}))
added_count = 0
removed_count = 0
no_profile_count = 0
already_synced_count = 0

# try:

for nationbuilder_sustainer in nationbuilder_get_all(get_by_tag, ['sustainer_current_engineering']): #TODO change to real tag name
    
    nationbuilder_sustainer_profile = UserProfile(email=nationbuilder_sustainer['email'])

    # TODO: figure out what to do with null ids and null slugs?
    if (nationbuilder_sustainer_profile.id != None): #has user profile
        existing_sustainer = [x for x in sustainers if x['id'] and x['id'] == nationbuilder_sustainer_profile.id]
        
        if len(existing_sustainer) != 1: # add to sustainers
            update_user_flags(nationbuilder_sustainer_profile, True)
            added_count += 1
        else:
            sustainers.remove(existing_sustainer[0]) # already synced
            already_synced_count += 1

    else:
        no_profile_count += 1

# Remove no-longer-sustainers
for sustainer_to_remove in sustainers:
    profile = UserProfile(id=sustainer_to_remove['id'])
    update_user_flags(profile, False)
    removed_count += 1

print("completed!")

# except:
    # print('ERROR!')
    # print(sys.exc_info()[0])
#     # TODO handle error

# finally:
print("added: " + str(added_count))
print("removed: " + str(removed_count))
print("no_profile: " + str(no_profile_count))
print("already synced: " + str(already_synced_count))
