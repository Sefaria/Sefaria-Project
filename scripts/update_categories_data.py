# -*- coding: utf-8 -*-
import django
django.setup()

import csv
import requests

from sefaria.model import *

"""
0 Category
1 English Description
2 Hebrew Description
3 Short English Description
4 Short Hebrew Description
"""

url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSx60DLNs8Dp0l2xpsPjrxD3dBpIKASXSBiE-zjq74SvUIc-hD-mHwCxsuJpQYNVHIh7FDBwx7Pp9zR/pub?gid=1537266127&single=true&output=csv'
response = requests.get(url)
lines = str.splitlines(response.text)
cr = csv.reader(lines)

next(cr)
for l in cr:
    path = l[0].split(",")
    c = Category().load({"path": path})
    if not c:
    	print("Unknown Category: {}".format(path))
    	continue
    print(path)
    c.enDesc      = l[1].strip()
    c.heDesc      = l[2].strip()
    c.enShortDesc = l[3].strip()
    c.heShortDesc = l[4].strip()
    c.save()