import django

django.setup()

from collections import defaultdict

from sefaria.model.link import LinkSet
from sefaria.model.text import Ref

ls = LinkSet({"refs": {"$regex": "-.*:"}})

categories = defaultdict(int)
texts = defaultdict(int)

print(f"{ls.count()} spanning links")


def count_ref(oref):
    categories[oref.primary_category] += 1
    texts[oref.book] += 1


for link in ls:
    oref1 = Ref(link.refs[0])
    oref2 = Ref(link.refs[1])
    if oref1.is_spanning():
        count_ref(oref2)
    if oref2.is_spanning():
        count_ref(oref1)

print("CATEGORIES")
for key in categories:
    print(f"{key}: {categories[key]}")

print("TEXTS")
for key in texts:
    print(f"{key}: {texts[key]}")
