# -*- coding: utf-8 -*-
from sefaria.model import *
import csv
import json

import regex as re

def remove_punctuation(text):
    return re.sub(r"\p{P}(?<!-)", "", text)

with open("/var/tmp/mishnah_term_coverage.csv", 'wb+') as outfile:
    result_csv = csv.writer(outfile, delimiter=',')
    results = {}
    mishnah_texts = VersionSet({"title": {"$regex" : '^Mishnah'}, "language": 'en'})
    for i, mishnah in enumerate(mishnah_texts,1):
        #print "%s) %s" % (i, mishnah.title)
        #capture a word between either of these tags
        term_regex = re.compile(r'(?:<i>|<em>)([^<]*?)(?:</i>|</em>)',re.UNICODE)
        for chn, chap in enumerate(mishnah.chapter, 1):
            for msn, mish in enumerate(chap, 1):
                matches = term_regex.findall(mish)
                for match in matches:
                    match = remove_punctuation(match.strip().lower())
                    if len(match):
                        if match in results:
                            results[match]['frequency'] += 1
                            if results[match]['in_lexicon'] is False:
                                results[match]['locations'].append(Ref("%s %s.%s" % (mishnah.title, chn, msn)).normal())
                        else:
                            wf = WordForm().load({'form': match})
                            if wf:
                                results[match] = {'in_lexicon' : True, 'frequency': 1}
                            else:
                                results[match] = {'in_lexicon' : False, 'locations': [Ref("%s %s.%s" % (mishnah.title, chn, msn)).normal()], 'frequency': 1}
    for result in sorted(results):
        row = [result.encode('utf-8'), results[result]['in_lexicon'], results[result]['frequency'],  ";".join(results[result]['locations']) if 'locations' in results[result] else '']
        result_csv.writerow(row)
    print(json.dumps(results, sort_keys=True))

