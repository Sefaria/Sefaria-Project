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

class RawRef:
    
    def __init__(self, raw_ref_parts: list, span: Span) -> None:
        self.raw_ref_parts = raw_ref_parts
        self.span = span

class DiburHamatchilNode(abst.AbstractMongoRecord):
    """
    Very likely possible to use VirtualNode and add these nodes as children of JANs and ArrayMapNodes. But that can be a little complicated
    """
    collection="dibur_hamatchils"
    required_attrs = [
        "dibur_hamatchil",
        "container_refs",
        "ref",
    ]

    def fuzzy_match_score(self, text: str, potential_dh_continuation: str):
        pass

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
            possible_sections = node.address_class(0).get_all_possible_sections_from_string(lang, raw_ref_part.span.text)
            for sec in possible_sections:
                refined_ref = self.ref.subref(sec)
                matches += [RawRefPartMatch(refined_ref_parts, node, refined_ref)]
        elif raw_ref_part.type == RefPartType.NAMED and isinstance(node, schema.ArrayMapNode):
            pass
        elif raw_ref_part.type == RefPartType.NAMED and isinstance(node, schema.SchemaNode):
            if raw_ref_part.span.text in getattr(node, 'ref_parts', set()):
                matches += [RawRefPartMatch(refined_ref_parts, node, node.ref())]
        elif raw_ref_part.type == RefPartType.DH and isinstance(node, DiburHamatchilNode):
            pass
        # TODO sham and directional cases
        return matches

class RefResolver:

    def __init__(self, lang) -> None:
        self.lang = lang

    def get_unrefined_ref_part_matches(self, context_ref: text.Ref, raw_ref: 'RawRef') -> list:
        # TODO implement `type` on ref part and filter by "named" ref parts only
        from .text import library
        return self._get_unrefined_ref_part_matches_recursive(raw_ref.raw_ref_parts, library.get_root_ref_part_titles()[self.lang])

    def _get_unrefined_ref_part_matches_recursive(self, ref_parts: list, title_trie: dict, prev_ref_parts: list=None) -> list:
        prev_ref_parts = prev_ref_parts or []
        matches = []
        for i, ref_part in enumerate(ref_parts):
            temp_prev_ref_parts = prev_ref_parts + [ref_part]
            temp_title_trie = title_trie.get(ref_part.span.text, None)
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

