from typing import Iterable
from sefaria.model.abstract import AbstractMongoRecord, AbstractMongoSet
from sefaria.model.text import TextChunk, Ref
from sefaria.system.exceptions import InputError, DuplicateRecordError
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
        for ispan, raw_sp in enumerate(spans_sorted):
            yield MUTCSpanFactory.create(raw_sp["charRange"], MUTCSpanType(raw_sp["type"]),
                                         raw_sp["text"], ispan, raw_sp.get("topicSlug"), 
                                         raw_sp.get("ref"), raw_sp.get("categoryPath"), raw_sp.get("failed", False),
                                         raw_sp.get("ambiguous", False))

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


class MUTCSpan(ABC):
    
    def __init__(self, char_range: list[int], typ: MUTCSpanType, text: str, index: int, failed=False, ambiguous=False):
        self.char_range = char_range
        self.typ = typ
        self.text = text
        self.index = index
        self.failed = failed
        self.ambiguous = ambiguous
    
    def get_success_css_class(self) -> str:
        if self.failed:
            return "spanFailed"
        if self.ambiguous:
            return "spanAmbiguous"
        return "spanSucceeded"

    @abstractmethod
    def wrap_span_in_a_tag(self) -> str:
        pass


class CitationMUTCSpan(MUTCSpan):

    def __init__(self, char_range: list[int], typ: MUTCSpanType, text: str, index: int, ref: Ref, failed=False, ambiguous=False):
        super().__init__(char_range, typ, text, index, failed, ambiguous)
        self.ref = ref
    
    def wrap_span_in_a_tag(self) -> str:
        href, tref = "", ""
        if self.ref:
            href = self.ref.url()
            tref = self.ref.normal()
        return (f'<a class="mutc refLink {self.get_success_css_class()}"'
                f' href="{href}" data-ref="{escape(tref)}"'
                f' data-index={self.index}>{self.text}</a>')
    
    
class NamedEntityMUTCSpan(MUTCSpan):
    def __init__(self, char_range: list[int], typ: MUTCSpanType, text: str, index: int, topic_slug: str, failed=False, ambiguous=False):
        super().__init__(char_range, typ, text, index, failed, ambiguous)
        self.topic_slug = topic_slug
        
    def wrap_span_in_a_tag(self) -> str:
        href = self.topic_slug or ""
        return (f'<a class="mutc namedEntityLink {self.get_success_css_class()}"'
                f' href="/topics/{href}" data-slug="{self.topic_slug}"'
                f' data-index={self.index}>{self.text}</a>')
    

class CategoryMUTCSpan(MUTCSpan):
    def __init__(self, char_range: list[int], typ: MUTCSpanType, text: str, index: int, category_path: list[str], failed=False, ambiguous=False):
        super().__init__(char_range, typ, text, index, failed, ambiguous)
        self.category_path = category_path
        
    def wrap_span_in_a_tag(self) -> str:
        href = "/".join(self.category_path)
        return (f'<a class="mutc categoryLink {self.get_success_css_class()}"'
                f' href="/texts/{href}" data-category-path="{href}"'
                f' data-index={self.index}>{self.text}</a>')
    
    
class MUTCSpanFactory:
    @staticmethod
    def create(char_range: list[int], typ: MUTCSpanType, text: str, index: int, topic_slug: str = None, tref: str = None, category_path: list[str] = None, failed=False, ambiguous=False) -> 'MUTCSpan':
        if typ == MUTCSpanType.CITATION:
            oref = Ref(tref) if tref else None
            return CitationMUTCSpan(char_range, typ, text, index, oref, failed, ambiguous)
        if typ == MUTCSpanType.NAMED_ENTITY:
            return NamedEntityMUTCSpan(char_range, typ, text, index, topic_slug, failed, ambiguous)
        if typ == MUTCSpanType.CATEGORY:
            return CategoryMUTCSpan(char_range, typ, text, index, category_path, failed, ambiguous)
        raise ValueError(f"MUTCSpanFactory.create(): Unsupported MUTCSpanType: {typ}")


def process_index_title_change_in_marked_up_text_chunks(indx, **kwargs):
    print("Cascading Marked Up Text Chunks from {} to {}".format(kwargs['old'], kwargs['new']))

    # ensure that the regex library we're using here is the same regex library being used in `Ref.regex`
    from .text import re as reg_reg
    patterns = [pattern.replace(reg_reg.escape(indx.title), reg_reg.escape(kwargs["old"]))
                for pattern in Ref(indx.title).regex(as_list=True)]
    queries = [{'ref': {'$regex': pattern}} for pattern in patterns]
    objs = MarkedUpTextChunkSet({"$or": queries})
    for o in objs:
        o.ref = o.ref.replace(kwargs["old"], kwargs["new"], 1)
        try:
            o.save()
        except InputError:
            logger.warning("Failed to convert ref data from: {} to {}".format(kwargs['old'], kwargs['new']))


def process_index_delete_in_marked_up_text_chunks(indx, **kwargs):
    from sefaria.model.text import prepare_index_regex_for_dependency_process
    pattern = prepare_index_regex_for_dependency_process(indx)
    MarkedUpTextChunkSet({"ref": {"$regex": pattern}}).delete()
