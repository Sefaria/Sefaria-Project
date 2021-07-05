from . import abstract as abst
from . import text
from . import schema
from spacy.tokens import Span

REF_PART_TYPE_NAMED = "named"
REF_PART_TYPE_NUMBERED = "numbered"

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
    
    def __init__(self, source: str, span: Span, potential_dh_continuation: str=None) -> None:
        super().__init__(source)
        self.span = span
        self.potential_dh_continuation = potential_dh_continuation

    def get_ref_matches(self, structured_ref_part:'StructuredRefPart'):
        pass

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

class RefResolver:

    def __init__(self, lang) -> None:
        self.lang = lang

    def find_potential_root_structured_ref_parts(self, context_ref: text.Ref, raw_ref: 'RawRef') -> list:
        # TODO implement `type` on ref part and filter by "named" ref parts only
        from .text import library
        return self._find_potential_root_structured_ref_parts_recursive(raw_ref.raw_ref_parts, library.get_all_root_ref_part_titles()[self.lang])

    def _find_potential_root_structured_ref_parts_recursive(self, ref_parts: list, title_trie: dict) -> list:
        roots = title_trie.get(None, [])
        for i, ref_part in enumerate(ref_parts):
            temp_title_trie = title_trie.get(ref_part.span.text, None)
            if temp_title_trie is None: continue
            temp_ref_parts = [ref_parts[j] for j in range(len(ref_parts)) if j != i]
            roots += self._find_potential_root_structured_ref_parts_recursive(temp_ref_parts, temp_title_trie)
        return roots

    def score_and_prune_ref_parts(self, curr_ref_parts: list) -> list:
        pass
