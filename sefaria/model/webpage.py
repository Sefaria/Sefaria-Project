# coding=utf-8
import regex
from urlparse import urlparse
from datetime import datetime

from . import abstract as abst
from . import text

import logging
logger = logging.getLogger(__name__)


class WebPage(abst.AbstractMongoRecord):
    collection = 'webpages'

    required_attrs = [
        "url",       # Only supports https
        "title",
        "refs",
        "lastUpdated",
        "linkerHits",
    ]
    optional_attrs = [
        "description",
        "body",
    ]
    def load(self, url_or_query):
        query = {"url": url_or_query} if isinstance(url_or_query, basestring) else url_or_query
        return super(WebPage, self).load(query)
        
    def _init_defaults(self):
        self.linkerHits = 0

    def _normalize(self):
        super(WebPage, self)._normalize()
        self.refs = [text.Ref(ref).normal() for ref in self.refs if text.Ref.is_ref(ref)]
        self.refs = list(set(self.refs))

    def _validate(self):
        super(WebPage, self)._validate()

    def domain(self):
        return urlparse(self.url).netloc

    def favicon(self):
        return "https://www.google.com/s2/favicons?domain={}".format(self.domain())

    def update_from_linker(self, updates):
        self.load_from_dict(updates)
        self.linkerHits += 1
        self.lastUpdated = datetime.now()
        self.save()

    def contents(self, **kwargs):
        d = super(WebPage, self).contents(**kwargs)
        d["domain"] = self.domain()
        d["faviconUrl"] = self.favicon() 
        return d

    def client_contents(self):
        d = self.contents()
        del d["lastUpdated"]
        return d

class WebPageSet(abst.AbstractMongoSet):
    recordClass = WebPage


def get_webpages_for_ref(tref):
    oref = text.Ref(tref)
    regex_list = oref.regex(as_list=True)
    ref_clauses = [{"refs": {"$regex": r}} for r in regex_list]
    query = {"$or": ref_clauses }
    results = WebPageSet(query=query)
    client_results = []
    ref_re = "("+'|'.join(regex_list)+")"
    for webpage in results:
        matched_refs = [r for r in webpage.refs if regex.match(ref_re, r)]
        for ref in matched_refs:
            webpage_contents = webpage.contents()
            del webpage_contents["lastUpdated"]
            webpage_contents["anchorRef"] = ref
            client_results.append(webpage_contents)
    
    return client_results

