import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sefaria.settings')
import django
django.setup()

from django.contrib.auth.models import User
user = User.objects.get(username="your_username") # username is the last row in your sqlite db (something like this : DMX4q55i9WY0ZeqUevXacMq7V0We88)
user.is_staff = True
user.is_superuser = True
user.save()