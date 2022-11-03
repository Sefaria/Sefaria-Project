import django
from sefaria.model import *
import re
import sys, getopt, csv
from sefaria.system.database import db
from bson.objectid import ObjectId

django.setup()

def prettify_text(t):
    return ' '.join(re.sub(r'<[^>]+>', ' ', t).split())


def make_demerge_csv_sources(slug_to_demerge, out_file):
    query = {"toTopic": slug_to_demerge, "is_sheet": False, "generatedBy": {"$exists": False}}
    ls = RefTopicLinkSet(query)
    ls.count()
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
            "Datasource": l.dataSource,
            "URL": f'https://www.sefaria.org/{oref.url()}'
        }]
    with open(out_file, 'w') as fout:
        c = csv.DictWriter(fout, ['Id', 'En', 'He', 'Ref', 'Datasource', 'URL'])
        c.writeheader()
        c.writerows(rows)


def make_demerge_csv_sheets(slug_to_demerge, out_file):
    query = {"topics.slug": slug_to_demerge}
    sheets = db.sheets.find(query)
    rows = []
    for sheet in sheets:
        topics = [t['asTyped'] for t in filter(lambda t: t['slug'] == slug_to_demerge, sheet['topics'])]
        rows += [{
            "Id": str(sheet['id']),
            "Title": prettify_text(sheet['title']),
            "URL": f'https://www.sefaria.org/sheets/{sheet["id"]}',
            "Topic Typed": " | ".join(topics)
        }]
    with open(out_file, 'w') as fout:
        c = csv.DictWriter(fout, ['Id', 'Title', 'Topic Typed', 'URL'])
        c.writeheader()
        c.writerows(rows)


def make_demerge_csv(slug_to_demerge, out_file, type='sources'):
    if type  == 'sources':
        make_demerge_csv_sources(slug_to_demerge, out_file)
    elif type  == 'sheets':
        make_demerge_csv_sheets(slug_to_demerge, out_file)


def get_args(argv):
    argv = argv[1:]
    slug_to_demerge = None
    out_file = None
    type = None
    try:
        opts, args = getopt.getopt(argv,"hs:o:t:",["slug=","ofile=","type="])
    except getopt.GetoptError:
        print('make_demerge_topics_csv.py -s <slug_to_demerge> -o <out_file> -t <type (sources or sheets)>')
        sys.exit(2)
    for opt, arg in opts:
        if opt == '-h':
            print('make_demerge_topics_csv.py -s <slug_to_demerge> -o <out_file> -t <type (sources or sheets)>')
            sys.exit()
        elif opt in ("-s", "--slug"):
            slug_to_demerge = arg
        elif opt in ("-o", "--ofile"):
            out_file = arg
        elif opt in ("-t", "--type"):
            type = arg
    return slug_to_demerge, out_file, type


def do_demerge(fnames, cols, slug_dict_list):
    # cols = ['Moon or Month?', 'Prophet or Amora?']
    # slugs = [{'moon': 'the-moon-(לבנה)', 'month': 'months'}, {'amora': 'shmuel-(amora)', 'prophet': 'shmuel-(prophet)'}]
    for slug_dict, col, fname in zip(slug_dict_list, cols, fnames):
        for k, v in slug_dict.items():
            assert Topic.init(v) is not None
        with open(fname, 'r') as fin:
            c= csv.DictReader(fin)
            for row in c:
                if len(row[col]) == 0:
                    continue
                link = RefTopicLink().load({"_id": ObjectId(row['Id'])})
                if link is None:
                    print(row['id'])
                    continue
                link.toTopic = slug_dict[row[col]]
                print(link.toTopic)
                link.save()


if __name__ == "__main__":
    slug_to_demerge, out_file, type = get_args(sys.argv)
    make_demerge_csv(slug_to_demerge, out_file, type=type)

"""
example call:
python scripts/make_demerge_topics_csv.py -s parashat-shoftim -o data/shoftim_demerge.csv -t sheets
""" 