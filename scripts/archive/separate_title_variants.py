"""
Ensure that Hebrew and English Title variants are in the correct field.
"""
from sefaria.model import *
from sefaria.utils.tibetan import has_tibetan

indices = IndexSet({})
for index in indices:
    en = []
    he = []
    variants = index.titleVariants + getattr(index, "heTitleVariants", [])
    for variant in variants:
        if has_tibetan(variant):
            he.append(variant)
        else:
            en.append(variant)

    if set(index.titleVariants) != set(en):
        print(index.title)
        print(index.titleVariants)
        print(en)
        
    index.titleVariants   = list(set(en))
    index.heTitleVariants = list(set(he))
    index.save()
