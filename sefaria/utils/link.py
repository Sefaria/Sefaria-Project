helpe
from sefaria.model import *
import sefaria.tracker as tracker


def create_link_cluster(refs, user, link_type="", attrs=None):
    for i, ref in enumerate(refs):
        for j in range(i + 1, len(refs)):
            d = {
                "refs": [refs[i].normal(), refs[j].normal()],
                "type": link_type
                }
            if attrs:
                d.update(attrs)
            try:
                tracker.add(user, Link, d)
                print u"Created {} - {}".format(d["refs"][0], d["refs"][1])
            except Exception as e:
                print u"Exception: {}".format(e)
