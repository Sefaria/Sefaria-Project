# coding=utf-8
from django.core.validators import URLValidator

from . import abstract as abst
from .webpage import WebPage


class WebPageText(abst.AbstractMongoRecord):
    collection = 'webpages_text'

    required_attrs = [
        "url",
        "title",
        "body",
    ]

    def load(self, url_or_query):
        query = {"url": WebPage.normalize_url(url_or_query)} if isinstance(url_or_query, str) else url_or_query
        return super(WebPageText, self).load(query)

    def _normalize(self):
        self.url = WebPage.normalize_url(self.url)

    def _validate(self):
        validator = URLValidator()
        validator(self.url)
        return super(WebPageText, self)._validate()


class WebPageTextSet(abst.AbstractMongoSet):
    recordClass = WebPageText
