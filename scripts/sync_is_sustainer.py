import django
django.setup()
from django.contrib.auth.models import User
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db
from sefaria.client.util import get_by_tag, nationbuilder_get_all


def update_user_flags(profile, isSustainer): 
    profile.update({"is_sustainer": isSustainer})
    profile.save()

# Get list of sustainers
current_sustainers = list(db.profiles.find({"is_sustainer": True}))
added_count = 0
removed_count = 0
no_profile_count = 0
already_synced_count = 0

for nationbuilder_sustainers in nationbuilder_get_all(get_by_tag, ['sustainer_current_engineering']):
    # access email here
    nationbuilder_sustainer_profiles = User.objects.filter(email__in=[sustainer['email'] for sustainer in nationbuilder_sustainers])

    for nationbuilder_sustainer_with_profile in nationbuilder_sustainer_profiles:
        nationbuilder_sustainer_profile = UserProfile(email=nationbuilder_sustainer_with_profile.email) 
        if (nationbuilder_sustainer_profile.is_sustainer != True):
            update_user_flags(nationbuilder_sustainer_profile, True)
            added_count += 1
        else:
            current_sustainers.remove([current_sustainer for current_sustainer in current_sustainers if current_sustainer['id'] == nationbuilder_sustainer_with_profile.id][0]) 
            already_synced_count += 1
    
    no_profile_count += len(nationbuilder_sustainers) - len(nationbuilder_sustainer_profiles)

for sustainer_to_remove in current_sustainers:
    profile = UserProfile(id=sustainer_to_remove['id'])
    update_user_flags(profile, False)
    removed_count += 1

print("added: {}".format(added_count))
print("removed: {}".format(removed_count))
print("no_profile: {}".format(no_profile_count))
print("already synced: {}".format(already_synced_count))