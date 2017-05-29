import os

from django.contrib.auth.models import User

User.objects.create_user(username='Test User',
                         email=os.environ["SEFARIA_TEST_USER"],
                         password=os.environ["SEFARIA_TEST_PASS"])

users = User.objects.all()
user = users[0]
if user.email == os.environ["SEFARIA_SUPERUSER"]:
    user.username = "Test Super User"
    user.set_password(os.environ["SEFARIA_SUPERPASS"])
