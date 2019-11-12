import sys
import os
import pymongo

from sefaria.settings import *
from sefaria.system.database import db
from sefaria.model.user_profile import UserProfile
from django.contrib.auth.models import User


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
