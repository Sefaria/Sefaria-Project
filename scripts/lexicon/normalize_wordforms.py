# -*- coding: utf-8 -*-

import unicodedata
import django
django.setup()

from sefaria.model import *


print("Normalizing Word Forms")

forms = WordFormSet()
for form in forms:
    print(form._id)
    form.form = unicodedata.normalize("NFC",form.form)
    for i,l in enumerate(form.lookups):
        form.lookups[i]["headword"] = unicodedata.normalize("NFC", form.lookups[i]["headword"])
    form.save()


print("Normalizing Lexicon Entries")

lexset = LexiconEntrySet()
for entry in lexset:
    print(entry._id)
    entry.headword = unicodedata.normalize("NFC",entry.headword)
    entry.save()
