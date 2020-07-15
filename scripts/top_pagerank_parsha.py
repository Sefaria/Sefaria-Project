import codecs
import json
import re
import unicodecsv
from collections import defaultdict
import heapq
import math as mathy
import django
django.setup()

from sefaria.model import *
from sefaria.system.exceptions import InputError


def argmax(iterable, n=1):
    if n == 1:
        return max(enumerate(iterable), key=lambda x: x[1])[0]
    else:
        return heapq.nlargest(n, range(len(iterable)), iterable.__getitem__)

ref2parsha = {}
parsha2pr = defaultdict(list)
for i in library.get_indexes_in_category("Torah", full_records=True):
    parshiot = i.alt_structs["Parasha"]["nodes"]
    for p in parshiot:
        r = Ref(p["wholeRef"])
        for pasuk in r.range_list():
            ref2parsha[pasuk.normal()] = p["sharedTitle"]

my_csv = []
with codecs.open("../static/sheetrank.json", "rb", encoding="utf8") as fin:
    sheetrank = json.load(fin, encoding="utf8")
with codecs.open("../static/pagerank.json", "rb", encoding="utf8") as fin:
    jin = json.load(fin, encoding="utf8")
    for ii, (tref, pr) in enumerate(jin):
        if ii % 1000 == 0:
            print(ii)
        try:
            oref = Ref(tref)
            if len(oref.text("he").text) == 0:
                continue
            new_pr = mathy.log(pr) + 20
            sheet_pr = (1.0 + sheetrank[tref]["count"] / 5)**2 if tref in sheetrank else (1.0 / 5) ** 2
            my_csv += [{"Ref": tref, "PR": new_pr * sheet_pr}]
        except InputError:
            continue


with open("../static/all_pagerank.csv", "wb") as fout:
    my_csv.sort(key=lambda x: Ref(x["Ref"]).order_id())
    c = unicodecsv.DictWriter(fout, ["Ref", "PR"])
    c.writeheader()
    c.writerows(my_csv)