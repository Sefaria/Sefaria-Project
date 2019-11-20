# -*- coding: utf-8 -*-
import django
django.setup()

from sefaria.model import *

import unicodecsv as csv

holidays_filename = './Topic Descriptions - Holidays.tsv'
parshiot_filename = './Topic Descriptions - Parshiyot.tsv'

# HOLIDAYS
# 0 Category
# 1 Topic
# 2 Copy
# 3 Hebrew Copy

# PARSHIYOT
# 0 Topic
# 1 Copy
# 2 Hebrew Copy


def set_descriptions(topic, en, he):
    term = Term().load_by_title(topic)
    if not term:
        print("No {}".format(topic))
        return
    term.description = {
        "en": en,
        "he": he
    }
    # print u"{}, {}, {}".format(topic,en,he)
    term.save()


with open(holidays_filename) as tsvfile:
    next(tsvfile)
    next(tsvfile)
    reader = csv.reader(tsvfile, delimiter='\t')
    for row in reader:
        set_descriptions(row[1],row[2],row[3])

with open(parshiot_filename) as tsvfile:
    next(tsvfile)
    next(tsvfile)
    reader = csv.reader(tsvfile, delimiter='\t')
    for row in reader:
        set_descriptions(row[0],row[1],row[2])
