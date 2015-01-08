# -*- coding: utf-8 -*-

from sefaria.model import *

structs = {}

terms = TermSet({"scheme": "Parasha"})
for term in terms:
    oref = Ref(term.ref)
    if not structs.get(oref.index.title):
        structs[oref.index.title] = []
    structs[oref.index.title].append({"sharedTitle": term.name, "to": term.ref})

for name, struct in structs.items():
    i = get_index(name)
    i.set_alt_structure("Parasha", AltStructure("Parasha", struct))
    i.save()
