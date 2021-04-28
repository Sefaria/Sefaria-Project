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


class Audio(abst.AbstractMongoRecord):
    """
    Audio for sidebar connection pannel.
    """
    collection = 'audio'    
    required_attrs = [
        "audio_url",
        "source",
        "audio_type",
        "ref",
        "media",
        "license",
        "source_site",
        "description",
    ]

    def _normalize(self): # what does this do?
        self.ref = Ref(self.ref).normal()

    def client_contents(self, ref):
        d = self.contents()
        print(d)
        t = {}
        t["audio_url"]     = d["audio_url"] 
        t["source"]   = d["source"]
        t['start_time'] = ref['start_time']
        t['end_time'] = ref['end_time']
        t['anchorRef'] = ref['sefaria_ref']
        t['media'] = d['media']
        t['license'] = d['license']
        t['source_site'] = d['source_site']
        t['description'] = d['description']
        return t

class AudioSet(abst.AbstractMongoSet):
    recordClass = Audio

def get_audio_for_ref(tref):
    oref = text.Ref(tref)
    regex_list = oref.regex(as_list=True)
    ref_clauses = [{"ref.sefaria_ref": {"$regex": r}} for r in regex_list]
    query = {"$or": ref_clauses }
    results = AudioSet(query=query)
    client_results = []
    ref_re = "("+'|'.join(regex_list)+")"
    matched_ref = []
    for audio in results:
        for r in audio.ref:
            if re.match(ref_re, r['sefaria_ref']):
                matched_ref.append(r)
    for ref in matched_ref:
        audio_contents = audio.client_contents(ref) 
        
        client_results.append(audio_contents)

    return client_results        


