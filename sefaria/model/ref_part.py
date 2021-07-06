from typing import List
from . import abstract as abst
from . import text
from . import schema
from spacy.tokens import Span

REF_PART_TYPE_NAMED = "named"
REF_PART_TYPE_NUMBERED = "numbered"
REF_PART_TYPE_DH = "dibur_hamatchil"

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
    
    def __init__(self, source: str, type: str, span: Span, potential_dh_continuation: str=None) -> None:
        self.source = source
        self.span = span
        self.type = type
        self.potential_dh_continuation = potential_dh_continuation

    def matches(self, node: schema.SchemaNode) -> bool:
        if self.type == REF_PART_TYPE_NUMBERED and isinstance(node, schema.JaggedArrayNode):
            pass
        elif self.type == REF_PART_TYPE_NAMED and isinstance(node, schema.ArrayMapNode):
            pass
        elif self.type == REF_PART_TYPE_NAMED and isinstance(node, schema.SchemaNode):
            pass
        elif self.type == REF_PART_TYPE_DH and isinstance(node, DiburHamatchilNode):
            pass
        # TODO sham and directional cases
        return False

    def __str__(self):
        return f"{self.__class__.__name__}: {self.span}, Source = {self.source}"

    def __repr__(self):
        return f"{self.__class__.__name__}({self.source}, {self.span}, {self.potential_dh_continuation})"

    def __eq__(self, other):
        return isinstance(other, RawRefPart) and self.__hash__() == other.__hash__()

    def __hash__(self):
        return hash(f"{self.source}|{self.span.__hash()}|{self.potential_dh_continuation}")

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

    def get_unused_ref_parts(self, ref_parts: list):
        return [ref_part for ref_part in ref_parts if ref_part in self.raw_ref_parts]

    def get_refined_matches(self, raw_ref_part, node, lang: str) -> List['RawRefPartMatch']:
        refined_ref_parts = self.raw_ref_parts + [raw_ref_part]
        if isinstance(node, schema.JaggedArrayNode):
            refined_ref = self.ref.subref(node.address_class(0).toNumber(lang, raw_ref_part))

        else:
            return [RawRefPartMatch(refined_ref_parts, node, node.ref())]

class RefResolver:

    def __init__(self, lang) -> None:
        self.lang = lang

    def get_unrefined_ref_part_matches(self, context_ref: text.Ref, raw_ref: 'RawRef') -> list:
        # TODO implement `type` on ref part and filter by "named" ref parts only
        from .text import library
        return self._get_unrefined_ref_part_matches_recursive(raw_ref.raw_ref_parts, library.get_all_root_ref_part_titles()[self.lang])

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
        return matches

    def refine_ref_part_matches(self, ref_part_matches: list, ref_parts: list) -> list:
        fully_refined = []
        match_queue = [match.node for match in ref_part_matches]
        while len(match_queue) > 0:
            match = match_queue.pop(0)
            unused_ref_parts = match.get_unused_parts(ref_parts)
            has_match = False
            if isinstance(match.node, schema.NumberedTitledTreeNode):
                child = match.node.get_referenceable_child()
                children = [] if child is None else [child]
            else:
                children = match.node.all_children()
            for child in children:
                for ref_part in unused_ref_parts:
                    if ref_part.matches(child):
                        has_match = True
                        match_queue += match.get_refined_matches(ref_part, child)
            if not has_match:
                fully_refined += [match]
        
        return fully_refined

    def to_number(lang: str, addr, s: str, SuperClass: type=None):
        import regex
        try:
            regex_func = addr.regex if SuperClass is None else super(SuperClass, addr).regex
            toNumber_func = addr.toNumber if SuperClass is None else super(SuperClass, addr).toNumber
        except AttributeError:
            return
        reg = regex.compile(regex_func(lang, strict=True), regex.VERBOSE)
        match = reg.match(s)
        if match:
            return toNumber_func(lang, match.group(1))

    def all_to_number(lang: str, addr, s: str):
        results = []
        for SuperClass in [None] + list(addr.__class__.__mro__):
            result = to_number(lang, addr, s, SuperClass)
            if result is None: continue
            results += [result]
        return results

