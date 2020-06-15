import os
import django
django.setup()
from django.contrib.auth.models import User
from sefaria.model import UserProfile

users = User.objects.all()
user = users[0]
if 'SEFARIA_SUPERUSER' in os.environ and "SEFARIA_SUPERPASS" in os.environ:
    if user.email == os.environ["SEFARIA_SUPERUSER"]:
        user.username = os.environ["SEFARIA_SUPERUSER"]
        user.set_password(os.environ["SEFARIA_SUPERPASS"])
        user.save()

u = User.objects.create_user(os.environ["SEFARIA_TEST_USER"],
                             email=os.environ["SEFARIA_TEST_USER"],
                             password=os.environ["SEFARIA_TEST_PASS"])
u.first_name = "Testy"
u.last_name = "McTestUser"
u.save()

# slug only seems to be saved if you save profile twice. this is weird but seems to work consistently
p = UserProfile(id=u.id)
p.mark_interrupting_message_read('newUserWelcome')
p.settings["interface_language"] = "english"
p.slug = "testy-mctestuser"
print("Test User's name and slug")
print(p.full_name)
print(p.slug)
p.save()
p = UserProfile(id=u.id)
p.slug = "testy-mctestuser"
p.save()
p = UserProfile(id=u.id)
print("Test User's name and slug after save")
print(p.full_name)
print(p.slug)

