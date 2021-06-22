import django
django.setup()
from sefaria.tracker import update
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db
from sefaria.client.util import get_by_tag, nationbuilder_get_all

def update_user_flags(email, isSustainer): 
    profile = UserProfile(email=email)
    profile.update({"is_sustainer": isSustainer})
    profile.save()

# Get list of sustainers
sustainers = list(db.profiles.find({"is_sustainer": "true"}))

for nationbuilder_sustainer in nationbuilder_get_all(get_by_tag, ['DONOR_Sustainer_2019']): #TODO change to real tag name
        
    existing_sustainer = next((x for x in sustainers if x.email == nationbuilder_sustainer['email']), None)
       
    if not existing_sustainer: # add to sustainers
        update_user_flags(nationbuilder_sustainer['email'], True)
    else:
        sustainers.remove(existing_sustainer) # already synced

# Remove no-longer-sustainers
for sustainer_to_remove in sustainers:
    update(sustainer_to_remove.email, False)

print("completed!")
