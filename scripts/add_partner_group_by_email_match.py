# -*- coding: utf-8 -*-
import django
django.setup()

import sys
import os
import csv
import operator

from sefaria.model import *

from django.contrib.auth.models import User
from pprint import pprint


added_users = []
total_users = 0


with open('/school-lookup-data/schools.tsv') as tsvfile:
    reader = csv.reader(tsvfile, delimiter='\t')
    for row in reader:
        user_count = 0

        print("-----------------------------------------------------------------")
        print(("Searching for users from: %s with query '%s'" % (row[0], row[1])))
        users = User.objects.filter(email__contains=row[1])
        for user in users:
            user_count = user_count + 1
            print("Marking {} as {}".format(user.email, row[0]))
            profile = UserProfile(id=user.id)
            profile.partner_group = row[0]
            profile.save()

"""
        added_users.append({'school': row[0], 'user_count': user_count})
        total_users = total_users + user_count

added_users.sort(key=operator.itemgetter('user_count'), reverse=True)

pprint(added_users)
print total_users
"""