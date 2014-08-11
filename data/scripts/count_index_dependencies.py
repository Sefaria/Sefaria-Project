import regex as re
import pprint

from sefaria.model import *
import sefaria.model.dependencies

pp = pprint.PrettyPrinter(indent=4)


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

    for pname, pattern in ref_patterns.items():
        ret.update({
            'note match ' + pname: note.NoteSet({"ref": {"$regex": pattern}}).count(),
            'link match ' + pname: link.LinkSet({"refs": {"$regex": pattern}}).count(),
            'history refs match ' + pname: history.HistorySet({"ref": {"$regex": pattern}}).count(),
            'history new refs match ' + pname: history.HistorySet({"new.refs": {"$regex": pattern}}).count()
        })

    return ret


for ind in text.IndexSet():
    print
    print ind.title
    print pp.pprint(dep_counts(ind.title))