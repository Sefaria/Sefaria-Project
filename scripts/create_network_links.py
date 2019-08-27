# encoding=utf-8
import django
django.setup()

from sefaria.model import *
from sefaria.system.database import db
from sefaria.system.exceptions import PartialRefInputError, InputError


def expand_passages(refs):
    ps = PassageSet({"ref_list": {"$in": refs}})
    return [oref.normal() for p in ps for oref in Ref(p.full_ref).all_segment_refs()] if len(ps) else refs


db.linknet.drop()
records = []

ls = LinkSet()
total = ls.count()
print "{} Links".format(total)
successful = 0
failed = 0
concurrent = 0
current = 0
for link in ls:
    current += 1
    if current % 100000 == 0:
        print "{}/{}".format(current, total)
        db.linknet.insert_many(records)
        records = []

    try:
        r0 = Ref(link.refs[0])
        r1 = Ref(link.refs[1])
    except (PartialRefInputError, InputError):
        failed += 1
        continue

    try:
        try:
            y0 = int(r0.index.compDate) - int(getattr(r0.index, "errorMargin", 0))
        except ValueError:
            y0 = int(r0.index.compDate)
        try:
            y1 = int(r1.index.compDate) - int(getattr(r1.index, "errorMargin", 0))
        except ValueError:
            y1 = int(r1.index.compDate)
    except (AttributeError, TypeError, ValueError):
        failed += 1
        continue

    try:
        obj0 = {
            "orig_ref": r0.normal(),
            "refs" : expand_passages(link.expandedRefs0) if r0.index.categories[0] == "Talmud" else link.expandedRefs0,
            "year": y0,
            "cat": r0.index.categories[0]
        }
        obj1 = {
            "orig_ref": r1.normal(),
            "refs": expand_passages(link.expandedRefs1) if r1.index.categories[0] == "Talmud" else link.expandedRefs1,
            "year": y1,
            "cat": r1.index.categories[0]
        }

        if y0 == y1:
            concurrent += 1
            continue
        early, late = (obj0, obj1) if y0 < y1 else (obj1, obj0)

        records += [{
            "early_orig_ref": early["orig_ref"],
            "early_refs": early["refs"],
            "early_year": early["year"],
            "early_category": early["cat"],
            "late_orig_ref": late["orig_ref"],
            "late_refs": late["refs"],
            "late_year": late["year"],
            "late_category": late["cat"]
        }]

        successful += 1

    except AttributeError as e:
        failed += 1


print
print "Succeeded {} ({} Failed, {} concurrent)".format(successful, failed, concurrent)
db.linknet.insert_many(records)



