from collections import defaultdict
from typing import List, Union, Dict, Optional, Tuple, Generator, Iterable, Set
from enum import Enum
from functools import reduce
from itertools import product
from sefaria.system.exceptions import InputError
from . import abstract as abst
from . import text
from . import schema
import spacy
from tqdm import tqdm
from spacy.tokens import Span, Token
from spacy.language import Language

spacy.prefer_gpu()

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


def span_inds(span: SpanOrToken) -> Tuple[int, int]:
    """
    For some reason, spacy makes it difficult to deal with indices in tokens and spans
    These classes use different fields for their indices
    This function unifies access to indices
    """
    start = span.start if isinstance(span, Span) else span.i
    end = span.end if isinstance(span, Span) else (span.i+1)
    return start, end


def span_char_inds(span: SpanOrToken) -> Tuple[int, int]:
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


class ResolutionMethod(Enum):
    """
    Possible methods for resolving refs
    Used to mark ResolvedRawRefs
    """
    GRAPH = "graph"
    TITLE = "title"
    NON_CTS = "non_cts"


class TrieEntry:
    """
    Base class for entries in RefPartTitleTrie
    """
    is_id = False  # is key an ID which shouldn't be manipulated with string functions?

    def key(self):
        return hash(self)


class LeafTrieEntry:
    pass


# static entry which represents a leaf entry in RefPartTitleTrie
LEAF_TRIE_ENTRY = LeafTrieEntry()


class NonUniqueTerm(abst.AbstractMongoRecord, schema.AbstractTitledObject, TrieEntry):
    """
    The successor of the old `Term` class
    Doesn't require titles to be globally unique
    """
    collection = "non_unique_terms"
    required_attrs = [
        "slug",
        "titles"
    ]
    optional_attrs = [
        "ref_part_role",  # currently either "structural", "context_swap" or "alt_title". structural should be used for terms that used to define a logical relationship between ref parts (e.g. 'yerushalmi'). "alt_title" is for parts that are only included to generate more alt_titles (e.g. 'sefer'). "context_swap" is for parts that are meant to be swapped via SchemaNode.ref_resolver_context_swaps
    ]
    slug_fields = ['slug']
    is_id = True
    title_group = None
    
    def _normalize(self):
        super()._normalize()
        self.titles = self.title_group.titles

    def set_titles(self, titles):
        self.title_group = schema.TitleGroup(titles)

    def _set_derived_attributes(self):
        self.set_titles(getattr(self, "titles", None))

    def key(self):
        return f'{self.__class__.__name__}|{self.slug}'


class NonUniqueTermSet(abst.AbstractMongoSet):
    recordClass = NonUniqueTerm


class MatchTemplate:
    """
    Template for matching a SchemaNode to a RawRef
    """
    def __init__(self, term_slugs, scope='combined'):
        self.term_slugs = term_slugs
        self.scope = scope

    def get_terms(self) -> Iterable[NonUniqueTerm]:
        for slug in self.term_slugs:
            yield NonUniqueTerm.init(slug)

    terms = property(get_terms)


class RawRefPart(TrieEntry):
    """
    Immutable part of a RawRef
    Represents a unit of text used to find a match to a SchemaNode
    """
    is_context = False
    is_id = False
    max_dh_continuation_len = 4  # max num tokens in potential_dh_continuation. more likely doesn't add more information

    def __init__(self, type: 'RefPartType', span: SpanOrToken, potential_dh_continuation: SpanOrToken = None) -> None:
        self.span = span
        self.type = type
        if potential_dh_continuation is not None:
            if isinstance(potential_dh_continuation, Span) and len(potential_dh_continuation) > self.max_dh_continuation_len:
                potential_dh_continuation = potential_dh_continuation[:self.max_dh_continuation_len]
        self.potential_dh_continuation = potential_dh_continuation

    def __str__(self):
        return f"{self.__class__.__name__}: {self.span}, Type = {self.type}"

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

    def get_dh_text_to_match(self) -> Iterable[str]:
        import re
        m = re.match(r'^(?:(?:\u05d3"\u05d4|s ?\. ?v ?\.) )?(.+?)$', self.text)
        if m is not None:
            dh = m.group(1)
            if self.potential_dh_continuation:
                for i in range(len(self.potential_dh_continuation), 0, -1):
                    yield f"{dh} {self.potential_dh_continuation[:i]}"
            # no matter what yield just the dh
            yield dh


class SectionContext(RawRefPart):
    """
    Represents a section in a context ref
    Used for injecting section context into a match which is missing sections (e.g. 'Tosafot on Berakhot DH abcd' is missing a daf)
    """
    is_context = True

    def __init__(self, addr_type: schema.AddressType, section_name: str, section_index: int, address: int) -> None:
        """
        :param addr_type: AddressType of section
        :param section_name: Name of section
        :param section_index: Index of section in node.sections
        :param address: Actual address, to be interpreted by `addr_type`
        """
        super().__init__(RefPartType.NUMBERED, None)
        self.addr_type = addr_type
        self.section_name = section_name
        self.section_index = section_index
        self.address = address

    @property
    def text(self):
        return self.__str__()

    def __str__(self):
        return self.__repr__()

    def __repr__(self):
        addr_name = self.addr_type.__class__.__name__
        return f"{self.__class__.__name__}({addr_name}(0), '{self.section_name}', {self.section_index}, {self.address})"

    def __eq__(self, other):
        return isinstance(other, self.__class__) and self.__hash__() == other.__hash__()

    def __hash__(self):
        return hash(f"{self.addr_type.__class__}|{self.section_name}|{self.section_index}|{self.address}")

    def __ne__(self, other):
        return not self.__eq__(other)


class RangedRawRefParts(RawRefPart):
    """
    Container for ref parts that represent the sections and toSections of a ranged ref
    """
    def __init__(self, sections: List['RawRefPart'], toSections: List['RawRefPart']):
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


class RawRef:
    """
    Span of text which may represent one or more Refs
    Contains RawRefParts
    """
    def __init__(self, raw_ref_parts: list, span: SpanOrToken) -> None:
        self.raw_ref_parts = self._group_ranged_parts(raw_ref_parts)
        self.prev_num_parts_map = self._get_prev_num_parts_map(self.raw_ref_parts)
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
        # unfortunately, the two models were trained using different tokenizers leading to potential differences in token indexes
        assert subspan.text == parts[0].span.doc[start_token_i:end_token_i].text, f"{subspan.text} != {parts[0].span.doc[start_token_i:end_token_i].text}"
        return subspan

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


class ResolvedRawRef:
    """
    Partial or complete resolution of a RawRef
    """

    def __init__(self, raw_ref: 'RawRef', resolved_ref_parts: List['RawRefPart'], node, ref: text.Ref, resolved_context_terms: List[NonUniqueTerm]=None, ambiguous=False, resolution_method: ResolutionMethod=None) -> None:
        self.raw_ref = raw_ref
        self.resolved_ref_parts = resolved_ref_parts
        self.resolved_context_terms = resolved_context_terms
        self.node = node
        self.ref = ref
        self.ambiguous = ambiguous
        self.resolution_method = resolution_method

    def clone(self, **kwargs) -> 'ResolvedRawRef':
        """
        Return new ResolvedRawRef with all the same data except modifications specified in kwargs
        """
        return ResolvedRawRef(**{**self.__dict__, **kwargs})

    def get_unused_ref_parts_or_section_contexts(self, section_contexts: List[SectionContext]) -> List[RawRefPart]:
        """
        Return ref parts or section contexts which haven't yet been used in this match
        """
        all_parts = self.raw_ref.raw_ref_parts + section_contexts
        return [part for part in all_parts if part not in self.resolved_ref_parts]

    def has_prev_unused_numbered_ref_part(self, raw_ref_part: RawRefPart) -> bool:
        """
        Helper function to avoid matching AddressInteger sections out of order
        Returns True if there is a RawRefPart which immediately precedes `raw_ref_part` and is not yet included in this match
        """
        prev_part = self.raw_ref.prev_num_parts_map.get(raw_ref_part, None)
        if prev_part is None: return False
        return prev_part not in self.resolved_ref_parts

    def _get_refined_match_for_dh_part(self, raw_ref_part: 'RawRefPart', refined_ref_parts: List['RawRefPart'], node: schema.DiburHamatchilNodeSet):
        """
        Finds dibur hamatchil ref which best matches `raw_ref_part`
        Currently a very simplistic algorithm
        If there is a DH match, return the corresponding ResolvedRawRef
        """
        max_node, max_score, max_dh = node.best_fuzzy_match_score(raw_ref_part)
        # TODO modify self with final dh
        if max_score == 1.0:
            return self.clone(resolved_ref_parts=refined_ref_parts, node=max_node, ref=text.Ref(max_node.ref))

    def _get_refined_refs_for_numbered_part(self, raw_ref_part: RawRefPart, refined_ref_parts: List[RawRefPart], node, lang, fromSections: List[RawRefPart]=None) -> List['ResolvedRawRef']:
        if node is None: return []
        try:
            possible_sections, possible_to_sections, addr_classes = node.address_class(0).get_all_possible_sections_from_string(lang, raw_ref_part.text, fromSections)
        except (IndexError, TypeError, KeyError):
            return []
        refined_refs = []
        addr_classes_used = []
        for sec, toSec, addr_class in zip(possible_sections, possible_to_sections, addr_classes):
            if self.has_prev_unused_numbered_ref_part(raw_ref_part) and addr_class == schema.AddressInteger:
                """
                If raw_ref has NUMBERED parts [a, b]
                and part b matches before part a
                and part b gets matched as AddressInteger
                discard match because AddressInteger parts need to match in order
                """
                continue
            try:
                refined_ref = self.ref.subref(sec)
                if toSec != sec:
                    to_ref = self.ref.subref(toSec)
                    refined_ref = refined_ref.to(to_ref)
                refined_refs += [refined_ref]
                addr_classes_used += [addr_class]
            except (InputError, AssertionError):
                continue
        return [self.clone(resolved_ref_parts=refined_ref_parts, node=node, ref=refined_ref) for refined_ref in refined_refs]

    def _get_refined_refs_for_numbered_context_part(self, sec_context: SectionContext, refined_ref_parts: List[RawRefPart], node) -> List['ResolvedRawRef']:
        if node is None or not node.address_matches_section_context(0, sec_context):
            return []
        try:
            refined_ref = self.ref.subref(sec_context.address)
        except (IndexError, AssertionError):
            return []
        return [self.clone(resolved_ref_parts=refined_ref_parts, node=node, ref=refined_ref)]

    def _get_refined_matches_for_ranged_sections(self, sections: List['RawRefPart'], refined_ref_parts: List['RawRefPart'], node, lang, fromSections: list=None):
        resolved_raw_refs = [self.clone(resolved_ref_parts=refined_ref_parts, node=node, ref=node.ref())]
        incomplete_resolved_raw_refs = []
        is_first_pass = True
        for section_part in sections:
            queue_len = len(resolved_raw_refs)
            for _ in range(queue_len):
                temp_resolved_raw_ref = resolved_raw_refs.pop(0)
                if not is_first_pass:
                    temp_resolved_raw_ref.node = temp_resolved_raw_ref.node.get_referenceable_child(temp_resolved_raw_ref.ref)
                is_first_pass = False
                next_resolved_raw_refs = temp_resolved_raw_ref._get_refined_refs_for_numbered_part(section_part, refined_ref_parts, temp_resolved_raw_ref.node, lang, fromSections)
                resolved_raw_refs += next_resolved_raw_refs
                if len(next_resolved_raw_refs) == 0:
                    incomplete_resolved_raw_refs += [temp_resolved_raw_ref]
        return resolved_raw_refs, incomplete_resolved_raw_refs

    def _get_refined_matches_for_ranged_part(self, raw_ref_part: 'RangedRawRefParts', refined_ref_parts: List['RawRefPart'], node, lang) -> List['ResolvedRawRef']:
        section_resolved_raw_refs, incomplete_section_refs = self._get_refined_matches_for_ranged_sections(raw_ref_part.sections, refined_ref_parts, node, lang)
        toSection_resolved_raw_refs, _ = self._get_refined_matches_for_ranged_sections(raw_ref_part.toSections, refined_ref_parts, node, lang, fromSections=[x.ref.sections for x in section_resolved_raw_refs])
        ranged_resolved_raw_refs = []
        for section, toSection in product(section_resolved_raw_refs, toSection_resolved_raw_refs):
            try:
                ranged_resolved_raw_refs += [self.clone(resolved_ref_parts=refined_ref_parts, node=section.node, ref=section.ref.to(toSection.ref))]
            except InputError:
                continue
        if len(section_resolved_raw_refs) == 0:
            # TODO do we only want to include incomplete refs when they are no complete ones? probably.
            ranged_resolved_raw_refs += incomplete_section_refs
        return ranged_resolved_raw_refs

    def get_refined_matches(self, part: RawRefPart, node, lang: str) -> List['ResolvedRawRef']:
        refined_ref_parts = self.resolved_ref_parts + [part]
        matches = []
        # see NumberedTitledTreeNode.get_referenceable_child() for why we check if parent is None
        if part.type == RefPartType.NUMBERED and isinstance(node, schema.JaggedArrayNode) and node.parent is None:
            if part.is_context:
                matches += self._get_refined_refs_for_numbered_context_part(part, refined_ref_parts, node)
            else:
                matches += self._get_refined_refs_for_numbered_part(part, refined_ref_parts, node, lang)
        elif part.type == RefPartType.RANGE and isinstance(node, schema.JaggedArrayNode):
            matches += self._get_refined_matches_for_ranged_part(part, refined_ref_parts, node, lang)
        elif (part.type == RefPartType.NAMED and isinstance(node, schema.TitledTreeNode) or
              part.type == RefPartType.NUMBERED and isinstance(node, schema.ArrayMapNode)) or \
        part.type == RefPartType.NUMBERED and isinstance(node, schema.SchemaNode): # for case of numbered alt structs or schema nodes that look numbered (e.g. perakim and parshiot of Sifra)
            if node.ref_part_title_trie(lang).has_continuations(part.key(), key_is_id=part.is_id):
                matches += [self.clone(resolved_ref_parts=refined_ref_parts, node=node, ref=node.ref())]
        elif part.type == RefPartType.DH:
            if isinstance(node, schema.JaggedArrayNode):
                # jagged array node can be skipped entirely if it has a dh child
                # technically doesn't work if there is a referenceable child in between ja and dh node
                node = node.get_referenceable_child(self.ref)
            if isinstance(node, schema.DiburHamatchilNodeSet):
                dh_match = self._get_refined_match_for_dh_part(part, refined_ref_parts, node)
                if dh_match is not None:
                    matches += [dh_match]
        # TODO sham and directional cases
        return matches

    @property
    def num_resolved(self):
        return len(self.resolved_ref_parts) + len(self.resolved_context_terms)

    @property
    def order_key(self):
        """
        For sorting
        """
        return len(self.resolved_ref_parts), len(self.resolved_context_terms)


PREFIXES = {'ב', 'וב', 'ע', 'ו'}  # careful of Ayin prefix...


def get_prefixless_inds(st: str) -> List[int]:
    """
    get possible indices of start of string `st` with prefixes stripped
    """
    starti_list = []
    for prefix in PREFIXES:
        if not st.startswith(prefix): continue
        starti_list += [len(prefix)]
    return starti_list


class RefPartTitleTrie:
    """
    Trie for titles. Keys are titles from match_templates on nodes.
    E.g. if there is match template with term slugs ["term1", "term2"], term1 has title "Term 1", term2 has title "Term 2"
    then an entry in the trie would be {"Term 1": {"Term 2": ...}}
    """
    def __init__(self, lang, nodes=None, sub_trie=None, scope=None) -> None:
        """
        :param lang:
        :param nodes:
        :param sub_trie:
        :param scope: str. scope of the trie. if 'alone', take into account `match_templates` marked with scope "alone" or "any".
        """
        self.lang = lang
        self.scope = scope
        if nodes is not None:
            self.__init_with_nodes(nodes)
        else:
            self._trie = sub_trie

    def __init_with_nodes(self, nodes):
        from .schema import TitledTreeNode
        self._trie = {}
        for node in nodes:
            assert isinstance(node, TitledTreeNode)
            is_index_level = getattr(node, 'index', False) and node == node.index.nodes
            for match_template in node.get_match_templates():
                if not is_index_level and self.scope != 'any' and match_template.scope != 'any' and self.scope != match_template.scope: continue
                curr_dict_queue = [self._trie]
                for term in match_template.terms:
                    len_curr_dict_queue = len(curr_dict_queue)
                    for _ in range(len_curr_dict_queue):
                        curr_dict = curr_dict_queue.pop(0)
                        curr_dict_queue += self.__get_sub_tries_for_term(term, curr_dict)
                # add nodes to leaves
                for curr_dict in curr_dict_queue:
                    leaf_node = node.index if is_index_level else node
                    if LEAF_TRIE_ENTRY in curr_dict:
                        curr_dict[LEAF_TRIE_ENTRY] += [leaf_node]
                    else:
                        curr_dict[LEAF_TRIE_ENTRY] = [leaf_node]

    @staticmethod
    def __get_sub_trie_for_new_key(key: str, curr_trie: dict) -> dict:
        if key in curr_trie:
            sub_trie = curr_trie[key]
        else:
            sub_trie = {}
            curr_trie[key] = sub_trie
        return sub_trie

    def __get_sub_tries_for_term(self, term: NonUniqueTerm, curr_trie: dict) -> List[dict]:
        sub_tries = []
        for title in term.get_titles(self.lang):
            sub_tries += [self.__get_sub_trie_for_new_key(title, curr_trie)]
        # also add term's key to trie for lookups from context ref parts
        sub_tries += [self.__get_sub_trie_for_new_key(term.key(), curr_trie)]
        return sub_tries

    def __getitem__(self, key):
        return self.get(key)        

    def get(self, key, default=None):
        sub_trie = self._trie.get(key, default)
        if sub_trie is None: return
        return RefPartTitleTrie(self.lang, sub_trie=sub_trie, scope=self.scope)

    def has_continuations(self, key: str, key_is_id=False) -> bool:
        """
        Does trie have continuations for `key`?
        :param key: key to look up in trie. may need to be split into multiple keys to find a continuation.
        :param key_is_id: True if key is ID that cannot be split into smaller keys (e.g. slug).
        """
        return self.get_continuations(key, default=None, key_is_id=key_is_id) is not None

    @staticmethod
    def _merge_two_tries(a, b):
        "merges b into a"
        for key in b:
            if key in a:
                if isinstance(a[key], dict) and isinstance(b[key], dict):
                    RefPartTitleTrie._merge_two_tries(a[key], b[key])
                elif a[key] == b[key]:
                    pass  # same leaf value
                elif isinstance(a[key], list) and isinstance(b[key], list):
                    a[key] += b[key]
                else:
                    raise Exception('Conflict in _merge_two_tries')
            else:
                a[key] = b[key]
        return a

    @staticmethod
    def _merge_n_tries(*tries):
        if len(tries) == 1:
            return tries[0]
        return reduce(RefPartTitleTrie._merge_two_tries, tries)

    def get_continuations(self, key: str, default=None, key_is_id=False):
        continuations = self._get_continuations_recursive(key, key_is_id=key_is_id)
        if len(continuations) == 0:
            return default
        merged = self._merge_n_tries(*continuations)
        return RefPartTitleTrie(self.lang, sub_trie=merged, scope=self.scope)

    def _get_continuations_recursive(self, key: str, prev_sub_tries=None, key_is_id=False):
        is_first = prev_sub_tries is None
        prev_sub_tries = prev_sub_tries or self._trie
        if key_is_id:
            # dont attempt to split key
            return [prev_sub_tries[key]] if key in prev_sub_tries else []
        next_sub_tries = []
        key = key.strip()
        starti_list = [0]
        if self.lang == 'he' and is_first:
            starti_list += get_prefixless_inds(key)
        for starti in starti_list:
            for endi in reversed(range(len(key)+1)):
                sub_key = key[starti:endi]
                if sub_key not in prev_sub_tries: continue
                if endi == len(key):
                    next_sub_tries += [prev_sub_tries[sub_key]]
                    continue
                temp_sub_tries = self._get_continuations_recursive(key[endi:], prev_sub_tries[sub_key])
                next_sub_tries += temp_sub_tries
        return next_sub_tries

    def __contains__(self, key):
        return key in self._trie

    def __iter__(self):
        for item in self._trie:
            yield item


class RefPartTitleGraph:
    """
    DAG which represents connections between terms in index titles
    where each connection is a pair of consecutive terms
    """
    def __init__(self, nodes: List[schema.TitledTreeNode]):
        self._graph = defaultdict(set)
        for node in nodes:
            for match_template in node.get_match_templates():
                if len(match_template.term_slugs) < 2: continue
                terms = list(match_template.terms)
                for iterm, term in enumerate(terms[:-1]):
                    next_term = terms[iterm+1]
                    if term.ref_part_role == 'structural' and next_term.ref_part_role == 'structural':
                        self._graph[term.slug].add(next_term.slug)

    def parent_has_child(self, parent: str, child: str) -> bool:
        """
        For case where context is Yerushalmi Berakhot 1:1 and ref is Shabbat 1:1. Want to infer that we're referring to
        Yerushalmi Shabbat
        """
        return child in self._graph[parent]

    def do_parents_share_child(self, parent1: str, parent2: str, child: str) -> bool:
        """
        For case where context is Yerushalmi Berakhot 1:1 and ref is Bavli 2a. Want to infer that we're referring to
        Bavli Berakhot 2a b/c Yerushalmi and Bavli share child Berakhot
        """
        return self.parent_has_child(parent1, child) and self.parent_has_child(parent2, child)

    def get_parent_for_children(self, context_match_templates: List[MatchTemplate], input_slugs: list) -> Optional[str]:
        for template in context_match_templates:
            for context_slug in template.term_slugs:
                for input_slug in input_slugs:
                    if self.parent_has_child(context_slug, input_slug):
                        return context_slug

    def get_shared_child(self, context_match_templates: List[MatchTemplate], input_slugs: List[str]) -> Optional[str]:
        for template in context_match_templates:
            for i, context_slug in enumerate(template.term_slugs[:-1]):
                next_context_slug = template.term_slugs[i+1]
                for input_slug in input_slugs:
                    if self.do_parents_share_child(context_slug, input_slug, next_context_slug):
                        return next_context_slug


class TermMatcher:
    """
    Used to match raw ref parts to non-unique terms naively.
    Stores all existing terms for speed.
    Used in context matching.
    """
    def __init__(self, lang: str, nonunique_terms: NonUniqueTermSet) -> None:
        self.lang = lang
        self._str2term_map = defaultdict(list)
        for term in nonunique_terms:
            for title in term.get_titles(lang):
                self._str2term_map[title] += [term]

    def match_term(self, ref_part: RawRefPart) -> List[NonUniqueTerm]:
        matches = []
        if ref_part.type != RefPartType.NAMED: return matches
        starti_inds = [0]
        if self.lang == 'he':
            starti_inds += get_prefixless_inds(ref_part.text)
        for starti in starti_inds:
            matches += self._str2term_map.get(ref_part.text[starti:], [])
        return matches

    def match_terms(self, ref_parts: List[RawRefPart]) -> List[NonUniqueTerm]:
        matches = []
        for part in ref_parts:
            matches += self.match_term(part)
        matches = list({m.slug: m for m in matches}.values())  # unique
        return matches


class RefResolver:

    def __init__(self, raw_ref_model_by_lang: Dict[str, Language], raw_ref_part_model_by_lang: Dict[str, Language],
                 ref_part_title_trie_by_lang: Dict[str, RefPartTitleTrie], ref_part_title_graph: RefPartTitleGraph,
                 term_matcher_by_lang: Dict[str, TermMatcher]) -> None:
        self._raw_ref_model_by_lang = raw_ref_model_by_lang
        self._raw_ref_part_model_by_lang = raw_ref_part_model_by_lang
        self._ref_part_title_trie_by_lang = ref_part_title_trie_by_lang
        self._ref_part_title_graph = ref_part_title_graph
        self._term_matcher_by_lang = term_matcher_by_lang

    def bulk_resolve_refs(self, lang: str, context_refs: List[text.Ref], input: List[str], with_failures=False, verbose=False) -> List[List[ResolvedRawRef]]:
        all_raw_refs = self._bulk_get_raw_refs(lang, input)
        resolved = []
        iter = zip(context_refs, all_raw_refs)
        if verbose:
            iter = tqdm(iter, total=len(context_refs))
        for context_ref, raw_refs in iter:
            inner_resolved = []
            for raw_ref in raw_refs:
                temp_resolved = self.resolve_raw_ref(lang, context_ref, raw_ref)
                if len(temp_resolved) == 0 and with_failures:
                    inner_resolved += [ResolvedRawRef(raw_ref, [], None, None)]
                inner_resolved += temp_resolved
            resolved += [inner_resolved]
        return resolved

    def _bulk_get_raw_refs(self, lang: str, input: List[str]) -> List[List[RawRef]]:
        all_raw_ref_spans = list(self._bulk_get_raw_ref_spans(lang, input))
        ref_part_input = reduce(lambda a, b: a + [(sub_b.text, b[0]) for sub_b in b[1]], enumerate(all_raw_ref_spans), [])
        all_raw_ref_part_spans = list(self._bulk_get_raw_ref_part_spans(lang, ref_part_input, as_tuples=True))
        all_raw_ref_part_span_map = defaultdict(list)
        for ref_part_span, input_idx in all_raw_ref_part_spans:
            all_raw_ref_part_span_map[input_idx] += [ref_part_span]

        all_raw_refs = []
        for input_idx, raw_ref_spans in enumerate(all_raw_ref_spans):
            raw_ref_part_spans = all_raw_ref_part_span_map[input_idx]
            raw_refs = []
            for ispan, (span, part_span_list) in enumerate(zip(raw_ref_spans, raw_ref_part_spans)):
                raw_ref_parts = []
                for ipart, part_span in enumerate(part_span_list):
                    part_type = RefPartType.span_label_to_enum(part_span.label_)
                    dh_cont = None
                    if part_type == RefPartType.DH:
                        dh_cont = self._get_dh_continuation(ispan, ipart, raw_ref_spans, part_span_list, span, part_span)
                    raw_ref_parts += [RawRefPart(part_type, part_span, dh_cont)]
                raw_refs += [RawRef(raw_ref_parts, span)]
            all_raw_refs += [raw_refs]
        return all_raw_refs
    
    @staticmethod
    def _get_dh_continuation(ispan: int, ipart: int, raw_ref_spans: List[SpanOrToken], part_span_list: List[SpanOrToken], span: SpanOrToken, part_span: SpanOrToken) -> Optional[SpanOrToken]:
        if ipart == len(part_span_list) - 1:
            curr_doc = span.doc
            _, span_end = span_inds(span)
            if ispan == len(raw_ref_spans) - 1:
                dh_cont = curr_doc[span_end:]
            else:
                next_span_start, _ = span_inds(raw_ref_spans[ispan + 1])
                dh_cont = curr_doc[span_end:next_span_start]
        else:
            _, part_span_end = span_inds(part_span)
            next_part_span_start = span_inds(part_span_list[ipart + 1])
            dh_cont = part_span.doc[part_span_end:next_part_span_start]

        return dh_cont

    def __get_attr_by_lang(self, lang: str, by_lang_attr: dict, error_msg: str):
        try:
            return by_lang_attr[lang]
        except KeyError as e:
            raise KeyError(f"{error_msg} for lang `{lang}`")

    def get_raw_ref_model(self, lang: str) -> Language:
        return self.__get_attr_by_lang(lang, self._raw_ref_model_by_lang, 'No Raw Ref Model')

    def get_raw_ref_part_model(self, lang: str) -> Language:
        return self.__get_attr_by_lang(lang, self._raw_ref_part_model_by_lang, 'No Raw Ref Model')

    def get_ref_part_title_trie(self, lang: str) -> RefPartTitleTrie:
        return self.__get_attr_by_lang(lang, self._ref_part_title_trie_by_lang, 'No Raw Ref Part Title Trie')

    def get_term_matcher(self, lang: str) -> TermMatcher:
        return self.__get_attr_by_lang(lang, self._term_matcher_by_lang, 'No Term Matcher')

    def _get_raw_ref_spans_in_string(self, lang: str, st: str) -> List[Span]:
        doc = self.get_raw_ref_model(lang)(st)
        return doc.ents

    def _bulk_get_raw_ref_spans(self, lang: str, input: List[str], batch_size=150, **kwargs) -> Generator[List[Span], None, None]:
        for doc in self.get_raw_ref_model(lang).pipe(input, batch_size=batch_size, **kwargs):
            if kwargs.get('as_tuples', False):
                doc, context = doc
                yield doc.ents, context
            else:
                yield doc.ents

    def _get_raw_ref_part_spans_in_string(self, lang: str, st: str) -> List[Span]:
        doc = self.get_raw_ref_part_model(lang)(st)
        return doc.ents

    def _bulk_get_raw_ref_part_spans(self, lang: str, input: List[str], batch_size=None, **kwargs) -> Generator[List[Span], None, None]:
        for doc in self.get_raw_ref_part_model(lang).pipe(input, batch_size=batch_size or len(input), **kwargs):
            if kwargs.get('as_tuples', False):
                doc, context = doc
                yield doc.ents, context
            else:
                yield doc.ents

    @staticmethod
    def split_non_cts_parts(raw_ref: RawRef) -> List[RawRef]:
        if not any(part.type == RefPartType.NON_CTS for part in raw_ref.raw_ref_parts): return [raw_ref]
        split_raw_refs = []
        curr_parts = []
        curr_part_start = 0
        for ipart, part in enumerate(raw_ref.raw_ref_parts):
            if part.type != RefPartType.NON_CTS:
                curr_parts += [part]
            if part.type == RefPartType.NON_CTS or ipart == len(raw_ref.raw_ref_parts) - 1:
                if len(curr_parts) == 0: continue
                curr_part_end = ipart  # exclude curr part which is NON_CTS
                if ipart == len(raw_ref.raw_ref_parts) - 1: curr_part_end = ipart + 1  # include curr part
                try:
                    split_raw_refs += [RawRef(curr_parts, raw_ref.subspan(slice(curr_part_start, curr_part_end)))]
                except AssertionError:
                    pass
                curr_parts = []
                curr_part_start = ipart+1
        return split_raw_refs

    def resolve_raw_ref(self, lang: str, context_ref: text.Ref, raw_ref: 'RawRef') -> List['ResolvedRawRef']:
        split_raw_refs = self.split_non_cts_parts(raw_ref)
        resolved_list = []
        for i, temp_raw_ref in enumerate(split_raw_refs):
            is_non_cts = i > 0 and len(resolved_list) > 0
            if is_non_cts:
                # TODO assumes context is only first resolved ref
                context_ref = resolved_list[0].ref
            unrefined_matches = self.get_unrefined_ref_part_matches(lang, context_ref, temp_raw_ref)
            if is_non_cts:
                # resolution will start at context_ref.sections - len(ref parts). rough heuristic
                for match in unrefined_matches:
                    try:
                        match.ref = match.ref.subref(context_ref.sections[:-len(temp_raw_ref.raw_ref_parts)])
                    except (InputError, AttributeError):
                        continue
            temp_resolved_list = self.refine_ref_part_matches(lang, context_ref, unrefined_matches, temp_raw_ref)
            if len(temp_resolved_list) > 1:
                for resolved in temp_resolved_list:
                    resolved.ambiguous = True
            if is_non_cts:
                for resolved in temp_resolved_list:
                    resolved.resolution_method = ResolutionMethod.NON_CTS
            resolved_list += temp_resolved_list
        return resolved_list

    def get_unrefined_ref_part_matches(self, lang: str, context_ref: text.Ref, raw_ref: 'RawRef') -> List['ResolvedRawRef']:
        context_swap_map = getattr(context_ref.index.nodes, 'ref_resolver_context_swaps', None)
        ref_parts, context_swaps = self._get_context_swaps(lang, raw_ref.raw_ref_parts, context_swap_map)
        context_free_matches = self._get_unrefined_ref_part_matches_recursive(lang, raw_ref, ref_parts=ref_parts, context_swaps=context_swaps)
        context_full_matches = self._get_unrefined_ref_part_matches_for_graph_context(lang, context_ref, raw_ref, ref_parts=ref_parts, context_swaps=context_swaps)
        matches = context_full_matches + context_free_matches
        if len(matches) == 0:
            # TODO current assumption is only need to add context title if no matches. but it's possible this is necessary even if there were matches
            title_context_matches = self._get_unrefined_ref_part_matches_for_title_context(lang, context_ref, raw_ref, ref_parts=ref_parts, context_swaps=context_swaps)
            matches = title_context_matches
        return matches

    def _get_unrefined_ref_part_matches_for_title_context(self, lang: str, context_ref: text.Ref, raw_ref: RawRef, ref_parts: list, context_swaps: List[NonUniqueTerm]=None) -> List[ResolvedRawRef]:
        matches = []
        for template in context_ref.index.nodes.get_match_templates():
            temp_matches = self._get_unrefined_ref_part_matches_recursive(lang, raw_ref, ref_parts=ref_parts, context_terms=list(template.terms), context_swaps=context_swaps)
            matches += list(filter(lambda x: len(x.resolved_context_terms), temp_matches))
        for m in matches:
            m.resolution_method = ResolutionMethod.TITLE
        return matches

    def _get_unrefined_ref_part_matches_for_graph_context(self, lang: str, context_ref: text.Ref, raw_ref: RawRef, ref_parts: list, context_swaps: List[NonUniqueTerm]=None) -> List[ResolvedRawRef]:
        matches = []
        context_match_templates = list(context_ref.index.nodes.get_match_templates())
        raw_ref_term_slugs = [term.slug for term in self.get_term_matcher(lang).match_terms(raw_ref.raw_ref_parts)]
        context_parent = self._ref_part_title_graph.get_parent_for_children(context_match_templates, raw_ref_term_slugs)
        context_child = self._ref_part_title_graph.get_shared_child(context_match_templates, raw_ref_term_slugs)
        for context_slug in (context_parent, context_child):
            if context_slug is None: continue
            temp_matches = self._get_unrefined_ref_part_matches_recursive(lang, raw_ref, ref_parts=ref_parts, context_terms=[NonUniqueTerm.init(context_slug)], context_swaps=context_swaps)
            matches += list(filter(lambda x: len(x.resolved_ref_parts) and len(x.resolved_context_terms), temp_matches))
        for m in matches:
            m.resolution_method = ResolutionMethod.GRAPH
        return matches

    def _get_context_swaps(self, lang: str, ref_parts: List[RawRefPart], context_swaps: Dict[str, str]=None) -> Tuple[List[RawRefPart], List[NonUniqueTerm]]:
        final_ref_parts, final_terms = [], []
        term_matcher = self.get_term_matcher(lang)
        if context_swaps is None: return ref_parts, []
        for part in ref_parts:
            # TODO assumes only one match in term_matches
            term_matches = term_matcher.match_term(part)
            found_match = False
            for match in term_matches:
                if match.slug not in context_swaps: continue
                final_terms += [NonUniqueTerm.init(slug) for slug in context_swaps[match.slug]]
                found_match = True
                break
            if not found_match: final_ref_parts += [part]
        return final_ref_parts, final_terms

    def _get_unrefined_ref_part_matches_recursive(self, lang: str, raw_ref: RawRef, title_trie: RefPartTitleTrie = None, ref_parts: list = None, prev_ref_parts: list = None, context_terms: List[NonUniqueTerm] = None, prev_context_terms=None, context_swaps: List[NonUniqueTerm] = None) -> List[ResolvedRawRef]:
        title_trie = title_trie or self.get_ref_part_title_trie(lang)
        context_terms = context_terms or []
        context_terms += context_swaps or []
        prev_ref_parts = prev_ref_parts or []
        prev_context_terms = prev_context_terms or []
        matches = []
        trie_entries: List[TrieEntry] = context_terms + ref_parts
        for i, trie_entry in enumerate(trie_entries):
            temp_prev_ref_parts, temp_prev_context_terms = prev_ref_parts, prev_context_terms
            if isinstance(trie_entry, RawRefPart):
                # no need to consider other types at root level
                if trie_entry.type != RefPartType.NAMED: continue
                temp_prev_ref_parts = prev_ref_parts + [trie_entry]
            else:
                temp_prev_context_terms = prev_context_terms + [trie_entry]
            temp_title_trie = title_trie.get_continuations(trie_entry.key())
            if temp_title_trie is None: continue
            if LEAF_TRIE_ENTRY in temp_title_trie:
                matches += [ResolvedRawRef(raw_ref, temp_prev_ref_parts, node, (node.nodes if isinstance(node, text.Index) else node).ref(), temp_prev_context_terms) for node in temp_title_trie[LEAF_TRIE_ENTRY]]
            temp_ref_parts = [ref_parts[j] for j in range(len(ref_parts)) if j != (i-len(context_terms))]
            temp_context_terms = [context_terms[j] for j in range(len(context_terms)) if j != i]
            matches += self._get_unrefined_ref_part_matches_recursive(lang, raw_ref, temp_title_trie, ref_parts=temp_ref_parts, prev_ref_parts=temp_prev_ref_parts, context_terms=temp_context_terms, prev_context_terms=temp_prev_context_terms)

        return self._prune_unrefined_ref_part_matches(matches)

    def refine_ref_part_matches(self, lang: str, context_ref: text.Ref, ref_part_matches: list, raw_ref: RawRef) -> List[ResolvedRawRef]:
        matches = []
        for unrefined_match in ref_part_matches:
            matches += self._get_refined_ref_part_matches_recursive(lang, unrefined_match, raw_ref)
            matches += self._get_refined_ref_part_matches_for_section_context(lang, context_ref, unrefined_match, raw_ref)
        return self._prune_refined_ref_part_matches(matches)

    @staticmethod
    def _get_section_contexts(context_ref: text.Ref, match_index: text.Index, common_index: text.Index) -> List[SectionContext]:
        """
        Currently doesn't work if any of the indexes are complex texts
        Returns list section contexts extracted from `context_node`
        :param context_ref: context ref where we are searching
        :param match_index: Index of current match we are trying to refine
        :param common_index: Index
        """
        def get_section_set(index: text.Index) -> Set[Tuple[str, str]]:
            root_node = index.nodes.get_default_child() or index.nodes
            try:
                return set(zip(root_node.addressTypes, root_node.sectionNames))
            except AttributeError:
                # complex text
                return set()
        context_node = context_ref.index_node
        context_sec_list = list(zip(context_node.addressTypes, context_node.sectionNames))
        match_sec_set  = get_section_set(match_index)
        common_sec_set = get_section_set(common_index) & match_sec_set & set(context_sec_list)
        if len(common_sec_set) == 0: return []
        sec_contexts = []
        for isec, sec_tuple in enumerate(context_sec_list):
            if sec_tuple in common_sec_set and isec < len(context_ref.sections):
                addr_type_str, sec_name = sec_tuple
                addr_type = schema.AddressType.to_class_by_address_type(addr_type_str)
                sec_contexts += [SectionContext(addr_type, sec_name, isec, context_ref.sections[isec])]
        return sec_contexts

    @staticmethod
    def _get_refined_ref_part_matches_for_section_context(lang: str, context_ref: text.Ref, ref_part_match: ResolvedRawRef, raw_ref: RawRef) -> List[ResolvedRawRef]:
        """
        Tries to infer sections from context ref and uses them to refine `ref_part_match`
        """
        context_base_text_titles = set(getattr(context_ref.index, 'base_text_titles', []))
        match_base_text_titles = set(getattr(ref_part_match.ref.index, 'base_text_titles', []))
        matches = []
        for common_base_text in (context_base_text_titles & match_base_text_titles):
            common_index = text.library.get_index(common_base_text)
            sec_contexts = RefResolver._get_section_contexts(context_ref, ref_part_match.ref.index, common_index)
            matches += RefResolver._get_refined_ref_part_matches_recursive(lang, ref_part_match, raw_ref, section_contexts=sec_contexts)
        # remove matches which dont use context
        matches = list(filter(lambda x: any(part.is_context for part in x.resolved_ref_parts), matches))
        return matches

    @staticmethod
    def _get_refined_ref_part_matches_recursive(lang: str, ref_part_match: ResolvedRawRef, raw_ref: RawRef, section_contexts=None) -> List[ResolvedRawRef]:
        section_contexts = section_contexts or []
        fully_refined = []
        match_queue = [ref_part_match]
        while len(match_queue) > 0:
            match = match_queue.pop(0)
            unused_parts = match.get_unused_ref_parts_or_section_contexts(section_contexts)
            has_match = False
            if match.node is None:
                children = []
            elif isinstance(match.node, schema.NumberedTitledTreeNode):
                child = match.node.get_referenceable_child(match.ref)
                children = [] if child is None else [child]
            elif isinstance(match.node, schema.DiburHamatchilNode):
                children = []
            elif isinstance(match.node, text.Index):
                children = match.node.referenceable_children()
            else:
                children = match.node.children
            for child in children:
                for part in unused_parts:
                    temp_matches = match.get_refined_matches(part, child, lang)
                    match_queue += temp_matches
                    if len(temp_matches) > 0: has_match = True
            if not has_match:
                fully_refined += [match]
        return fully_refined

    @staticmethod
    def _prune_unrefined_ref_part_matches(ref_part_matches: List[ResolvedRawRef]) -> List[ResolvedRawRef]:
        index_match_map = defaultdict(list)
        for match in ref_part_matches:
            key = match.node.title if isinstance(match.node, text.Index) else match.node.ref().normal()
            index_match_map[key] += [match]
        pruned_matches = []
        for match_list in index_match_map.values():
            pruned_matches += [max(match_list, key=lambda m: len(m.resolved_ref_parts))]
        return pruned_matches

    @staticmethod
    def _prune_refined_ref_part_matches(resolved_refs: List[ResolvedRawRef]) -> List[ResolvedRawRef]:
        """
        So far simply returns all matches with the maximum number of resolved_ref_parts
        """
        if len(resolved_refs) == 0: return resolved_refs
        resolved_refs.sort(key=lambda x: x.order_key, reverse=True)
        top_order_key = resolved_refs[0].order_key
        max_resolved_refs = []
        for resolved_ref in resolved_refs:
            if resolved_ref.order_key != top_order_key: break
            max_resolved_refs += [resolved_ref]

        # remove matches that have empty refs
        # TODO removing for now b/c of yerushalmi project. doesn't seem necessary to happen here anyway.
        # max_resolved_refs = list(filter(lambda x: not x.ref.is_empty(), max_resolved_refs))

        # remove title context matches that don't match all ref parts to avoid false positives
        max_resolved_refs = list(filter(lambda x: x.resolution_method not in {ResolutionMethod.TITLE, ResolutionMethod.GRAPH} or len([p for p in x.resolved_ref_parts if not p.is_context]) == len(x.raw_ref.raw_ref_parts), max_resolved_refs))
        return max_resolved_refs
