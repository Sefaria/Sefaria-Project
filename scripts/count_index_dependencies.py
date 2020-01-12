"""
Display all the varying dependencies on Index records.
Takes Index titles as command line arguments, e.g:
# python count_index_dependencies.py Rashi Exodus
With not arguments, cycles through all Indexes
"""


import regex as re
import pprint
import sys

from sefaria.model import *
import sefaria.model.dependencies
pp = pprint.PrettyPrinter(indent=4)


if len(sys.argv) > 1:
    indices = text.IndexSet({"title": {"$in": sys.argv[1:]}})
else:
    indices = text.IndexSet()


def dep_counts(name):
    ref_patterns = {
        'alone': r'^{} \d'.format(re.escape(name)),
        'commentor': r'{} on'.format(re.escape(name)),
        'commentee': r'on {} \d'.format(re.escape(name))
    }

    commentee_title_pattern = r'on {}'.format(re.escape(name))

    ret = {
        'version title exact match': text.VersionSet({"title": name}).count(),
        'version title match commentor': text.VersionSet({"title": {"$regex": ref_patterns["commentor"]}}).count(),
        'version title match commentee': text.VersionSet({"title": {"$regex": commentee_title_pattern}}).count(),
        'history title exact match': history.HistorySet({"title": name}).count(),
        'history title match commentor': history.HistorySet({"title": {"$regex": ref_patterns["commentor"]}}).count(),
        'history title match commentee': history.HistorySet({"title": {"$regex": commentee_title_pattern}}).count(),
    }

    for pname, pattern in list(ref_patterns.items()):
        ret.update({
            'note match ' + pname: note.NoteSet({"ref": {"$regex": pattern}}).count(),
            'link match ' + pname: link.LinkSet({"refs": {"$regex": pattern}}).count(),
            'history refs match ' + pname: history.HistorySet({"ref": {"$regex": pattern}}).count(),
            'history new refs match ' + pname: history.HistorySet({"new.refs": {"$regex": pattern}}).count()
        })

    return ret


for ind in indices:
    print()
    print(ind.title)
    print(pp.pprint(dep_counts(ind.title)))