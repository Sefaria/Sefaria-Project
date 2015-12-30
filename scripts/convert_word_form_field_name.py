# -*- coding: utf-8 -*-


from sefaria.model import *


word_forms = WordFormSet({'lookups.lexicon': {'$exists': True}})

for wf in word_forms:
    for i, lookup in enumerate(wf.lookups):
        new_lookup = lookup
        lookup['parent_lexicon'] = lookup['lexicon']
        del new_lookup['lexicon']
        wf.lookups[i] = new_lookup
    wf.save()


