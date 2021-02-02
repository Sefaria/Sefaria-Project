import django
django.setup()
from sefaria.model import *
print("Sorting refs on each link...")
i = 0
start = 0
for l in LinkSet():
    i += 1
    if i % 10000 == 0:
        print(i)
    if i < start:
        continue
    sorted_refs = sorted(l.refs)
    if l.refs != sorted_refs:
        l._skip_lang_check = True
        l._skip_expanded_refs_set = True
        expandedRefs0 = l.expandedRefs0
        l.expandedRefs0 = l.expandedRefs1
        l.expandedRefs1 = expandedRefs0
        l.refs = sorted_refs
        try:
            l.save()
        except:
            print(l.contents())

