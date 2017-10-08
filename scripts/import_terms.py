# -*- coding: utf-8 -*-
import csv

from sefaria.model import Term
from sefaria.utils.util import titlecase


file = "data/tmp/terms_to_import.csv"

with open(file, 'rb') as tfile:
    terms = csv.reader(tfile)
    for row in terms:
        (he, count, en) = (row[0], row[1], row[2])
        en = titlecase(en)
        he = he.decode("utf-8")
        variants = row[3:]
        existing = Term().load_by_title(en)
        
        if existing:
            existing_he = existing.get_primary_title(lang="he")
            print en + " (existing term)"
            if existing_he != he:
                print u"!!! Existing term '%s' has a different Hebrew: %s / %s" % (en, existing_he, he)
            for variant in [titlecase(v) for v in variants]:
                if variant not in existing.get_titles():
                    existing.titles.append({
                        "lang": "en",
                        "text": variant
                    })
                    print "... added variant to existing term: " + variant
            try:
                existing.save()
            except Exception as e: 
                print "ERROR saving %s" % en
                print getattr(e, "message").encode("utf-8")     

        else:
            term = Term()
            term.name = en
            titles = [
                {
                    "lang": "en",
                    "text": en,
                    "primary": True
                },
                {
                    "lang": "he",
                    "text": he,
                    "primary": True
                }
            ]
            for variant in variants:
                if variant:
                    titles.append({
                        "lang": "en",
                        "text": variant
                    })
            term.set_titles(titles)
            try:
                term.save()
                print en + " (saved new term)"
            except Exception as e:
                print "ERROR saving %s" % en
                print getattr(e, "message").encode("utf-8")     
