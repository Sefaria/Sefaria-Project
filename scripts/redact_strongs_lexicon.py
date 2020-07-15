# -*- coding: utf-8 -*-

import json
import django
django.setup()

from sefaria.model import *

suspect_words = [
    "Gospels",
    "Matthew",
    "Mark",
    "Luke",
    "John",
    "Acts",
    "Acts of the Apostles",
    "Epistles",
    "Romans",
    "Corinthians",
    "Galatians",
    "Ephesians",
    "Philippians",
    "Colossians",
    "Thessalonians",
    "Timothy",
    "Titus",
    "Philemon",
    "James",
    "Peter",
    "John",
    "Jude",
    "Apocalypse",
    "Revelation",
    "Christ",
    "Jesus",
    "Mary",
    "Messiah"
]

def suspect_word(definition):
    return any(i in definition for i in suspect_words)


def recurse_senses(senses):
    for subdict in senses:
        if "definition" in subdict:
            if suspect_word(subdict["definition"]):
                return subdict["definition"]
        if "senses" in subdict:
            return recurse_senses(subdict["senses"])
    return None



lex_entries = LexiconEntrySet({"parent_lexicon" : "BDB Augmented Strong"})
suspect_entries =[]
for entry in lex_entries:

    if "senses" not in entry.content:
        print("Entry {} doesnt have senses".format(entry.strong_number))
    else:
        if recurse_senses(entry.content["senses"]) is not None:
            suspect_entries.append(entry.strong_number)
            print("{}".format(entry.headword.encode("utf-8")))
print(suspect_entries)
query = {'strong_number': {'$in': suspect_entries }}
print(json.dumps(query))