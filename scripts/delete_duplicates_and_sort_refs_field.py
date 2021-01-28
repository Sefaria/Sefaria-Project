import django
django.setup()
from sefaria.model import *
from sefaria.system.database import db
import sys
import csv


with open("duplicates.csv", 'r') as f:
    reader = csv.reader(f)
    for i, row in enumerate(reader):
        if i % 50 == 0:
            print(i)
        refs = eval(row[0])
        set_of_this_link = LinkSet({"$or": [{"refs": refs}, {"refs": [refs[1], refs[0]]}]})
        for i, l in enumerate(set_of_this_link.array()):
            if i == 0:
                pass
            else:
                l.delete()

print("Deleted duplicates")


col, args, kwargs = ('links', [[("refs.0",  1), ("refs.1", 1)]], {"unique": True})
getattr(db, col).create_index(*args, **kwargs)
print("Created unique field on link refs")


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

print("Sorted refs on each link")