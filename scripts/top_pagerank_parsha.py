import codecs
import json
import re
from collections import defaultdict
import heapq
import django
django.setup()

from sefaria.model import *


def argmax(iterable, n=1):
    if n == 1:
        return max(enumerate(iterable), key=lambda x: x[1])[0]
    else:
        return heapq.nlargest(n, xrange(len(iterable)), iterable.__getitem__)

ref2parsha = {}
parsha2pr = defaultdict(list)
for i in library.get_indexes_in_category("Torah", full_records=True):
    parshiot = i.alt_structs["Parasha"]["nodes"]
    for p in parshiot:
        r = Ref(p["wholeRef"])
        for pasuk in r.range_list():
            ref2parsha[pasuk.normal()] = p["sharedTitle"]

with codecs.open("../static/pagerank.json", "rb", encoding="utf8") as fin:
    jin = json.load(fin, encoding="utf8")
    for tref, pr in jin:
        oref = Ref(tref)
        if oref.primary_category == "Tanakh" and oref.index.categories[1] == "Torah":
            try:
                p = ref2parsha[oref.normal()]
                parsha2pr[p] += [[tref, pr]]
            except KeyError:
                pass

for p, pr_list in parsha2pr.items():
    argmax_pr = set(argmax([pr for tref, pr in pr_list], n=10))
    parsha2pr[p] = sorted(map(lambda x: x[1], filter(lambda x: x[0] in argmax_pr, enumerate(pr_list))), key=lambda x: x[1], reverse=True)

with codecs.open("../static/top_pagerank_parsha.json", "wb", encoding="utf8") as fout:
    json.dump(parsha2pr, fout, ensure_ascii=False, indent=2, encoding="utf8")