import django
django.setup()
from sefaria.model import *
from sefaria.system.database import db

already_found = []
print("Finding duplicates...")
duplicates = []
i = 0
for l in LinkSet():
    i += 1
    if i % 10000 == 0:
        print(i)
    set_of_this_link = LinkSet({"$or": [{"refs": l.refs}, {"refs": [l.refs[1], l.refs[0]]}]})
    if set_of_this_link.count() > 1:
        refs = sorted(l.refs)
        if refs not in already_found:
            duplicates.append(refs)
            already_found.append(refs)

print("Deleting duplicates...")

for i, refs in enumerate(duplicates):
    if i % 50 == 0:
        print(i)
    set_of_this_link = LinkSet({"$or": [{"refs": refs}, {"refs": [refs[1], refs[0]]}]})
    for i, l in enumerate(set_of_this_link.array()):
        if i == 0:
            pass
        else:
            l.delete()

col, args, kwargs = ('links', [[("refs.0",  1), ("refs.1", 1)]], {"unique": True})
print("Creating unique field on link refs...")
getattr(db, col).create_index(*args, **kwargs)

