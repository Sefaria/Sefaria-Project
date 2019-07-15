# coding=utf-8
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
        return self.domain() + "/favicon.ico"

    def update_from_linker(self, updates):
        self.load_from_dict(updates)
        self.linkerHits += 1
        self.lastUpdated = datetime.now()
        self.save()

    def contents(self, **kwargs):
        d = super(WebPage, self).contents(**kwargs)
        d["faviconUrl"] = self.favicon() 
        return d 

class WebPageSet(abst.AbstractMongoSet):
    recordClass = WebPage


