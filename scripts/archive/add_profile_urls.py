# -*- coding: utf-8 -*-
"""
Give every user a profile URL based on their name
"""

import sys
import os
import re

p = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, p)
sys.path.insert(0, p + "/sefaria")
os.environ['DJANGO_SETTINGS_MODULE'] = "settings"


from django.contrib.auth.models import User
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db

db.profiles.ensure_index("slug")

users  = User.objects.all()

for user in users:
	profile = UserProfile(id=user.id)
	profile.assign_slug().save()
