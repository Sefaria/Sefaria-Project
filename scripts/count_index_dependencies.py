"""
Display all the varying dependencies on Index records.
Takes Index titles as command line arguments, e.g:
# python count_index_dependencies.py Rashi Exodus
With not arguments, cycles through all Indexes
"""

import pprint
import sys

import regex as re

from sefaria.model import *

pp = pprint.PrettyPrinter(indent=4)


indices = text.IndexSet({"title": {"$in": sys.argv[1:]}}) if len(sys.argv) > 1 else text.IndexSet()


def dep_counts(name):
    ref_patterns = {
        "alone": rf"^{re.escape(name)} \d",
        "commentor": rf"{re.escape(name)} on",
        "commentee": rf"on {re.escape(name)} \d",
    }

    commentee_title_pattern = rf"on {re.escape(name)}"

    ret = {
        "version title exact match": text.VersionSet({"title": name}).count(),
        "version title match commentor": text.VersionSet({"title": {"$regex": ref_patterns["commentor"]}}).count(),
        "version title match commentee": text.VersionSet({"title": {"$regex": commentee_title_pattern}}).count(),
        "history title exact match": history.HistorySet({"title": name}).count(),
        "history title match commentor": history.HistorySet({"title": {"$regex": ref_patterns["commentor"]}}).count(),
        "history title match commentee": history.HistorySet({"title": {"$regex": commentee_title_pattern}}).count(),
    }

    for pname, pattern in list(ref_patterns.items()):
        ret.update(
            {
                "note match " + pname: note.NoteSet({"ref": {"$regex": pattern}}).count(),
                "link match " + pname: link.LinkSet({"refs": {"$regex": pattern}}).count(),
                "history refs match " + pname: history.HistorySet({"ref": {"$regex": pattern}}).count(),
                "history new refs match " + pname: history.HistorySet({"new.refs": {"$regex": pattern}}).count(),
            },
        )

    return ret


for ind in indices:
    print()
    print(ind.title)
    print(pp.pprint(dep_counts(ind.title)))
