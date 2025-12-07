from typing import Iterable
from sefaria.model.abstract import AbstractMongoRecord, AbstractMongoSet
from sefaria.model.text import TextChunk, Ref
from sefaria.system.exceptions import InputError, DuplicateRecordError
from sefaria.system.database import db
from html import escape
from enum import Enum
from abc import ABC, abstractmethod
from bisect import bisect_right
import structlog
logger = structlog.get_logger(__name__)


class MUTCSpanType(Enum):
    QUOTE = "quote"
    NAMED_ENTITY = "named-entity"
    CITATION = "citation"
    CATEGORY = "category"


class MarkedUpTextChunk(AbstractMongoRecord):
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
                        "allowed": [x.value for x in MUTCSpanType],
                        "required": True
                    },
                    "ref": {"type": "string", "required": False},
                    "topicSlug": {"type": "string", "required": False},
                    "categoryPath": {"type": "list", "schema": {"type": "string"}, "required": False, "nullable": True},
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
            if span['type'] == MUTCSpanType.CITATION.value and 'ref' not in span:
                raise InputError(f'{type(self).__name__}._validate(): Span must have "ref" attribute if type is "citation".')
            if span['type'] == MUTCSpanType.NAMED_ENTITY.value and 'topicSlug' not in span:
                raise InputError(f'{type(self).__name__}._validate(): Span must have "topicSlug" attribute if type is "named_entity".')
            text = tc.text
            citation_text = text[span['charRange'][0]:span['charRange'][1]]
            if citation_text != span['text']:
                raise InputError(f"{type(self).__name__}._validate(): Span text does not match the text in the corresponding TextChunk for {span.get('ref', span.get('topicSlug'))}"
                                 f": expected '{span['text']}', found '{citation_text}'.")

        return True

    def _sanitize(self):
        # No sanitization needed. The span text comes from the Version's text,
        # which has already been sanitized. Other fields (ref, versionTitle, language)
        # are metadata and should not be HTML-escaped.
        pass
    
    def __str__(self):
        return "TextSpan: {}".format(self.ref)
    
    def get_span_objects(self, reverse=False) -> Iterable['MUTCSpan']:
        """
        Returns the spans as MUTCSpan objects.
        :param reverse: If True, returns spans in reverse order (by start index). Default is to return in normal order.
        """
        spans_sorted = sorted(self.spans, key=lambda sp: sp["charRange"][0], reverse=reverse)
        for raw_sp in spans_sorted:
            yield MUTCSpanFactory.create(raw_sp)

    def add_non_overlapping_spans(self, new_spans: list[dict]) -> None:
        """
        Add spans from new_spans to self.spans, ignoring any span from new_spans that overlaps
        with any span in self.spans.
        Doesn't save.

        Assumes self.spans has no internal overlaps.
        """
        # Make a sorted copy of A for searching; keep original A order for the result.
        self_spans = sorted(self.spans, key=lambda s: s["charRange"][0])
        self_starts = [s["charRange"][0] for s in self_spans]

        def overlaps(a, b):
            a_start, a_end = a["charRange"]
            b_start, b_end = b["charRange"]
            return (a_start < b_end) and (b_start < a_end)  # half-open

        accepted_new_spans = []
        for b in new_spans:
            b_start, _ = b["charRange"]
            # idx is first A with start > b_start
            idx = bisect_right(self_starts, b_start)

            # Only possible overlaps are with A[idx-1] and A[idx] (since A is disjoint and sorted)
            o = False
            if idx - 1 >= 0 and overlaps(self_spans[idx - 1], b):
                o = True
            elif idx < len(self_spans) and overlaps(self_spans[idx], b):
                o = True

            if not o:
                accepted_new_spans.append(b)

        self.spans.extend(accepted_new_spans)

    def apply_spans_to_text(self, text):
        """
        Applies the spans defined in this MarkedUpTextChunk to the provided text.
        For now, we assume that all spans are "citation" spans, will extend it in the future to support "quote" spans.
        Returns a text with HTML anchor tags inserted for each span.
        """

        spans = self.spans

        if not spans:
            return text

        out = text
        for ispan, sp in enumerate(self.get_span_objects(reverse=True)):
            start, end = sp.char_range

            # Clamp & sanity check
            start = max(0, start)
            end = min(len(out), end)
            if start >= end:
                continue

            if sp.text != out[start:end]:
                # citation text saved in MUTC doesn't match the text in the actual segment
                # this can happen briefly after an edit but before the async task completes
                continue

            out = out[:start] + sp.wrap_span_in_a_tag() + out[end:]

        return out


class MarkedUpTextChunkSet(AbstractMongoSet):
    recordClass = MarkedUpTextChunk


class LinkerOutput(MarkedUpTextChunk):
    """
    Track linker resolutions for debugging purposes.
    """
    collection = "linker_output"
    criteria_field = "ref"
    track_pkeys = True
    pkeys = ["ref", "versionTitle", "language"]

    required_attrs = [
        "ref",
        "versionTitle",
        "language",
        "spans"
    ]
    optional_list_str_schema_keys = ('categoryPath', 'inputRefParts', 'inputRefPartTypes',
                                     'inputRefPartClasses', 'refPartsToMatch', 'resolvedRefParts',
                                     'resolvedRefPartTypes', 'resolvedRefPartClasses', 'inputRangeSections',
                                     'inputRangeToSections')

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
                        "allowed": [x.value for x in MUTCSpanType],
                        "required": True
                    },
                    "ref": {"type": "string", "required": False, "nullable": True},
                    "topicSlug": {"type": "string", "required": False, "nullable": True},
                    "contextRef": {"type": "string", "required": False, "nullable": True},
                    "contextType": {"type": "string", "required": False, "nullable": True},
                    "failed": {"type": "boolean", "required": True},
                    "ambiguous": {"type": "boolean", "required": True},
                    **{k: {"type": "list", "schema": {"type": "string"}, "required": False, "nullable": True} for k in optional_list_str_schema_keys}
                }
            },
            "required": True
        }
    }


class LinkerOutputSet(AbstractMongoSet):
    recordClass = LinkerOutput


class MUTCSpan(ABC):
    def __init__(self, raw_span: dict):
        self.char_range = raw_span['charRange']
        self.text = raw_span['text']
        self.failed = raw_span.get('failed', False)
        self.ambiguous = raw_span.get('ambiguous', False)
        # these fields only appear for LinkerOutput and not MUTC and therefore indicate we are debugging
        self._debug = 'failed' in raw_span or 'ambiguous' in raw_span
        
    @property
    def char_range_str(self) -> str:
        return f"{self.char_range[0]}-{self.char_range[1]}"
    
    def get_debug_css_classes(self) -> str:
        if not self._debug:
            return ""
        if self.failed:
            return "mutc spanFailed"
        if self.ambiguous:
            return "mutc spanAmbiguous"
        return "mutc spanSucceeded"

    @abstractmethod
    def wrap_span_in_a_tag(self) -> str:
        pass


class CitationMUTCSpan(MUTCSpan):

    def __init__(self, raw_span: dict):
        super().__init__(raw_span)
        tref = raw_span.get('ref')
        self.ref = Ref(tref) if tref else None
    
    def wrap_span_in_a_tag(self) -> str:
        href, tref = "", ""
        if self.ref:
            href = self.ref.url()
            tref = self.ref.normal()
        return (f'<a class="refLink {self.get_debug_css_classes()}"'
                f' href="{href}" data-ref="{escape(tref)}"'
                f' data-range={self.char_range_str}>{self.text}</a>')
    
    
class NamedEntityMUTCSpan(MUTCSpan):
    def __init__(self, raw_span: dict):
        super().__init__(raw_span)
        self.topic_slug = raw_span.get('topicSlug')
        
    def wrap_span_in_a_tag(self) -> str:
        href = self.topic_slug or ""
        return (f'<a class="namedEntityLink {self.get_debug_css_classes()}"'
                f' href="/topics/{href}" data-slug="{self.topic_slug}"'
                f' data-range={self.char_range_str}>{self.text}</a>')
    

class CategoryMUTCSpan(MUTCSpan):
    def __init__(self, raw_span: dict):
        super().__init__(raw_span)
        self.category_path = raw_span.get('categoryPath')
        
    def wrap_span_in_a_tag(self) -> str:
        href = "/".join(self.category_path)
        return (f'<a class="categoryLink {self.get_debug_css_classes()}"'
                f' href="/texts/{href}" data-category-path="{href}"'
                f' data-range={self.char_range_str}>{self.text}</a>')
    
    
class MUTCSpanFactory:

    @staticmethod
    def create(raw_span: dict) -> 'MUTCSpan':
        typ = MUTCSpanType(raw_span['type'])
        if typ == MUTCSpanType.CITATION:
            return CitationMUTCSpan(raw_span)
        if typ == MUTCSpanType.NAMED_ENTITY:
            return NamedEntityMUTCSpan(raw_span)
        if typ == MUTCSpanType.CATEGORY:
            return CategoryMUTCSpan(raw_span)
        raise ValueError(f"MUTCSpanFactory.create(): Unsupported MUTCSpanType: {typ}")


def get_mutc_class(debug=False) -> type[MarkedUpTextChunk]:
    """
    Returns the appropriate MarkedUpTextChunk class based on debug flag.
    If debug is True, returns LinkerOutput class; otherwise, returns MarkedUpText
    :param debug: 
    :return: 
    """
    return LinkerOutput if debug else MarkedUpTextChunk


def process_index_title_change(indx, **kwargs):
    print("Cascading Marked Up Text Chunks from {} to {}".format(kwargs['old'], kwargs['new']))

    # ensure that the regex library we're using here is the same regex library being used in `Ref.regex`
    from .text import re as reg_reg
    patterns = [pattern.replace(reg_reg.escape(indx.title), reg_reg.escape(kwargs["old"]))
                for pattern in Ref(indx.title).regex(as_list=True)]
    queries = [{'ref': {'$regex': pattern}} for pattern in patterns]
    queries.extend([{'spans.ref': {'$regex': pattern}} for pattern in patterns])
    for Klass in [MarkedUpTextChunkSet, LinkerOutputSet]:
        objs = Klass({"$or": queries})
        for o in objs:
            o.ref = o.ref.replace(kwargs["old"], kwargs["new"], 1)
            try:
                o.save()
            except InputError:
                logger.warning("Failed to convert ref data from: {} to {}".format(kwargs['old'], kwargs['new']))


def process_index_delete(indx, **kwargs):
    from sefaria.model.text import prepare_index_regex_for_dependency_process
    pattern = prepare_index_regex_for_dependency_process(indx)
    MarkedUpTextChunkSet({"ref": {"$regex": pattern}}).delete()
    LinkerOutputSet({"ref": {"$regex": pattern}}).delete()


def process_category_path_change(category, **kwargs):
    print("Cascading Marked Up Text Chunk category path from {} to {}".format(kwargs['old'], kwargs['new']))
    db.marked_up_text_chunks.update_many({'spans.categoryPath': kwargs['old']}, {"$set": {'spans.$[element].categoryPath': kwargs['new']}}, array_filters=[{"element.categoryPath": kwargs['old']}])
    db.linker_output.update_many({'spans.categoryPath': kwargs['old']}, {"$set": {'spans.$[element].categoryPath': kwargs['new']}}, array_filters=[{"element.categoryPath": kwargs['old']}])


def process_topic_slug_change(topic, **kwargs):
    print("Cascading Marked Up Text Chunk topic slug from {} to {}".format(kwargs['old'], kwargs['new']))
    db.marked_up_text_chunks.update_many({'spans.topicSlug': kwargs['old']}, {"$set": {'spans.$[element].topicSlug': kwargs['new']}}, array_filters=[{"element.topicSlug": kwargs['old']}])
    db.linker_output.update_many({'spans.topicSlug': kwargs['old']}, {"$set": {'spans.$[element].topicSlug': kwargs['new']}}, array_filters=[{"element.topicSlug": kwargs['old']}])
    
