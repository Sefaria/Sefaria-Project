# -*- coding: utf-8 -*-
import os
import csv
import django
django.setup()
from sefaria.model import *


PassageSet().delete()

for f in os.listdir("../data/sugyot"):
    if f.endswith(".csv"):
        print(f)
        cfile = os.path.join("../data/sugyot", f)
        with open(cfile, 'rb') as sfile:
            sugyot = csv.reader(sfile)
            next(sugyot)
            for row in sugyot:
                (ref, type) = row
                Passage({"full_ref": ref, "type": type}).save()
