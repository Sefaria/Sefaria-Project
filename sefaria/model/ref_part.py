from collections import defaultdict
from typing import List, Union
from enum import Enum
from functools import reduce
from sefaria.system.exceptions import InputError
from . import abstract as abst
from . import text
from . import schema
from spacy.tokens import Span, Token
from spacy.language import Language

LABEL_TO_REF_PART_TYPE_ATTR = {
    "כותרת": 'NAMED',
    "מספר": "NUMBERED",
    "דה": "DH",
    "סימן-טווח": "RANGE_SYMBOL",
    "לקמן-להלן": "RELATIVE",
    "שם": "IBID",
}
class RefPartType(Enum):
    NAMED = "named"
    NUMBERED = "numbered"
    DH = "dibur_hamatchil"
    RANGE_SYMBOL = "range_symbol"
    RANGE = "range"
    RELATIVE = "relative"
    IBID = "ibid"

    @classmethod
    def span_label_to_enum(cls, span_label: str) -> 'RefPartType':
        return getattr(cls, LABEL_TO_REF_PART_TYPE_ATTR[span_label])

class TrieEntry:
    def key(self):
        return hash(self)

class NonUniqueTerm(abst.AbstractMongoRecord, schema.AbstractTitledObject, TrieEntry):
    collection = "non_unique_terms"
    required_attrs = [
        "slug",
        "titles"
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
        return self.text.replace('ד"ה', '')

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

    def _get_full_span(self, sections, toSections):
        start_span = sections[0].span
        end_span = toSections[-1].span
        start_token_i = start_span.start if isinstance(start_span, Span) else start_span.i
        end_token_i = end_span.end if isinstance(end_span, Span) else (end_span.i + 1)
        return start_span.doc[start_token_i:end_token_i]


class RawRef:
    
    def __init__(self, raw_ref_parts: list, span: Union[Token, Span]) -> None:
        self.raw_ref_parts = self._group_ranged_parts(raw_ref_parts)
        self.span = span

    def _group_ranged_parts(self, raw_ref_parts: List['RawRefPart']) -> List['RawRefPart']:
        ranged_symbol_ind = None
        for i, part in enumerate(raw_ref_parts):
            if part.type == RefPartType.RANGE_SYMBOL:
                ranged_symbol_ind = i
                break
        if ranged_symbol_ind is None: return raw_ref_parts
        section_slice, toSection_slice = None, None
        for i in range(ranged_symbol_ind-1, -1, -1):
            if i == 0 or raw_ref_parts[i-1].type != RefPartType.NUMBERED:
                section_slice = slice(i, ranged_symbol_ind)
                break
        for i in range(ranged_symbol_ind+1, len(raw_ref_parts)):
            if i == len(raw_ref_parts) - 1 or raw_ref_parts[i+1].type != RefPartType.NUMBERED:
                toSection_slice = slice(ranged_symbol_ind+1, i+1)
                break
        sections = raw_ref_parts[section_slice]
        toSections = sections[:]
        num_explicit_to_sections = toSection_slice.stop - toSection_slice.start
        toSections[-num_explicit_to_sections:] = raw_ref_parts[toSection_slice]
        new_raw_ref_parts = raw_ref_parts[:section_slice.start] + \
                            [RangedRawRefParts(sections, toSections)] + \
                            raw_ref_parts[toSection_slice.stop:]
        return new_raw_ref_parts

    def get_text(self):
        return self.span.text

    text = property(get_text)

class ResolvedRawRef:

    def __init__(self, raw_ref: 'RawRef', resolved_ref_parts: List['RawRefPart'], node, ref: text.Ref, resolved_context_terms: List[NonUniqueTerm]=None) -> None:
        self.raw_ref = raw_ref
        self.resolved_ref_parts = resolved_ref_parts
        self.resolved_context_terms = resolved_context_terms
        self.node = node
        self.ref = ref
        self.ambiguous = False

    def get_unused_ref_parts(self, raw_ref: 'RawRef'):
        return [ref_part for ref_part in raw_ref.raw_ref_parts if ref_part not in self.resolved_ref_parts]

    def _get_refined_match_for_dh_part(self, raw_ref_part: 'RawRefPart', refined_ref_parts: List['RawRefPart'], node: schema.DiburHamatchilNodeSet):
        max_node, max_score = node.best_fuzzy_match_score(raw_ref_part)
        if max_score == 1.0:
            return ResolvedRawRef(self.raw_ref, refined_ref_parts, max_node, text.Ref(max_node.ref))

    def _get_refined_refs_for_numbered_part(self, raw_ref_part: 'RawRefPart', refined_ref_parts: List['RawRefPart'], node, lang) -> List['ResolvedRawRef']:
        possible_sections, possible_to_sections = node.address_class(0).get_all_possible_sections_from_string(lang, raw_ref_part.text)
        refined_refs = []
        for sec, toSec in zip(possible_sections, possible_to_sections):
            try:
                refined_ref = self.ref.subref(sec)
                if toSec != sec:
                    to_ref = self.ref.subref(toSec)
                    refined_ref = refined_ref.to(to_ref)
                refined_refs += [refined_ref]
            except InputError:
                continue
            except AssertionError as e:
                print(self.ref.normal(), e)
        return [ResolvedRawRef(self.raw_ref, refined_ref_parts, node, refined_ref) for refined_ref in refined_refs]

    def _get_refined_matches_for_ranged_sections(self, sections: List['RawRefPart'], refined_ref_parts: List['RawRefPart'], node, lang):
        resolved_raw_refs = [ResolvedRawRef(self.raw_ref, refined_ref_parts, node, node.ref())]
        is_first_pass = True
        for section_part in sections:
            queue_len = len(resolved_raw_refs)
            for _ in range(queue_len):
                temp_resolved_raw_ref = resolved_raw_refs.pop(0)
                if not is_first_pass:
                    temp_resolved_raw_ref.node = temp_resolved_raw_ref.node.get_referenceable_child(temp_resolved_raw_ref.ref)
                is_first_pass = False
                resolved_raw_refs += temp_resolved_raw_ref._get_refined_refs_for_numbered_part(section_part, refined_ref_parts, temp_resolved_raw_ref.node, lang)

        return resolved_raw_refs

    def _get_refined_matches_for_ranged_part(self, raw_ref_part: 'RangedRawRefParts', refined_ref_parts: List['RawRefPart'], node, lang) -> List['ResolvedRawRef']:
        from itertools import product
        section_resolved_raw_refs = self._get_refined_matches_for_ranged_sections(raw_ref_part.sections, refined_ref_parts, node, lang)
        toSection_resolved_raw_refs = self._get_refined_matches_for_ranged_sections(raw_ref_part.toSections, refined_ref_parts, node, lang)
        ranged_resolved_raw_refs = []
        for section, toSection in product(section_resolved_raw_refs, toSection_resolved_raw_refs):
            try:
                ranged_resolved_raw_refs += [ResolvedRawRef(self.raw_ref, refined_ref_parts, section.node, section.ref.to(toSection.ref))]
            except InputError:
                continue
        return ranged_resolved_raw_refs


    def get_refined_matches(self, raw_ref_part: 'RawRefPart', node, lang: str) -> List['ResolvedRawRef']:
        refined_ref_parts = self.resolved_ref_parts + [raw_ref_part]
        matches = []
        if raw_ref_part.type == RefPartType.NUMBERED and isinstance(node, schema.JaggedArrayNode):
            matches += self._get_refined_refs_for_numbered_part(raw_ref_part, refined_ref_parts, node, lang)
        elif raw_ref_part.type == RefPartType.RANGE and isinstance(node, schema.JaggedArrayNode):
            matches += self._get_refined_matches_for_ranged_part(raw_ref_part, refined_ref_parts, node, lang)
        elif (raw_ref_part.type == RefPartType.NAMED and isinstance(node, schema.TitledTreeNode) or
        raw_ref_part.type == RefPartType.NUMBERED and isinstance(node, schema.ArrayMapNode)):  # for case of numbered alt structs
            if node.ref_part_title_trie(lang).has_continuations(raw_ref_part.key()):
                matches += [ResolvedRawRef(self.raw_ref, refined_ref_parts, node, node.ref())]
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


class RefPartTitleTrie:

    PREFIXES = {'ב', 'וב', 'ע'}  # careful of Ayin prefix...

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
        # TODO this function is waaay too nested
        self._trie = {}
        for node in nodes:
            is_index_level = getattr(node, 'index', False) and node == node.index.nodes
            curr_dict_queue = [self._trie]
            for ref_part in node.ref_parts:
                slugs = [slug for slug, _ in filter(lambda x: is_index_level or self.scope == 'any' or x[1] in {'any', self.scope}, zip(ref_part['slugs'], ref_part['scopes']))]
                if len(slugs) == 0: continue
                terms = [NonUniqueTerm.init(slug) for slug in slugs]
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
            for prefix in self.PREFIXES:
                if not key.startswith(prefix): continue
                starti_list += [len(prefix)]
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


class RefResolver:

    def __init__(self, lang, raw_ref_model: Language, raw_ref_part_model: Language) -> None:
        self.lang = lang
        self.raw_ref_model = raw_ref_model
        self.raw_ref_part_model = raw_ref_part_model
    
    def resolve_refs_in_string(self, context_ref: text.Ref, st: str, with_failures=False) -> List['ResolvedRawRef']:
        raw_refs = self._get_raw_refs_in_string(st)
        resolved = []
        for raw_ref in raw_refs:
            temp_resolved = self.resolve_raw_ref(context_ref, raw_ref)
            if len(temp_resolved) == 0 and with_failures:
                resolved += [ResolvedRawRef(raw_ref, [], None, None)]
            resolved += temp_resolved
        return resolved

    def _get_raw_refs_in_string(self, st: str) -> List['RawRef']:
        """
        ml_raw_ref_out
        ml_raw_ref_part_out
        parse ml out
        """
        raw_refs: List['RawRef'] = []
        raw_ref_spans = self._get_raw_ref_spans_in_string(st)
        for span in raw_ref_spans:
            raw_ref_part_spans = self._get_raw_ref_part_spans_in_string(span.text)
            raw_ref_parts = []
            for part_span in raw_ref_part_spans:
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
        return raw_refs

    def _get_raw_ref_spans_in_string(self, st: str) -> List[Span]:
        doc = self.raw_ref_model(st)
        return doc.ents

    def _get_raw_ref_part_spans_in_string(self, st: str) -> List[Span]:
        doc = self.raw_ref_part_model(st)
        return doc.ents

    def resolve_raw_ref(self, context_ref: text.Ref, raw_ref: 'RawRef') -> List['ResolvedRawRef']:
        unrefined_matches = self.get_unrefined_ref_part_matches(context_ref, raw_ref)
        resolved_list = self.refine_ref_part_matches(unrefined_matches, raw_ref)
        if len(resolved_list) > 1:
            for resolved in resolved_list:
                resolved.ambiguous = True
        return resolved_list

    def get_unrefined_ref_part_matches(self, context_ref: text.Ref, raw_ref: 'RawRef') -> List['ResolvedRawRef']:
        from .text import library
        root_trie = library.get_root_ref_part_title_trie(self.lang)
        context_free_matches = self._get_unrefined_ref_part_matches_recursive(raw_ref, root_trie)
        context_full_matches = self._get_unrefined_ref_part_matches_for_base_text_context(context_ref, raw_ref, root_trie)
        return context_full_matches + context_free_matches

    def _get_unrefined_ref_part_matches_for_base_text_context(self, context_ref: text.Ref, raw_ref: RawRef, root_trie: RefPartTitleTrie) -> List[NonUniqueTerm]:
        matches = []
        for title in getattr(context_ref.index, 'base_text_titles', []):
            base_index = text.library.get_index(title)
            context_terms = [NonUniqueTerm.init(slug) for slug in reduce(lambda a, b: a + b['slugs'], getattr(base_index.nodes, 'ref_parts', []), [])]
            if len(context_terms) == 0: continue
            temp_matches = self._get_unrefined_ref_part_matches_recursive(raw_ref, root_trie, context_terms=context_terms)
            matches += list(filter(lambda x: len(x.resolved_ref_parts) and len(x.resolved_context_terms), temp_matches))
        return matches

    def _get_unrefined_ref_part_matches_recursive(self, raw_ref: RawRef, title_trie: RefPartTitleTrie, prev_ref_parts: list=None, context_terms: List[NonUniqueTerm]=None, prev_context_terms=None) -> List['ResolvedRawRef']:
        ref_parts = raw_ref.raw_ref_parts
        context_terms = context_terms or []
        prev_ref_parts = prev_ref_parts or []
        prev_context_terms = prev_context_terms or []
        matches = []
        trie_entries: List[TrieEntry] = ref_parts + context_terms
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
            temp_ref_parts = [ref_parts[j] for j in range(len(ref_parts)) if j != i]
            temp_context_terms = [context_terms[j] for j in range(len(context_terms)) if j != (i-len(ref_parts))]
            matches += self._get_unrefined_ref_part_matches_recursive(RawRef(temp_ref_parts, raw_ref.span), temp_title_trie, prev_ref_parts=temp_prev_ref_parts, context_terms=temp_context_terms, prev_context_terms=temp_prev_context_terms)

        return self._prune_unrefined_ref_part_matches(matches)

    def refine_ref_part_matches(self, ref_part_matches: list, raw_ref: 'RawRef') -> list:
        fully_refined = []
        match_queue = ref_part_matches[:]
        while len(match_queue) > 0:
            match = match_queue.pop(0)
            unused_ref_parts = match.get_unused_ref_parts(raw_ref)
            has_match = False
            if isinstance(match.node, schema.NumberedTitledTreeNode):
                child = match.node.get_referenceable_child(match.ref)
                children = [] if child is None else [child]
            elif isinstance(match.node, schema.DiburHamatchilNode):
                children = []
            else:
                children = match.node.all_children()
            for child in children:
                for ref_part in unused_ref_parts:
                    temp_matches = match.get_refined_matches(ref_part, child, self.lang)
                    match_queue += temp_matches
                    if len(temp_matches) > 0: has_match = True
            if not has_match:
                fully_refined += [match]
        
        return self._prune_refined_ref_part_matches(fully_refined)

    def _prune_unrefined_ref_part_matches(self, ref_part_matches: List['ResolvedRawRef']) -> List['ResolvedRawRef']:
        index_match_map = defaultdict(list)
        for match in ref_part_matches:
            key = match.node.title if isinstance(match.node, text.Index) else match.node.ref().normal()
            index_match_map[key] += [match]
        pruned_matches = []
        for match_list in index_match_map.values():
            pruned_matches += [max(match_list, key=lambda m: len(m.resolved_ref_parts))]
        return pruned_matches

    def _prune_refined_ref_part_matches(self, ref_part_matches: List['ResolvedRawRef']) -> List['ResolvedRawRef']:
        """
        So far simply returns all matches with the maximum number of resolved_ref_parts
        """
        max_ref_parts = 0
        max_ref_part_matches = []
        for match in ref_part_matches:
            if len(match.resolved_ref_parts) > max_ref_parts:
                max_ref_parts = len(match.resolved_ref_parts)
                max_ref_part_matches = [match]
            elif len(match.resolved_ref_parts) == max_ref_parts:
                max_ref_part_matches += [match]
        return max_ref_part_matches

