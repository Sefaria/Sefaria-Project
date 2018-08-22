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

p = UserProfile(id=u.id)
p.mark_interrupting_message_read('newUserWelcome')
