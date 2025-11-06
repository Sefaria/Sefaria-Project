from sefaria.model.abstract import AbstractMongoRecord, AbstractMongoSet
from sefaria.model.text import TextChunk, Ref
from sefaria.system.exceptions import InputError, DuplicateRecordError
from html import escape
from enum import Enum
from abc import ABC, abstractmethod
import structlog
logger = structlog.get_logger(__name__)


class MUTCSpanType(Enum):
    QUOTE = "quote"
    NAMED_ENTITY = "named-entity"
    CITATION = "citation"


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
                }
            },
            "required": True
        }
    }
    
    def get_spans(self):
        pass

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

    def __str__(self):
        return "TextSpan: {}".format(self.ref)

    def apply_spans_to_text(self, text):
        """
        Applies the spans defined in this MarkedUpTextChunk to the provided text.
        For now, we assume that all spans are "citation" spans, will extend it in the future to support "quote" spans.
        Returns a text with HTML anchor tags inserted for each span.
        """

        spans = self.spans

        if not spans:
            return text

        # Insert from the right so earlier insertions don't shift later indices.
        spans_sorted = sorted(spans, key=lambda sp: sp["charRange"][0], reverse=True)

        out = text
        for raw_sp in spans_sorted:
            sp = MUTCSpanFactory.create(raw_sp["charRange"], MUTCSpanType(raw_sp["type"]), raw_sp["text"], raw_sp.get("topicSlug"), raw_sp.get("ref"))
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
    
    def __init__(self, char_range: list[int], typ: MUTCSpanType, text: str):
        self.char_range = char_range
        self.typ = typ
        self.text = text
        
    @abstractmethod
    def wrap_span_in_a_tag(self) -> str:
        pass
        

class CitationMUTCSpan(MUTCSpan):

    def __init__(self, char_range: list[int], typ: MUTCSpanType, text: str, ref: Ref):
        super().__init__(char_range, typ, text)
        self.ref = ref
    
    def wrap_span_in_a_tag(self) -> str:
        href = self.ref.url()
        return f'<a class="refLink" href="{href}" data-ref="{escape(self.ref.normal())}">{self.text}</a>'
    
    
class NamedEntityMUTCSpan(MUTCSpan):
    def __init__(self, char_range: list[int], typ: MUTCSpanType, text: str, topic_slug: str):
        super().__init__(char_range, typ, text)
        self.topic_slug = topic_slug
        
    def wrap_span_in_a_tag(self) -> str:
        href = self.topic_slug
        return f'<a href="/topics/{href}" class="namedEntityLink" data-slug="{self.topic_slug}">{self.text}</a>'
    
    
class MUTCSpanFactory:
    @staticmethod
    def create(char_range: list[int], typ: MUTCSpanType, text: str, topic_slug: str = None, tref: str = None) -> 'MUTCSpan':
        if typ == MUTCSpanType.CITATION:
            return CitationMUTCSpan(char_range, typ, text, Ref(tref))
        if typ == MUTCSpanType.NAMED_ENTITY:
            return NamedEntityMUTCSpan(char_range, typ, text, topic_slug)


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
