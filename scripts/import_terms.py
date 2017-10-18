# -*- coding: utf-8 -*-
import csv

from sefaria.model import Term
from sefaria.utils.util import titlecase


file = "data/tmp/terms_to_import.csv"
he_filename = "data/tmp/he_terms_to_import.csv"

he_synonyms = {}
with open(he_filename, "rb") as he_file:
    next(he_file)
    lines = csv.reader(he_file)
    for row in lines:
        he_synonyms[row[0].decode("utf-8")] = [r.decode("utf-8") for r in row[1:] if r]

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
                if variant not in existing.get_titles("en"):
                    existing.add_title(variant, "en")
                    print "... added variant to existing term: " + variant

            if he_synonyms.get(he):
                for he_syn in he_synonyms.get(he):
                    if he_syn not in existing.get_titles("he"):
                        existing.add_title(he_syn, "he")


            try:
                existing.save()
            except Exception as e:
                print "ERROR saving %s" % en
                print getattr(e, "message").encode("utf-8")

        else:
            term = Term()
            term.name = en
            term.add_primary_titles(en, he)

            for variant in variants:
                if variant:
                    term.add_title(variant, "en")

            if he_synonyms.get(he):
                for he_syn in he_synonyms.get(he):
                    term.add_title(he_syn, "he")

            try:
                term.save()
                print en + " (saved new term)"
            except Exception as e:
                print "ERROR saving %s" % en
                print getattr(e, "message").encode("utf-8")     
