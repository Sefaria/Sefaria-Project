# encoding=utf-8

import os
import unicodecsv
from sefaria.model import *
from sefaria.system import exceptions

filename = os.path.join(os.path.dirname(__file__), '../data/tmp/Version Titles - versionTitles.tsv')
with open(filename) as infile:
    reader = unicodecsv.DictReader(infile, delimiter='\t')

    for row in reader:
        vset = VersionSet({'versionTitle': row['English']})
        for v in vset:
            if row['Hebrew']:
                v.versionTitleInHebrew = row['Hebrew']
                try:
                    v.save()
                except exceptions.BookNameError as e:
                    print("{} has no Index".format(v.versionTitle))
                    print(e.message)



