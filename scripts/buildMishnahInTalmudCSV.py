from sefaria.model import *
from sefaria.model.schema import AddressTalmud
import csv

ls = LinkSet({"type":'mishnah in talmud'})
ds = []
for l in ls:
    talref, mref = [Ref(r) for r in l.refs]
    assert isinstance(talref, Ref)
    assert isinstance(mref, Ref)

    if not talref.is_talmud():
        talref, mref = mref, talref

    d = {
        "_order": talref.order_id(),
        "Book": talref.book,
        "Mishnah Chapter": mref.starting_ref().sections[0],
        "Start Mishnah": mref.starting_ref().sections[1],
        "End Mishnah": mref.ending_ref().sections[1],
        "Start Daf":  talref.starting_ref().normal_section(0, "en"),
        "Start Line": talref.starting_ref().sections[1],
        "End Daf": talref.ending_ref().normal_section(0, "en"), #!!
        "End Line": talref.ending_ref().sections[1],
    }
    ds += [d]

ds = sorted(ds, key=lambda x: x["_order"])

with open('../data/Mishnah Map.csv', 'w') as csvfile:
    fieldnames = ["Book",
        "Mishnah Chapter",
        "Start Mishnah",
        "End Mishnah",
        "Start Daf",
        "Start Line",
        "End Daf",
        "End Line"]
    writer = csv.DictWriter(csvfile, fieldnames=fieldnames, extrasaction='ignore')

    writer.writeheader()
    for d in ds:
        writer.writerow(d)
