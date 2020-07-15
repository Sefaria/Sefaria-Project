# coding=utf-8
from urllib.parse import urlparse
import regex as re
from datetime import datetime
from collections import defaultdict

from . import abstract as abst
from . import text
from sefaria.system.database import db
from sefaria.model.text import Ref

import logging
logger = logging.getLogger(__name__)


class Audio(abst.AbstractMongoRecord):
    """
    Audio for sidebar connection pannel.  May be public or private.
    """
    collection = 'audio'    
    #audio_collection = db["audio"] # creates the audio collection
    required_attrs = [
        "audio_url",
        "source",
        "audio_type",
        "ref",
    ]
    
    #def load(self, url_or_query):
        #query = {"url": WebPage.normalize_url(url_or_query)} if isinstance(url_or_query, str) else url_or_query
        #return super(WebPage, self).load(query)    
    
    def _normalize(self): # what does this do?
        self.ref = Ref(self.ref).normal()

    def client_contents(self, ref):
        d = self.contents()
        t = {}
        t["audio_url"]     = d["audio_url"] 
        t["source"]   = d["source"]
        t['start_time'] = ref['start_time']
        t['end_time'] = ref['end_time']
        return t

class AudioSet(abst.AbstractMongoSet):
    recordClass = Audio

def get_audio_for_ref(tref):
    #return "AUDIO"
    #temp tref val
    oref = text.Ref(tref)
    regex_list = oref.regex(as_list=True)
    ref_clauses = [{"ref.sefaria_ref": {"$regex": r}} for r in regex_list]
    query = {"$or": ref_clauses }
    results = AudioSet(query=query)
    client_results = []
    ref_re = "("+'|'.join(regex_list)+")"
    for audio in results:
        # if this is a legit website
        # for every item in the in webpage refs, does this match the reference 
        # we are looking for 
        matched_ref = [r for r in audio.ref if re.match(ref_re, r['sefaria_ref'])]
    for ref in matched_ref:
        audio_contents = audio.client_contents(ref) 
        client_results.append(audio_contents)

    return client_results        


