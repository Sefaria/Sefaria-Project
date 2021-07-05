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

class AbstractRefPart:
    
    def __init__(self, source: str) -> None:
        self.source = source

class RawRefPart(AbstractRefPart):
    
    def __init__(self, source: str, type: str, span: Span, potential_dh_continuation: str=None) -> None:
        super().__init__(source)
        self.span = span
        self.type = type
        self.potential_dh_continuation = potential_dh_continuation

    def matches(self, node:schema.SchemaNode):
        if self.type == REF_PART_TYPE_NUMBERED and isinstance(node, schema.JaggedArrayNode):
            pass
        elif self.type == REF_PART_TYPE_NAMED and isinstance(node, schema.SchemaNode):
            pass

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

class StructuredRefPart(AbstractRefPart):
    
    def __init__(self, source: str, ref:text.Ref=None, schema_node: schema.SchemaNode=None, **kwargs) -> None:
        super().__init__(source, **kwargs)
        self.ref = ref
        self.schema_node = schema_node

class AbstractNamedRefPart(AbstractRefPart):

    def __init__(self, source: str, term: 'NonUniqueTerm', **kwargs) -> None:
        super().__init__(source, **kwargs)
        self.term = term

class TitleRefPart(AbstractNamedRefPart):

    def __init__(self, source: str, term: 'NonUniqueTerm', child: 'StructuredRefPart') -> None:
        super().__init__(source, term)
        self.child = child

class StructuredNamedRefPart(StructuredRefPart, AbstractNamedRefPart):
    
    def __init__(self, source: str, ref: text.Ref, schema_node: schema.SchemaNode, term: 'NonUniqueTerm') -> None:
        super().__init__(source, ref=ref, schema_node=schema_node, term=term)

class NumberedRefPart(StructuredRefPart):

    def __init__(self, source: str, ref: text.Ref, schema_node: schema.SchemaNode, base_ref: text.Ref, address_type: schema.AddressType) -> None:
        super().__init__(source, ref=ref, schema_node=schema_node)
        self.base_ref = base_ref
        self.address_type = address_type

class DiburHamatchilRefPart(StructuredRefPart, abst.AbstractMongoRecord):
    
    collection="dibur_hamatchils"
    required_attrs = [
        "dibur_hamatchil",
        "container_refs",
        "ref",
    ]

    def __init__(self, source: str, ref: text.Ref, schema_node: schema.SchemaNode, attrs=None) -> None:
        StructuredRefPart.__init__(source, ref=ref, schema_node=schema_node)
        abst.AbstractMongoRecord.__init__(attrs)

    def fuzzy_match_score(self, text: str, potential_dh_continuation: str):
        pass

class RawRefPartMatch:

    def __init__(self, raw_ref_parts, node) -> None:
        self.raw_ref_parts = raw_ref_parts
        self.node = node

    def get_unused_ref_parts(self, ref_parts: list):
        return [ref_part for ref_part in ref_parts if ref_part in self.raw_ref_parts]

    def refine(self, raw_ref_part, node) -> 'RawRefPartMatch':
        return RawRefPartMatch(self.raw_ref_parts + [raw_ref_part], node)

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
                matches += [RawRefPartMatch(temp_prev_ref_parts, node) for node in temp_title_trie[None]]
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
            for child in match.node.all_children():
                for ref_part in unused_ref_parts:
                    if ref_part.matches(child):
                        has_match = True
                        match_queue += [match.refine(ref_part, child)]
            if not has_match:
                fully_refined += [match]
        
        return fully_refined


