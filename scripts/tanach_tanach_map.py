# -*- coding: utf-8 -*-
"""

"""
import json
import pprint
from sefaria.model import *
#TODO: before running again, make sure this works
base_titles = library.get_indexes_in_category("Tanakh")

tanach_dict = {}
for title in base_titles:
    tanach_dict[title] = {}

for title in base_titles:
    base = Ref(title)
    rashi = Ref("Rashi on " + title)
    current_rashi = rashi.first_available_section_ref().subref(1)
    while current_rashi:
        current_base = base.subref(current_rashi.sections[0:2])
        links = current_rashi.linkset().refs_from(current_rashi)
        for l in links:
            if l != current_base and l.index.categories[0] == "Tanakh" and (not l.is_dependant()) and l.is_segment_level():
                #print current_base.normal() + " ->  " + l.normal()
                if tanach_dict[title].get(current_base.normal()):
                    tanach_dict[title][current_base.normal()].append(l.normal())
                else:
                    tanach_dict[title][current_base.normal()] = [l.normal()]
                if not tanach_dict[l.index.title].get(l.normal()):
                    tanach_dict[l.index.title][l.normal()] = []
        current_rashi = current_rashi.next_segment_ref()



flat_results = []

def compare_refs(tref1, tref2):
    oref1 = Ref(tref1)
    oref2 = Ref(tref2)
    if oref1.precedes(oref2):
        return -1
    elif oref2.precedes(oref1):
        return 1
sum_edges = 0
sorted_base_titles = sorted(base_titles, key=lambda idx: library.get_index(idx).order[0])
for title in sorted_base_titles:
    book_links_dict = tanach_dict[title]
    sorted_verses = sorted(book_links_dict, cmp=compare_refs)
    for verse in sorted_verses:
        sum_edges += len(book_links_dict[verse])
        flat_results.append({"name": verse, "size":0, "imports":book_links_dict[verse]})

with open("../static/files/tanach_rashi_tanach.json", 'wb+') as out:
    json.dump(flat_results, out)

print(sum_edges)

#afters - order links by book and then internal book order

