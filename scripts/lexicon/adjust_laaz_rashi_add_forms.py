# -*- coding: utf-8 -*-

import argparse
import re
import unicodecsv as csv
from fuzzywuzzy import process, fuzz
from fuzzywuzzy import utils as fuzzyutils
from sefaria.model import *


with open("data/tmp/laaz-rashi-adjust.csv", 'wb+') as outfile:
    result_csv = csv.reader(outfile, delimiter='@')
    next(result_csv, None)
    for result in result_csv:
        catane_number = result[0]
        headword = result[2]
        nref = Ref(result[3].split("/")[-1]).normal()
        matched_form = re.sub('[\)\(:]', '', result[4])
        match_level = result[5]
        if match_level in ["1", "*", "%"]:
            lookup = {
                    'headword' : headword,
                    'parent_lexicon' : 'Rashi Foreign Lexicon',
                    'catane_number'  : catane_number
            }
            wf = WordForm().load({'form': matched_form})
            if wf:
                if all(catane_number != lkup['catane_number'] for lkup in wf.lookups)
                    wf.lookups.append(lookup)
                wf.refs.append(nref)
            else:
                wf = WordForm({
                    'form': matched_form
                    'lookups' : [
                        lookup
                    ],
                    'refs':[nref]
                })
            #wf.save()
