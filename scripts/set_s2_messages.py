# -*- coding: utf-8 -*-
# Put a Welcome to S2 message in the profile of every existing user

from sefaria.model import *
from sefaria.system.database import db

profiles = db.profiles.find()

for profile in profiles:
    profile["interrupting_messages"] = ["welcomeToS2LoggedIn"]
    db.profiles.save(profile)