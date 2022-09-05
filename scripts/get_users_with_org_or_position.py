import os
import sys

import pymongo
from django.contrib.auth.models import User

from sefaria.model.user_profile import UserProfile
from sefaria.settings import *
from sefaria.system.database import db

out = ""

users  = User.objects.all()

for user in users:
	profile = UserProfile(id=user.id)
	if profile.organization != "" or profile.position != "":
		out += "%s\t%s\t%s\t%s\t%s\n" % (user.email, user.first_name, user.last_name, profile.organization, profile.position)

print(out)

f = open('contacts.csv','w')
f.write(out.encode('utf-8'))
f.close() 
