from . import abstract as abst
from sefaria.model.text import TextChunk, Ref
from sefaria.system.exceptions import InputError, DuplicateRecordError
from typing import List, Dict
import re
from html import escape


class MarkedUpTextChunk(abst.AbstractMongoRecord):
    """
    MarkedUpTextChunk objects define the quotations and links inside Sefaria texts
    Probably, every Quoting Commentary will have a MarkedUpTextChunk object
    """
    collection = "marked_up_text_chunks"
    criteria_field = "ref"
    track_pkeys = True
    pkeys = ["ref", "versionTitle", "language"]

    required_attrs = [
        "ref",
        "versionTitle",
        "language",
        "spans"
    ]

    attr_schemas = {
        "ref": {"type": "string", "required": True},
        "versionTitle": {"type": "string", "required": True},
        "language": {"type": "string", "allowed": ["en", "he"], "required": True},
        "spans": {
            "type": "list",
            "empty": False,
            "schema": {
                "type": "dict",
                "schema": {
                    "charRange": {
                        "type": "list",
                        "schema": {"type": "integer"},
                        "minlength": 2,
                        "maxlength": 2,
                        "required": True
                    },
                    "text": {"type": "string", "required": True},
                    "type": {
                        "type": "string",
                        "allowed": ["quote", "citation"],
                        "required": True
                    },
                    "ref": {"type": "string", "required": True}
                }
            },
            "required": True
        }
    }


    def _validate(self):
        super()._validate()
        oref = Ref(self.ref)
        if not oref.is_segment_level():
            raise InputError(type(self).__name__ + "._validate(): Ref must be at segment level: " + oref.normal())
        tc = TextChunk(oref, lang=self.language, vtitle=self.versionTitle)

        if not tc.text:
            raise InputError(type(self).__name__ + "._validate(): Corresponding TextChunk is empty")

        # Enforce uniqueness
        pkey_query = {k: getattr(self, k) for k in self.pkeys}

        existing = self.__class__().load(pkey_query)
        if existing and existing._id != getattr(self, "_id", None):
            raise DuplicateRecordError(f"{type(self).__name__}._validate(): Duplicate primary key {self.pkeys}, found {pkey_query} to already exist in the database.")


        for span in self.spans:
            text = tc.text
            citation_text = text[span['charRange'][0]:span['charRange'][1]]
            if citation_text != span['text']:
                raise InputError(f"{type(self).__name__}._validate(): Span text does not match the text in the corresponding TextChunk for {span['ref']}"
                                 f": expected '{span['text']}', found '{citation_text}'.")

        return True

    def _normalize(self):
        self.ref = Ref(self.ref).normal()
        for span in self.spans:
            span['ref'] = Ref(span['ref']).normal()

    def __str__(self):
        return "TextSpan: {}".format(self.ref)


    def apply_spans_to_text(self, text):
        """
        Applies the spans defined in this MarkedUpTextChunk to the provided text.
        Returns a text with HTML anchor tags inserted for each span.
        """

        spans = self.spans

        if not spans:
            return text

        # Insert from the right so earlier insertions don't shift later indices.
        spans_sorted = sorted(spans, key=lambda sp: sp["charRange"][0], reverse=True)

        out = text
        for sp in spans_sorted:
            start, end = sp["charRange"]

            # Clamp & sanity check
            start = max(0, start)
            end = min(len(out), end)
            if start >= end:
                continue

            visible = sp.get("text")
            if visible != out[start:end]:
                raise InputError(
                    f"MarkedUpTextChunk.apply_spans_to_text: Span text '{visible}' does not match text slice '{out[start:end]}' for span {sp}"
                )

            ref = sp.get("ref", "").strip()
            href = Ref(ref).url()
            anchor = (
                f'<a class="refLink" href="{href}" data-ref="{escape(ref)}">'
                f'{escape(visible)}</a>'
            )

            out = out[:start] + anchor + out[end:]

        return out