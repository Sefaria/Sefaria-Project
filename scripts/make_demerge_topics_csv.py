import django
django.setup()
from sefaria.model import *

def make_demerge_csv(query, out_file):
    ls = RefTopicLinkSet(query)
    ls.count()
    import csv
    rows = []
    for l in ls:
        oref = Ref(l.ref)
        en = oref.text('en').ja().flatten_to_string()
        he = oref.text('he').ja().flatten_to_string()
        rows += [{
            "Id": str(l._id),
            "En": en,
            "He": he,
            "Ref": l.ref,
            "URL": f'https://www.sefaria.org/{oref.url()}'
        }]
    with open(out_file, 'w') as fout:
        c = csv.DictWriter(fout, ['Id', 'En', 'He', 'Ref', 'URL'])
        c.writeheader()
        c.writerows(rows)