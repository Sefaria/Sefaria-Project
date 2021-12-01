from collections import defaultdict
from typing import List, Union, Dict, Optional, Tuple, Generator
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


def span_inds(span: Union[Token, Span]) -> Tuple[int, int]:
    """
    For some reason, spacy makes it difficult to deal with indices in tokens and spans
    These classes use different fields for their indices
    This function unifies access to indices
    """
    start = span.start if isinstance(span, Span) else span.i
    end = span.end if isinstance(span, Span) else (span.i+1)
    return start, end

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
        return getattr(cls, LABEL_TO_REF_PART_TYPE_ATTR[span_label])


class ResolutionMethod(Enum):
    GRAPH = "graph"
    TITLE = "title"
    NON_CTS = "non_cts"


class TrieEntry:
    def key(self):
        return hash(self)

class NonUniqueTerm(abst.AbstractMongoRecord, schema.AbstractTitledObject, TrieEntry):
    collection = "non_unique_terms"
    required_attrs = [
        "slug",
        "titles"
    ]
    optional_attrs = [
        "ref_part_role",  # currently either "structural", "context_swap" or "alt_title". structural should be used for terms that used to define a logical relationship between ref parts (e.g. 'yerushalmi'). "alt_title" is for parts that are only included to generate more alt_titles (e.g. 'sefer'). "context_swap" is for parts that are meant to be swapped via SchemaNode.ref_resolver_context_swaps
    ]
    slug_fields = ['slug']

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

class RawRefPart(TrieEntry):
    
    def __init__(self, type: 'RefPartType', span: Union[Token, Span], potential_dh_continuation: str=None) -> None:
        self.span = span
        self.type = type
        self.potential_dh_continuation = potential_dh_continuation

    def __str__(self):
        return f"{self.__class__.__name__}: {self.span}, Type = {self.type}"

    def __repr__(self):
        return f"{self.__class__.__name__}({self.span}, {self.potential_dh_continuation})"

    def __eq__(self, other):
        return isinstance(other, self.__class__) and self.__hash__() == other.__hash__()

    def __hash__(self):
        return hash(f"{self.type}|{self.span.__hash__()}|{self.potential_dh_continuation}")

    def __ne__(self, other):
        return not self.__eq__(other)

    def key(self):
        return self.text

    def get_text(self):
        return self.span.text

    def get_dh_text_to_match(self):
        import re
        m = re.match(r'^(?:(?:\u05d3"\u05d4|s ?\. ?v ?\.) )?(.+?)$', self.text)
        if m is None: return
        return m.group(1)

    text = property(get_text)

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
    
    def __init__(self, raw_ref_parts: list, span: Union[Token, Span]) -> None:
        self.raw_ref_parts = self._group_ranged_parts(raw_ref_parts)
        self.prev_num_parts_map = self._get_prev_num_parts_map(self.raw_ref_parts)
        self.span = span

    @staticmethod
    def _group_ranged_parts(raw_ref_parts: List['RawRefPart']) -> List['RawRefPart']:
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
        if len(raw_ref_parts) == 0: return {}
        prev_num_parts_map = {}
        prev_part = raw_ref_parts[0]
        for part in raw_ref_parts[1:]:
            if prev_part.type == RefPartType.NUMBERED and part.type == RefPartType.NUMBERED:
                prev_num_parts_map[part] = prev_part
            prev_part = part
        return prev_num_parts_map

    def subspan(self, part_slice: slice) -> Union[Token, Span]:
        """
        Return subspan covered by `raw_ref_parts`, relative to self.span
        Assumes raw_ref_parts are in order
        """
        parts = self.raw_ref_parts[part_slice]
        start_token_i = span_inds(parts[0].span)[0]
        end_token_i = span_inds(parts[-1].span)[1]

        offset_i = span_inds(self.span)[0]
        subspan = self.span.doc[offset_i+start_token_i:offset_i+end_token_i]
        # unfortunately, the two models were trained using different tokenizers leading to potential differences in token indexes
        assert subspan.text == parts[0].span.doc[start_token_i:end_token_i].text, f"{subspan.text} != {parts[0].span.doc[start_token_i:end_token_i].text}"
        return subspan

    def get_text(self):
        return self.span.text

    def get_char_indices(self) -> Tuple[int, int]:
        if isinstance(self.span, Span):
            return self.span.start_char, self.span.end_char
        elif isinstance(self.span, Token):
            idx = self.span.idx
            return idx, idx+1

    text = property(get_text)
    char_indices = property(get_char_indices)


class ResolvedRawRef:

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

    def get_unused_ref_parts(self, raw_ref: 'RawRef'):
        return [ref_part for ref_part in raw_ref.raw_ref_parts if ref_part not in self.resolved_ref_parts]

    def has_prev_unused_numbered_ref_part(self, raw_ref_part: RawRefPart) -> bool:
        prev_part = self.raw_ref.prev_num_parts_map.get(raw_ref_part, None)
        if prev_part is None: return False
        return prev_part not in self.resolved_ref_parts

    def _get_refined_match_for_dh_part(self, raw_ref_part: 'RawRefPart', refined_ref_parts: List['RawRefPart'], node: schema.DiburHamatchilNodeSet):
        max_node, max_score = node.best_fuzzy_match_score(raw_ref_part)
        if max_score == 1.0:
            return self.clone(resolved_ref_parts=refined_ref_parts, node=max_node, ref=text.Ref(max_node.ref))

    def _get_refined_refs_for_numbered_part(self, raw_ref_part: 'RawRefPart', refined_ref_parts: List['RawRefPart'], node, lang, fromSections: List[RawRefPart]=None) -> List['ResolvedRawRef']:
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
            except InputError:
                continue
            except AssertionError:
                continue
        return [self.clone(resolved_ref_parts=refined_ref_parts, node=node, ref=refined_ref) for refined_ref in refined_refs]

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


    def get_refined_matches(self, raw_ref_part: 'RawRefPart', node, lang: str) -> List['ResolvedRawRef']:
        refined_ref_parts = self.resolved_ref_parts + [raw_ref_part]
        matches = []
        # see NumberedTitledTreeNode.get_referenceable_child() for why we check if parent is None
        if raw_ref_part.type == RefPartType.NUMBERED and isinstance(node, schema.JaggedArrayNode) and node.parent is None:
            matches += self._get_refined_refs_for_numbered_part(raw_ref_part, refined_ref_parts, node, lang)
        elif raw_ref_part.type == RefPartType.RANGE and isinstance(node, schema.JaggedArrayNode):
            matches += self._get_refined_matches_for_ranged_part(raw_ref_part, refined_ref_parts, node, lang)
        elif (raw_ref_part.type == RefPartType.NAMED and isinstance(node, schema.TitledTreeNode) or
        raw_ref_part.type == RefPartType.NUMBERED and isinstance(node, schema.ArrayMapNode)) or \
        raw_ref_part.type == RefPartType.NUMBERED and isinstance(node, schema.SchemaNode): # for case of numbered alt structs or schema nodes that look numbered (e.g. perakim and parshiot of Sifra)
            if node.ref_part_title_trie(lang).has_continuations(raw_ref_part.key()):
                matches += [self.clone(resolved_ref_parts=refined_ref_parts, node=node, ref=node.ref())]
        elif raw_ref_part.type == RefPartType.DH:
            if isinstance(node, schema.JaggedArrayNode):
                # jagged array node can be skipped entirely if it has a dh child
                # technically doesn't work if there is a referenceable child in between ja and dh node
                node = node.get_referenceable_child(self.ref)
            if isinstance(node, schema.DiburHamatchilNodeSet):
                dh_match = self._get_refined_match_for_dh_part(raw_ref_part, refined_ref_parts, node)
                if dh_match is not None:
                    matches += [dh_match]
        # TODO sham and directional cases
        return matches

    def get_num_resolved(self):
        return len(self.resolved_ref_parts) + len(self.resolved_context_terms)

    def get_order_key(self):
        """
        For sorting
        """
        return len(self.resolved_ref_parts), len(self.resolved_context_terms)

    num_resolved = property(get_num_resolved)
    order_key = property(get_order_key)


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

    def __init__(self, lang, nodes=None, sub_trie=None, scope=None) -> None:
        """
        :param lang:
        :param nodes:
        :param sub_trie:
        :param scope: str. scope of the trie. if 'alone', take into account `ref_parts` marked with scope "alone" or "any".
        """
        self.lang = lang
        self.scope = scope
        if nodes is not None:
            self.__init_with_nodes(nodes)
        else:
            self._trie = sub_trie

    def __init_with_nodes(self, nodes):
        self._trie = {}
        for node in nodes:
            is_index_level = getattr(node, 'index', False) and node == node.index.nodes
            curr_dict_queue = [self._trie]
            for ref_part in getattr(node, 'ref_parts', []):
                slugs = [slug for slug, _ in filter(lambda x: is_index_level or self.scope == 'any' or x[1] in {'any', self.scope}, zip(ref_part['slugs'], ref_part['scopes']))]
                if len(slugs) == 0: continue
                terms = [NonUniqueTerm.init(slug) for slug in slugs]  # TODO consider using term cache here
                len_curr_dict_queue = len(curr_dict_queue)
                for _ in range(len_curr_dict_queue):
                    curr_dict = curr_dict_queue[0] if ref_part['optional'] else curr_dict_queue.pop(0)  # dont remove curr_dict if optional. leave it for next level to add to.
                    curr_dict_queue += self.__get_sub_tries_for_terms(terms, curr_dict)
            # add nodes to leaves
            # None key indicates this is a leaf                            
            for curr_dict in curr_dict_queue:
                leaf_node = node.index if is_index_level else node
                if None in curr_dict:
                    curr_dict[None] += [leaf_node]
                else:
                    curr_dict[None] = [leaf_node]

    @staticmethod
    def __get_sub_trie_for_new_key(key: str, curr_trie: dict) -> dict:
        if key in curr_trie:
            sub_trie = curr_trie[key]
        else:
            sub_trie = {}
            curr_trie[key] = sub_trie
        return sub_trie

    def __get_sub_tries_for_terms(self, terms: List[NonUniqueTerm], curr_trie: dict) -> List[dict]:
        sub_tries = []
        for term in terms:
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

    def has_continuations(self, key):
        return self.get_continuations(key, default=None) is not None

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

    def get_continuations(self, key, default=None):
        continuations = self._get_continuations_recursive(key)
        if len(continuations) == 0:
            return default
        merged = self._merge_n_tries(*continuations)
        return RefPartTitleTrie(self.lang, sub_trie=merged, scope=self.scope)

    def _get_continuations_recursive(self, key: str, prev_sub_tries=None):
        is_first = prev_sub_tries is None
        prev_sub_tries = prev_sub_tries or self._trie
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
    DAG which represents connections between ref parts in index titles
    where each connection is a pair of consecutive ref parts
    """
    def __init__(self, nodes: List[schema.TitledTreeNode]):
        self._graph = defaultdict(set)
        for node in nodes:
            ref_parts = getattr(node, 'ref_parts', [])
            for i, ref_part in enumerate(ref_parts[:-1]):
                slugs = filter(lambda x: NonUniqueTerm.init(x).ref_part_role == "structural", ref_part['slugs'])
                next_slugs = filter(lambda x: NonUniqueTerm.init(x).ref_part_role == "structural", ref_parts[i+1]['slugs'])
                for slug1, slug2 in product(slugs, next_slugs):
                    self._graph[slug1].add(slug2)

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

    def get_parent_for_children(self, context_slugs: list, input_slugs: list) -> Optional[str]:
        for slugs in context_slugs:
            for context_slug in slugs['slugs']:
                for input_slug in input_slugs:
                    if self.parent_has_child(context_slug, input_slug):
                        return context_slug

    def get_shared_child(self, context_slugs: List[List[str]], input_slugs: List[str]) -> Optional[str]:
        for i, slugs in enumerate(context_slugs[:-1]):
            next_slugs = context_slugs[i + 1]
            for context_slug1, context_slug2 in product(slugs['slugs'], next_slugs['slugs']):
                for input_slug in input_slugs:
                    if self.do_parents_share_child(context_slug1, input_slug, context_slug2):
                        return context_slug2


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
            for span, part_span_list in zip(raw_ref_spans, raw_ref_part_spans):
                raw_ref_parts = []
                for part_span in part_span_list:
                    part_type = RefPartType.span_label_to_enum(part_span.label_)
                    dh_cont = None
                    if part_type == RefPartType.DH:
                        """
                        if ipart == len(raw_ref_part_spans) - 1:
                            if ispan == len(raw_ref_spans) - 1:
                                dh_cont = st[span.end+1:]
                            else:
                                dh_cont = st[span.end:next_span.start]
                        else:
                            dh_cont = st[part_span.end+1:next_part_span.start]
                        """
                        dh_cont = None  # TODO FILL IN
                    raw_ref_parts += [RawRefPart(part_type, part_span, dh_cont)]
                raw_refs += [RawRef(raw_ref_parts, span)]
            all_raw_refs += [raw_refs]
        return all_raw_refs

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
            temp_resolved_list = self.refine_ref_part_matches(lang, unrefined_matches, temp_raw_ref)
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
        context_ref_part_terms = [[NonUniqueTerm.init(slug) for slug in inner_ref_parts['slugs']] for inner_ref_parts in getattr(context_ref.index.nodes, 'ref_parts', [])]
        matches = []
        for context_terms in product(*context_ref_part_terms):
            temp_matches = self._get_unrefined_ref_part_matches_recursive(lang, raw_ref, ref_parts=ref_parts, context_terms=list(context_terms), context_swaps=context_swaps)
            matches += list(filter(lambda x: len(x.resolved_context_terms), temp_matches))
        for m in matches:
            m.resolution_method = ResolutionMethod.TITLE
        return matches

    def _get_unrefined_ref_part_matches_for_graph_context(self, lang: str, context_ref: text.Ref, raw_ref: RawRef, ref_parts: list, context_swaps: List[NonUniqueTerm]=None) -> List[ResolvedRawRef]:
        matches = []
        context_ref_part_slugs = getattr(context_ref.index.nodes, 'ref_parts', [])
        raw_ref_term_slugs = [term.slug for term in self.get_term_matcher(lang).match_terms(raw_ref.raw_ref_parts)]
        context_parent = self._ref_part_title_graph.get_parent_for_children(context_ref_part_slugs, raw_ref_term_slugs)
        context_child = self._ref_part_title_graph.get_shared_child(context_ref_part_slugs, raw_ref_term_slugs)
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

    def _get_unrefined_ref_part_matches_recursive(self, lang: str, raw_ref: RawRef, title_trie: RefPartTitleTrie=None, ref_parts: list=None, prev_ref_parts: list=None, context_terms: List[NonUniqueTerm]=None, prev_context_terms=None, context_swaps: List[NonUniqueTerm]=None) -> List['ResolvedRawRef']:
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
            if None in temp_title_trie:
                matches += [ResolvedRawRef(raw_ref, temp_prev_ref_parts, node, (node.nodes if isinstance(node, text.Index) else node).ref(), temp_prev_context_terms) for node in temp_title_trie[None]]
            temp_ref_parts = [ref_parts[j] for j in range(len(ref_parts)) if j != (i-len(context_terms))]
            temp_context_terms = [context_terms[j] for j in range(len(context_terms)) if j != i]
            matches += self._get_unrefined_ref_part_matches_recursive(lang, raw_ref, temp_title_trie, ref_parts=temp_ref_parts, prev_ref_parts=temp_prev_ref_parts, context_terms=temp_context_terms, prev_context_terms=temp_prev_context_terms)

        return self._prune_unrefined_ref_part_matches(matches)

    def refine_ref_part_matches(self, lang: str, ref_part_matches: list, raw_ref: 'RawRef') -> list:
        fully_refined = []
        match_queue = ref_part_matches[:]
        while len(match_queue) > 0:
            match = match_queue.pop(0)
            unused_ref_parts = match.get_unused_ref_parts(raw_ref)
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
                for ref_part in unused_ref_parts:
                    temp_matches = match.get_refined_matches(ref_part, child, lang)
                    match_queue += temp_matches
                    if len(temp_matches) > 0: has_match = True
            if not has_match:
                fully_refined += [match]
        
        return self._prune_refined_ref_part_matches(fully_refined)

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
        max_resolved_refs = list(filter(lambda x: x.resolution_method not in {ResolutionMethod.TITLE, ResolutionMethod.GRAPH} or len(x.resolved_ref_parts) == len(x.raw_ref.raw_ref_parts), max_resolved_refs))
        return max_resolved_refs

