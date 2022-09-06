"""
Give every user a profile URL based on their name
"""

import os
import sys

from django.contrib.auth.models import User
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db

p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")
os.environ["DJANGO_SETTINGS_MODULE"] = "settings"


db.profiles.ensure_index("slug")

users = User.objects.all()

for user in users:
    profile = UserProfile(id=user.id)
    profile.assign_slug().save()
