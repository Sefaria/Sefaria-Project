import django
django.setup()
from sefaria.model import *
import re
import sys, getopt

def prettify_text(t):
    return ' '.join(re.sub(r'<[^>]+>', ' ', t).split())

def make_demerge_csv(slug_to_demerge, out_file):
    query = {"toTopic": slug_to_demerge, "is_sheet": False, "generatedBy": {"$exists": False}}
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
            "En": prettify_text(en),
            "He": prettify_text(he),
            "Ref": l.ref,
            "URL": f'https://www.sefaria.org/{oref.url()}'
        }]
    with open(out_file, 'w') as fout:
        c = csv.DictWriter(fout, ['Id', 'En', 'He', 'Ref', 'URL'])
        c.writeheader()
        c.writerows(rows)

def get_args(argv):
    argv = argv[1:]
    slug_to_demerge = None
    out_file = None
    try:
        opts, args = getopt.getopt(argv,"hs:o:",["slug=","ofile="])
    except getopt.GetoptError:
        print('make_demerge_topics_csv.py -s <slug_to_demerge> -o <out_file>')
        sys.exit(2)
    for opt, arg in opts:
        if opt == '-h':
            print('make_demerge_topics_csv.py -s <slug_to_demerge> -o <out_file>')
            sys.exit()
        elif opt in ("-s", "--slug"):
            slug_to_demerge = arg
        elif opt in ("-o", "--ofile"):
            out_file = arg
    return slug_to_demerge, out_file


if __name__ == "__main__":
    slug_to_demerge, out_file = get_args(sys.argv)
    make_demerge_csv(slug_to_demerge, out_file)