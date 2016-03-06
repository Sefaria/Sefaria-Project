# -*- coding: utf-8 -*-
from sefaria.model import *


word_forms = WordFormSet({})

for form in word_forms:
    for lookup in form.lookups:
        if 'lexicon' in lookup:
            lookup['parent_lexicon'] = lookup['lexicon']
            del lookup['lexicon']
    form.save()