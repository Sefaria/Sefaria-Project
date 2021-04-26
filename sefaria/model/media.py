# coding=utf-8
from urllib.parse import urlparse
import regex as re
from datetime import datetime
from collections import defaultdict

from . import abstract as abst
from . import text
from sefaria.system.database import db
from sefaria.model.text import Ref

import structlog
logger = structlog.get_logger(__name__)


class Media(abst.AbstractMongoRecord):
    """
    Media for sidebar connection pannel.
    """
    collection = 'media'
    required_attrs = [
        "media_url",
        "source_he",
        "source",
        "media_type",
        "ref",
        "license",
        "source_site",
        "description",
        "description_he",
    ]

    def _normalize(self): # what does this do?
        self.ref = Ref(self.ref).normal()

    def client_contents(self, ref):
        d = self.contents()
        t = {}
        t["media_url"]     = ref["media_url"]
        t["source"]   = d["source"]
        t["source_he"]   = d["source_he"]
        t['start_time'] = ref['start_time']
        t['end_time'] = ref['end_time']
        t['anchorRef'] = ref['sefaria_ref']
        t['license'] = d['license']
        t['source_site'] = d['source_site']
        t['description'] = d['description']
        t['description_he'] = d['description_he']
        return t

class MediaSet(abst.AbstractMongoSet):
    recordClass = Media

def get_media_for_ref(tref):
    oref = text.Ref(tref)
    regex_list = oref.regex(as_list=True)
    ref_clauses = [{"ref.sefaria_ref": {"$regex": r}} for r in regex_list]
    query = {"$or": ref_clauses }
    results = MediaSet(query=query)
    client_results = []
    ref_re = "("+'|'.join(regex_list)+")"
    matched_ref = []
    for media in results:
        for r in media.ref:
            if re.match(ref_re, r['sefaria_ref']):
                r['media_url'] = media.media_url
                matched_ref.append(r)
    for ref in matched_ref:
        media_contents = media.client_contents(ref)
        client_results.append(media_contents)

    return client_results
