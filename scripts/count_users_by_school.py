import sys
import os
import csv

from sefaria.settings import *
from django.contrib.auth.models import User

cfile = "./data/private/schools.csv"


file1 = open(cfile, 'rb')
reader = csv.reader(file1)
header = reader.next()
if len(header) == 14:
  new_row = header
else:
  new_row = header + ["# Sefaria Accounts"]
new_rows_list = [new_row]

for row in reader:
  domain = row[1]
  if domain:
  	count = len(User.objects.filter(email__endswith=domain))
  else:
  	count = ""

  if len(row) == 14:
    row[12] = count
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