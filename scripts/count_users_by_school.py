import sys
import os
import csv

from django.contrib.auth.models import User

from sefaria.settings import *
from sefaria.system.database import db

cfile = "./data/private/schools.csv"


file1 = open(cfile, 'rb')
reader = csv.reader(file1)
header = next(reader)
if len(header) == 14:
  new_row = header
else:
  new_row = header + ["# Sefaria Accounts"]
new_rows_list = [new_row]

all_users_found = []
for row in reader:
  name = row[0]
  users_by_name = [u["id"] for u in db.profiles.find({"organization": str(name)})] if name else []

  domain = row[1]
  users_by_domain = [u.id for u in User.objects.filter(email__endswith=domain)] if domain else []

  count = len(set(users_by_domain + users_by_name))

  all_users_found = list(set(all_users_found + users_by_domain + users_by_name))

  if len(users_by_domain) == 0 and len(users_by_name) > 0:
  	print("User found by name for %s that was not found by domain." % (name))

  if len(row) == 14:
    row[13] = count
    new_row = row
  else:
    new_row = row + [count]

  new_rows_list.append(new_row)
file1.close()

# Do the writing
file2 = open(cfile, 'wb')
writer = csv.writer(file2)
writer.writerows(new_rows_list)
file2.close()

print("%d total users found matching either domain or school name." % len(all_users_found))