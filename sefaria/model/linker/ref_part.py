from typing import List, Union, Dict, Optional, Tuple, Iterable
from enum import Enum
from sefaria.system.exceptions import InputError
from sefaria.model import abstract as abst
from sefaria.model import schema
import structlog
logger = structlog.get_logger(__name__)
try:
    import spacy
    from spacy.tokens import Span, Token, Doc
    from spacy.language import Language
except ImportError:
    spacy = Doc = Span = Token = Language = None


# keys correspond named entity labels in spacy models
# values are properties in RefPartType
LABEL_TO_REF_PART_TYPE_ATTR = {
    # HE
    "כותרת": 'NAMED',
    "מספר": "NUMBERED",
    "דה": "DH",
    "סימן-טווח": "RANGE_SYMBOL",
    "לקמן-להלן": "RELATIVE",
    "שם": "IBID",
    "לא-רציף": "NON_CTS",
    # EN
    "title": 'NAMED',
    "number": "NUMBERED",
    "DH": "DH",
    "range-symbol": "RANGE_SYMBOL",
    "dir-ibid": "RELATIVE",
    "ibid": "IBID",
    "non-cts": "NON_CTS",
}

SpanOrToken = Union[Span, Token]  # convenience type since Spans and Tokens are very similar


class TrieEntry:
    """
    Base class for entries in MatchTemplateTrie
    """
    key_is_id = False  # is key an ID which shouldn't be manipulated with string functions?

    def key(self):
        return hash(self)


class LeafTrieEntry:
    pass


# static entry which represents a leaf entry in MatchTemplateTrie
LEAF_TRIE_ENTRY = LeafTrieEntry()


def span_inds(span: SpanOrToken) -> Tuple[int, int]:
    """
    @return: start and end word-indices for `span`, relative to `spacy.Doc` which contains the span.
    """
    start = span.start if isinstance(span, Span) else span.i
    end = span.end if isinstance(span, Span) else (span.i+1)
    return start, end


def span_char_inds(span: SpanOrToken) -> Tuple[int, int]:
    """
    @param span:
    @return: start and end char-indices for `span`, relative to `spacy.Doc` which contains the span.
    """
    if isinstance(span, Span):
        return span.start_char, span.end_char
    elif isinstance(span, Token):
        idx = span.idx
        return idx, idx + len(span)


class RefPartType(Enum):
    NAMED = "named"
    NUMBERED = "numbered"
    DH = "dibur_hamatchil"
    RANGE_SYMBOL = "range_symbol"
    RANGE = "range"
    RELATIVE = "relative"
    IBID = "ibid"
    NON_CTS = "non_cts"

    @classmethod
    def span_label_to_enum(cls, span_label: str) -> 'RefPartType':
        """
        Convert span label from spacy named entity to RefPartType
        """
        return getattr(cls, LABEL_TO_REF_PART_TYPE_ATTR[span_label])


class RawRefPart(TrieEntry, abst.Cloneable):
    """
    Immutable part of a RawRef
    Represents a unit of text used to find a match to a SchemaNode
    """
    key_is_id = False
    max_dh_continuation_len = 4  # max num tokens in potential_dh_continuation.

    def __init__(self, type: RefPartType, span: Optional[SpanOrToken], potential_dh_continuation: SpanOrToken = None):
        self.span = span
        self.type = type
        self.potential_dh_continuation = self.__truncate_potential_dh_continuation(potential_dh_continuation)

    def __truncate_potential_dh_continuation(self, potential_dh_continuation: SpanOrToken) -> Optional[SpanOrToken]:
        if potential_dh_continuation is None or isinstance(potential_dh_continuation, Token):
            return potential_dh_continuation
        return potential_dh_continuation[:self.max_dh_continuation_len]

    def __str__(self):
        return f"{self.__class__.__name__}: {self.span}, {self.type}"

    def __repr__(self):
        return f"{self.__class__.__name__}({self.span}, {self.dh_cont_text})"

    def __eq__(self, other):
        return isinstance(other, self.__class__) and self.__hash__() == other.__hash__()

    def __hash__(self):
        return hash(f"{self.type}|{self.span.__hash__()}|{self.dh_cont_text}")

    def __ne__(self, other):
        return not self.__eq__(other)

    def key(self):
        return self.text

    @property
    def text(self):
        return self.span.text

    @property
    def dh_cont_text(self):
        return '' if self.potential_dh_continuation is None else self.potential_dh_continuation.text

    def get_dh_text_to_match(self, lang: str) -> Iterable[Tuple[str, int]]:
        import re2
        reg = r'^(?:ב?ד"ה )?(.+?)$' if lang == 'he' else r'^(?:s ?\. ?v ?\. )?(.+?)$'
        match = re2.match(reg, self.text)
        if match is None:
            return []
        dh = match.group(1)
        if self.potential_dh_continuation:
            yield from self.__enumerate_potential_dh_continuations(dh)
        # no matter what yield just the dh
        yield dh, 0

    def __enumerate_potential_dh_continuations(self, dh: str) -> Iterable[Tuple[str, int]]:
        for potential_dh_token_idx in range(len(self.potential_dh_continuation), 0, -1):
            temp_dh = f"{dh} {self.potential_dh_continuation[:potential_dh_token_idx]}"
            yield temp_dh, potential_dh_token_idx

    @property
    def is_context(self):
        return isinstance(self, ContextPart)

    @property
    def char_indices(self) -> Tuple[int, int]:
        """
        Return start and end char indices of underlying text
        """
        return span_char_inds(self.span)

    def realign_to_new_raw_ref(self, old_raw_ref_span: SpanOrToken, new_raw_ref_span: SpanOrToken):
        """
        If span of raw_ref backing this ref_part changes, use this to align self.span to new raw_ref span
        """
        new_raw_ref_doc = new_raw_ref_span.as_doc()
        part_start, part_end = span_inds(self.span)
        old_raw_start, _ = span_inds(old_raw_ref_span)
        new_raw_start, _ = span_inds(new_raw_ref_span)
        offset = new_raw_start - old_raw_start
        return self.clone(span=new_raw_ref_doc[part_start-offset:part_end-offset])

    def merge(self, other: 'RawRefPart') -> None:
        """
        Merge spans of two RawRefParts.
        Assumes other has same type as self
        """
        assert other.type == self.type
        self_start, self_end = span_inds(self.span)
        other_start, other_end = span_inds(other.span)
        if other_start < self_start:
            other.merge(self)
            return
        self.span = self.span.doc[self_start:other_end]


class ContextPart(RawRefPart):
    # currently used to easily differentiate TermContext and SectionContext from a vanilla RawRefPart
    pass


class TermContext(ContextPart):
    """
    Represents context backed by a NonUniqueTerm
    """
    key_is_id = True

    def __init__(self, term: schema.NonUniqueTerm):
        super().__init__(RefPartType.NAMED, None)
        self.term = term

    def key(self):
        return f"{self.__class__.__name__}({self.term.slug})"

    @property
    def text(self):
        return self.__str__()

    def __str__(self):
        return self.__repr__()

    def __repr__(self):
        return self.key()

    def __hash__(self):
        return hash(self.__repr__())


class SectionContext(ContextPart):
    """
    Represents a section in a context ref
    Used for injecting section context into a match which is missing sections (e.g. 'Tosafot on Berakhot DH abcd' is missing a daf)
    NOTE: used to used index of section to help validate. Doesn't work b/c we change sections list on the nodes as we refine them
    """

    def __init__(self, addr_type: schema.AddressType, section_name: str, address: int) -> None:
        """
        :param addr_type: AddressType of section
        :param section_name: Name of section
        :param address: Actual address, to be interpreted by `addr_type`
        """
        super().__init__(RefPartType.NUMBERED, None)
        self.addr_type = addr_type
        self.section_name = section_name
        self.address = address

    @property
    def text(self):
        addr_name = self.addr_type.__class__.__name__
        return f"{self.__class__.__name__}({addr_name}(0), '{self.section_name}', {self.address})"

    def __str__(self):
        return self.text

    def __repr__(self):
        return self.text

    def __hash__(self):
        return hash(f"{self.addr_type.__class__}|{self.section_name}|{self.address}")


class RangedRawRefParts(RawRefPart):
    """
    Container for ref parts that represent the sections and toSections of a ranged ref
    """
    def __init__(self, sections: List[RawRefPart], toSections: List[RawRefPart], **kwargs):
        super().__init__(RefPartType.RANGE, self._get_full_span(sections, toSections))
        self.sections = sections
        self.toSections = toSections

    def __eq__(self, other):
        return isinstance(other, self.__class__) and self.__hash__() == other.__hash__()

    def __hash__(self):
        return hash(hash(p) for p in (self.sections + self.toSections))

    def __ne__(self, other):
        return not self.__eq__(other)

    @staticmethod
    def _get_full_span(sections, toSections):
        start_span = sections[0].span
        start_token_i = span_inds(start_span)[0]
        end_token_i = span_inds(toSections[-1].span)[1]
        return start_span.doc[start_token_i:end_token_i]


class RawRef(abst.Cloneable):
    """
    Span of text which may represent one or more Refs
    Contains RawRefParts
    """
    def __init__(self, lang: str, raw_ref_parts: list, span: SpanOrToken, **clonable_kwargs) -> None:
        """

        @param lang:
        @param raw_ref_parts:
        @param span:
        @param clonable_kwargs: kwargs when running Clonable.clone()
        """
        self.lang = lang
        self.raw_ref_parts = self._group_ranged_parts(raw_ref_parts)
        self.parts_to_match = self.raw_ref_parts  # actual parts that will be matched. different when their are context swaps
        self.prev_num_parts_map = self._get_prev_num_parts_map(self.raw_ref_parts)
        for k, v in clonable_kwargs.items():
            setattr(self, k, v)
        self.span = span

    @staticmethod
    def _group_ranged_parts(raw_ref_parts: List['RawRefPart']) -> List['RawRefPart']:
        """
        Preprocessing function to group together RawRefParts which represent ranged sections
        """
        ranged_symbol_ind = None
        for i, part in enumerate(raw_ref_parts):
            if part.type == RefPartType.RANGE_SYMBOL:
                ranged_symbol_ind = i
                break
        if ranged_symbol_ind is None or ranged_symbol_ind == len(raw_ref_parts) - 1: return raw_ref_parts
        section_slice, toSection_slice = None, None
        for i in range(ranged_symbol_ind-1, -1, -1):
            if i == 0 or raw_ref_parts[i-1].type != RefPartType.NUMBERED:
                section_slice = slice(i, ranged_symbol_ind)
                break
        for i in range(ranged_symbol_ind+1, len(raw_ref_parts)):
            if i == len(raw_ref_parts) - 1 or raw_ref_parts[i+1].type != RefPartType.NUMBERED:
                toSection_slice = slice(ranged_symbol_ind+1, i+1)
                break
        if section_slice is None: return raw_ref_parts
        sections = raw_ref_parts[section_slice]
        toSections = sections[:]
        num_explicit_to_sections = toSection_slice.stop - toSection_slice.start
        toSections[-num_explicit_to_sections:] = raw_ref_parts[toSection_slice]
        new_raw_ref_parts = raw_ref_parts[:section_slice.start] + \
                            [RangedRawRefParts(sections, toSections)] + \
                            raw_ref_parts[toSection_slice.stop:]
        return new_raw_ref_parts

    @staticmethod
    def _get_prev_num_parts_map(raw_ref_parts: List[RawRefPart]) -> Dict[RawRefPart, RawRefPart]:
        """
        Helper function to avoid matching NUMBERED RawRefParts that match AddressInteger sections out of order
        AddressInteger sections must resolve in order because resolving out of order would be meaningless
        Returns a map from NUMBERED RawRefParts to directly preceeding NUMBERED RawRefParts
        """
        if len(raw_ref_parts) == 0: return {}
        prev_num_parts_map = {}
        prev_part = raw_ref_parts[0]
        for part in raw_ref_parts[1:]:
            if prev_part.type == RefPartType.NUMBERED and part.type == RefPartType.NUMBERED:
                prev_num_parts_map[part] = prev_part
            prev_part = part
        return prev_num_parts_map

    def subspan(self, part_slice: slice) -> SpanOrToken:
        """
        Return subspan covered by `part_slice`, relative to self.span
        """
        parts = self.raw_ref_parts[part_slice]
        start_token_i = span_inds(parts[0].span)[0]
        end_token_i = span_inds(parts[-1].span)[1]

        offset_i = span_inds(self.span)[0]
        subspan = self.span.doc[offset_i+start_token_i:offset_i+end_token_i]
        # potentially possible that tokenization of raw ref spans is not identical to that of ref parts. check to make sure.
        assert subspan.text == parts[0].span.doc[start_token_i:end_token_i].text, f"{subspan.text} != {parts[0].span.doc[start_token_i:end_token_i].text}"
        return subspan

    def split_part(self, part: RawRefPart, str_end) -> Tuple['RawRef', RawRefPart, RawRefPart]:
        """
        split `part` into two parts based on strings in `str_split`
        Return new RawRef with split parts (doesn't modify self)
        Will raise InputError if the strings in str_split don't fall on token boundaries
        @param part: original part to be split
        @param str_end: end string
        @return: new RawRef with split parts
        """
        start_char, end_char = span_char_inds(part.span)
        pivot = len(part.text) - len(str_end) + start_char
        aspan = part.span.doc.char_span(0, pivot, alignment_mode='contract')
        bspan = part.span.doc.char_span(pivot, end_char, alignment_mode='contract')
        if aspan is None or bspan is None:
            raise InputError(f"Couldn't break on token boundaries for strings '{self.text[0:pivot]}' and '{self.text[pivot:end_char]}'")
        apart = part.clone(span=aspan)
        bpart = part.clone(span=bspan)

        # splice raw_ref_parts
        try:
            orig_part_index = self.raw_ref_parts.index(part)
            new_parts = self.raw_ref_parts[:]
            new_parts[orig_part_index:orig_part_index+1] = [apart, bpart]
        except ValueError:
            new_parts = self.raw_ref_parts
        # splice parts_to_match
        try:
            orig_part_index = self.parts_to_match.index(part)
            new_parts_to_match = self.parts_to_match[:]
            new_parts_to_match[orig_part_index:orig_part_index+1] = [apart, bpart]
        except ValueError:
            new_parts_to_match = self.parts_to_match
        return self.clone(raw_ref_parts=new_parts, parts_to_match=new_parts_to_match), apart, bpart

    @property
    def text(self):
        """
        Return text of underlying span
        """
        return self.span.text

    @property
    def char_indices(self) -> Tuple[int, int]:
        """
        Return start and end char indices of underlying text
        """
        return span_char_inds(self.span)

    def map_new_indices(self, new_doc: Doc, new_indices: Tuple[int, int], new_part_indices: List[Tuple[int, int]]) -> None:
        """
        Remap self.span and all spans of parts to new indices
        """
        self.span = new_doc.char_span(*new_indices)
        if self.span is None: raise InputError(f"${new_indices} don't match token boundaries. Using 'expand' alignment mode text is '{new_doc.char_span(*new_indices, alignment_mode='expand')}'")
        doc_span = self.span.as_doc()
        for part, temp_part_indices in zip(self.raw_ref_parts, new_part_indices):
            part.span = doc_span.char_span(*[i-new_indices[0] for i in temp_part_indices])
            if part.span is None: raise InputError(f"{temp_part_indices} doesn't match token boundaries for part {part}. Using 'expand' alignment mode text is '{new_doc.char_span(*temp_part_indices, alignment_mode='expand')}'")
