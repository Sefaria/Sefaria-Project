# coding=utf-8
from django.core.validators import URLValidator
from django.core.exceptions import ValidationError
from sefaria.system.exceptions import DuplicateRecordError

from . import abstract as abst
from sefaria.helper.webpages import normalize_url


class WebPageText(abst.AbstractMongoRecord):
    collection = 'webpages_text'
    criteria_field = 'url'
    track_pkeys = True
    pkeys = ['url']

    required_attrs = [
        "url",
        "title",
        "body",
    ]

    def load(self, url_or_query):
        query = {"url": normalize_url(url_or_query)} if isinstance(url_or_query, str) else url_or_query
        return super(WebPageText, self).load(query)

    def _normalize(self):
        self.url = normalize_url(self.url)

    def _validate(self):
        validator = URLValidator()
        validator(self.url)
        super(WebPageText, self)._validate()

        existing = WebPageText().load(self.url)
        if existing and existing._id != getattr(self, "_id", None):
            raise DuplicateRecordError(f"{type(self).__name__}._validate(): Duplicate primary key {self.pkeys}, found url={self.url} to already exist in the database.")

        return True

    @staticmethod
    def add_or_update_from_linker(webpage_text_contents: dict):
        """
        Adds or updates WebPageText by normalized URL.
        @param webpage_text_contents: dict with keys url, title, body
        """
        normalized_url = normalize_url(webpage_text_contents["url"])
        title = webpage_text_contents["title"]
        body = webpage_text_contents["body"]

        webpage_text = WebPageText().load(normalized_url)
        if webpage_text:
            if title == webpage_text.title and body == webpage_text.body:
                return "excluded", webpage_text
            webpage_text.title = title
            webpage_text.body = body
        else:
            webpage_text = WebPageText({
                "url": normalized_url,
                "title": title,
                "body": body,
            })

        try:
            webpage_text.save()
        except ValidationError:
            return "excluded", None
        return "saved", webpage_text


class WebPageTextSet(abst.AbstractMongoSet):
    recordClass = WebPageText
