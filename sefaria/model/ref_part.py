from collections import defaultdict
from typing import List
from enum import Enum
from . import abstract as abst
from . import text
from . import schema
from spacy.tokens import Span

class RefPartType(Enum):
    NAMED = "named"
    NUMBERED = "numbered"
    DH = "dibur_hamatchil"

class NonUniqueTerm(abst.AbstractMongoRecord, schema.AbstractTitledObject):
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

class NonUniqueTermSet(abst.AbstractMongoSet):
    recordClass = NonUniqueTerm

class RawRefPart:
    
    def __init__(self, source: str, type: 'RefPartType', span: Span, potential_dh_continuation: str=None) -> None:
        self.source = source
        self.span = span
        self.type = type
        self.potential_dh_continuation = potential_dh_continuation

    def __str__(self):
        return f"{self.__class__.__name__}: {self.span}, Source = {self.source}"

    def __repr__(self):
        return f"{self.__class__.__name__}({self.source}, {self.span}, {self.potential_dh_continuation})"

    def __eq__(self, other):
        return isinstance(other, RawRefPart) and self.__hash__() == other.__hash__()

    def __hash__(self):
        return hash(f"{self.source}|{self.span.__hash__()}|{self.potential_dh_continuation}")

    def __ne__(self, other):
        return not self.__eq__(other)

    def get_text(self):
        return self.span.text

    text = property(get_text)

class RawRef:
    
    def __init__(self, raw_ref_parts: list, span: Span) -> None:
        self.raw_ref_parts = raw_ref_parts
        self.span = span

    def get_text(self):
        return self.span.text

    text = property(get_text)

class RawRefPartMatch:

    def __init__(self, raw_ref_parts, node, ref: text.Ref) -> None:
        self.raw_ref_parts = raw_ref_parts
        self.node = node
        self.ref = ref

    def get_unused_ref_parts(self, raw_ref: 'RawRef'):
        return [ref_part for ref_part in raw_ref.raw_ref_parts if ref_part not in self.raw_ref_parts]

    def get_refined_matches(self, raw_ref_part, node, lang: str) -> List['RawRefPartMatch']:
        refined_ref_parts = self.raw_ref_parts + [raw_ref_part]
        matches = []
        if raw_ref_part.type == RefPartType.NUMBERED and isinstance(node, schema.JaggedArrayNode):
            possible_sections, possible_to_sections = node.address_class(0).get_all_possible_sections_from_string(lang, raw_ref_part.text)
            for sec, toSec in zip(possible_sections, possible_to_sections):
                refined_ref = self.ref.subref(sec)
                if toSec != sec:
                    to_ref = self.ref.subref(toSec)
                    refined_ref = refined_ref.to(to_ref)
                matches += [RawRefPartMatch(refined_ref_parts, node, refined_ref)]
        elif raw_ref_part.type == RefPartType.NAMED and isinstance(node, schema.ArrayMapNode):
            pass
        elif raw_ref_part.type == RefPartType.NAMED and isinstance(node, schema.SchemaNode):
            if raw_ref_part.text in getattr(node, 'ref_parts', set()):
                matches += [RawRefPartMatch(refined_ref_parts, node, node.ref())]
        elif raw_ref_part.type == RefPartType.DH and isinstance(node, schema.DiburHamatchilNodeSet):
            pass
        # TODO sham and directional cases
        return matches

class RefPartTitleTrie:

    PREFIXES = {'ב'}

    def __init__(self, lang, nodes=None, sub_trie=None) -> None:
        self.lang = lang
        if nodes is not None:
            self.__init_with_nodes(nodes)
        else:
            self._trie = sub_trie

    def __init_with_nodes(self, nodes):
        self._trie = {}
        for node in nodes:
            curr_dict_queue = [self._trie]
            for term_slug, optional in zip(node.ref_part_terms, getattr(node, 'ref_parts_optional', [])):
                term = NonUniqueTerm.init(term_slug)
                len_curr_dict_queue = len(curr_dict_queue)
                for _ in range(len_curr_dict_queue):
                    curr_dict = curr_dict_queue[0] if optional else curr_dict_queue.pop(0)  # dont remove curr_dict if optional. leave it for next level to add to.
                    for title in term.get_titles(self.lang):
                        if title in curr_dict:
                            temp_dict = curr_dict[title]
                        else:
                            temp_dict = {}
                            curr_dict[title] = temp_dict
                        curr_dict_queue += [temp_dict]
            # add nodes to leaves
            # None key indicates this is a leaf                            
            for curr_dict in curr_dict_queue:
                if None in curr_dict:
                    curr_dict[None] += [node.index]
                else:
                    curr_dict[None] = [node.index]

    def __getitem__(self, key):
        return self.get(key)        

    def get(self, key, default=None):
        sub_trie = self._trie.get(key, default)
        if sub_trie is default and self.lang == 'he':
            # try with prefixes
            for prefix in self.PREFIXES:
                if not key.startswith(prefix): continue
                sub_trie = self._trie.get(key[len(prefix):], default)
                if sub_trie is not None: break

        if sub_trie is None: return
        return RefPartTitleTrie(self.lang, sub_trie=sub_trie)

    def __contains__(self, key):
        return key in self._trie

    def __iter__(self):
        for item in self._trie:
            yield item

class RefResolver:

    def __init__(self, lang) -> None:
        self.lang = lang

    def get_unrefined_ref_part_matches(self, context_ref: text.Ref, raw_ref: 'RawRef') -> list:
        from .text import library
        return self._get_unrefined_ref_part_matches_recursive(raw_ref.raw_ref_parts, library.get_root_ref_part_title_trie(self.lang))

    def _get_unrefined_ref_part_matches_recursive(self, ref_parts: list, title_trie: RefPartTitleTrie, prev_ref_parts: list=None) -> list:
        prev_ref_parts = prev_ref_parts or []
        matches = []
        for i, ref_part in enumerate(ref_parts):
            # no need to consider other types at root level
            if ref_part.type != RefPartType.NAMED: continue
            temp_prev_ref_parts = prev_ref_parts + [ref_part]
            temp_title_trie = title_trie[ref_part.text]
            if temp_title_trie is None: continue
            if None in temp_title_trie:
                matches += [RawRefPartMatch(temp_prev_ref_parts, index, index.nodes.ref()) for index in temp_title_trie[None]]
            temp_ref_parts = [ref_parts[j] for j in range(len(ref_parts)) if j != i]
            matches += self._get_unrefined_ref_part_matches_recursive(temp_ref_parts, temp_title_trie, temp_prev_ref_parts)
        return self._prune_unrefined_ref_part_matches(matches)

    def _prune_unrefined_ref_part_matches(self, ref_part_matches: List['RawRefPartMatch']) -> List['RawRefPartMatch']:
        index_match_map = defaultdict(list)
        for match in ref_part_matches:
            index_match_map[match.node.title] += [match]
        pruned_matches = []
        for match_list in index_match_map.values():
            pruned_matches += [max(match_list, key=lambda m: len(m.raw_ref_parts))]
        return pruned_matches

    def refine_ref_part_matches(self, ref_part_matches: list, raw_ref: 'RawRef') -> list:
        fully_refined = []
        match_queue = ref_part_matches[:]
        while len(match_queue) > 0:
            match = match_queue.pop(0)
            unused_ref_parts = match.get_unused_ref_parts(raw_ref)
            has_match = False
            if isinstance(match.node, schema.NumberedTitledTreeNode):
                child = match.node.get_referenceable_child()
                children = [] if child is None else [child]
            elif isinstance(match.node, schema.DiburHamatchilNodeSet):
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
        
        return fully_refined

