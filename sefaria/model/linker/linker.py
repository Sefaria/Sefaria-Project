import dataclasses
from typing import List, Optional, Union, Iterable, Tuple
from tqdm import tqdm
from sefaria.model.text import Ref
from sefaria.model.linker.ref_part import RawRef, RawNamedEntity, span_inds
from sefaria.model.linker.ref_resolver import RefResolver, ResolutionThoroughness, PossiblyAmbigResolvedRef, ResolvedRef
from sefaria.model.linker.named_entity_resolver import NamedEntityResolver, ResolvedNamedEntity
from sefaria.model.linker.named_entity_recognizer import NamedEntityRecognizer
from sefaria.model.linker.category_resolver import CategoryResolver, ResolvedCategory


@dataclasses.dataclass
class LinkedDoc:
    text: str
    resolved_refs: list[PossiblyAmbigResolvedRef]
    resolved_named_entities: list[ResolvedNamedEntity]
    resolved_categories: list[ResolvedCategory]

    @property
    def all_resolved(self) -> List[Union[PossiblyAmbigResolvedRef, ResolvedNamedEntity, ResolvedCategory]]:
        return self.resolved_refs + self.resolved_named_entities + self.resolved_categories


class Linker:

    def __init__(self, ner: NamedEntityRecognizer, ref_resolver: RefResolver, ne_resolver: NamedEntityResolver, cat_resolver: CategoryResolver):
        self._ner = ner
        self._ref_resolver = ref_resolver
        self._ne_resolver = ne_resolver
        self._cat_resolver = cat_resolver

    def bulk_link(self, inputs: List[str], book_context_refs: Optional[List[Optional[Ref]]] = None, with_failures=False,
                  verbose=False, thoroughness=ResolutionThoroughness.NORMAL, type_filter='all') -> List[LinkedDoc]:
        """
        Bulk operation to link every string in `inputs` with citations and named entities
        `bulk_link()` is faster than running `link()` in a loop because it can pass all strings to the relevant models
        at once.
        @param inputs: String inputs. Each input is processed independently.
        @param book_context_refs: Additional context references that represents the source book that the input came from.
        @param with_failures: True to return all recognized entities, even if they weren't linked.
        @param verbose: True to print progress to the console
        @param thoroughness: How thorough the search to link entities should be. HIGH increases the processing time.
        @param type_filter: Type of entities to return, either 'all', 'citation' or 'named entity'
        @return: list of LinkedDocs
        """
        self._ref_resolver.reset_ibid_history()
        all_named_entities = self._ner.bulk_recognize(inputs)
        docs = []
        book_context_refs = book_context_refs or [None]*len(all_named_entities)
        iterable = self._get_bulk_link_iterable(inputs, all_named_entities, book_context_refs, verbose)
        for input_str, book_context_ref, inner_named_entities in iterable:
            raw_refs, named_entities = self._partition_raw_refs_and_named_entities(inner_named_entities)
            resolved_refs, resolved_named_entities, resolved_cats = [], [], []
            if type_filter in {'all', 'citation'}:
                resolved_refs, resolved_cats = self._bulk_resolve_refs_and_cats(raw_refs, book_context_ref, thoroughness, False)
            if type_filter in {'all', 'named entity'}:
                resolved_named_entities = self._ne_resolver.bulk_resolve(named_entities)
            if not with_failures:
                resolved_refs, resolved_named_entities, resolved_cats = self._remove_failures(resolved_refs, resolved_named_entities, resolved_cats)
            docs += [LinkedDoc(input_str, resolved_refs, resolved_named_entities, resolved_cats)]

        named_entity_list_list = [[rr.raw_entity for rr in doc.all_resolved] for doc in docs]
        self._ner.bulk_map_normal_output_to_original_input(inputs, named_entity_list_list)
        return docs

    def link(self, input_str: str, book_context_ref: Optional[Ref] = None, with_failures=False,
             thoroughness=ResolutionThoroughness.NORMAL, type_filter='all') -> LinkedDoc:
        """
        Link `input_str` with citations and named entities
        @param input_str:
        @param book_context_ref: Additional context reference that represents the source book that the input came from.
        @param with_failures: True to return all recognized entities, even if they weren't linked.
        @param thoroughness: How thorough the search to link entities should be. HIGH increases the processing time.
        @param type_filter: Type of entities to return, either 'all', 'citation' or 'named entity'
        @return:
        """
        raw_refs, named_entities = self._ner.recognize(input_str)
        resolved_refs, resolved_named_entities, resolved_cats = [], [], []
        if type_filter in {'all', 'citation'}:
            resolved_refs, resolved_cats = self._bulk_resolve_refs_and_cats(raw_refs, book_context_ref, thoroughness)
        if type_filter in {'all', 'named entity'}:
            resolved_named_entities = self._ne_resolver.bulk_resolve(named_entities)
        if not with_failures:
            resolved_refs, resolved_named_entities, resolved_cats = self._remove_failures(resolved_refs, resolved_named_entities, resolved_cats)
        doc = LinkedDoc(input_str, resolved_refs, resolved_named_entities, resolved_cats)
        self._ner.map_normal_output_to_original_input(input_str, [x.raw_entity for x in doc.all_resolved])
        return doc

    def link_by_paragraph(self, input_str: str, book_context_ref: Optional[Ref] = None, *link_args, **link_kwargs) -> LinkedDoc:
        """
        Similar to `link()` except model is run on each paragraph individually (via a bulk operation)
        This better mimics the way the underlying ML models were trained and tends to lead to better results
        Paragraphs are delineated by new line characters
        @param input_str:
        @param book_context_ref:
        @param link_args: *args to be passed to link()
        @param link_kwargs: **kwargs to be passed to link()
        @return:
        """
        import re

        inputs = re.split(r'\s*\n+\s*', input_str)
        linked_docs = self.bulk_link(inputs, [book_context_ref]*len(inputs), *link_args, **link_kwargs)
        resolved_refs = []
        resolved_named_entities = []
        resolved_categories = []
        full_spacy_doc = self._ner.named_entity_model.make_doc(input_str)
        offset = 0
        for curr_input, linked_doc in zip(inputs, linked_docs):
            resolved_refs += linked_doc.resolved_refs
            resolved_named_entities += linked_doc.resolved_named_entities
            resolved_categories += linked_doc.resolved_categories

            for resolved in linked_doc.all_resolved:
                named_entity = resolved.raw_entity
                named_entity.align_to_new_doc(full_spacy_doc, offset)
                if isinstance(named_entity, RawRef):
                    # named_entity's current start has already been offset so it's the offset we need for each part
                    raw_ref_offset, _ = span_inds(named_entity.span)
                    named_entity.align_parts_to_new_doc(full_spacy_doc, raw_ref_offset)
            curr_token_count = len(self._ner.named_entity_model.make_doc(curr_input))
            offset += curr_token_count+1  # +1 for newline token
        return LinkedDoc(input_str, resolved_refs, resolved_named_entities, resolved_categories)

    def get_ner(self) -> NamedEntityRecognizer:
        return self._ner

    def reset_ibid_history(self) -> None:
        """
        Reflecting this function out
        @return:
        """
        self._ref_resolver.reset_ibid_history()

    def _bulk_resolve_refs_and_cats(self, raw_refs, book_context_ref, thoroughness, reset_ibids=True) -> (list[ResolvedRef], list[ResolvedCategory]):
        """
        First match categories, then resolve refs for anything that didn't match a category
        This prevents situations where a category is parsed as a ref using ibid (e.g. Talmud with context Berakhot 2a)
        @param raw_refs:
        @param book_context_ref:
        @param thoroughness:
        @param reset_ibids:
        @return:
        """
        possibly_resolved_cats = self._cat_resolver.bulk_resolve(raw_refs)
        unresolved_raw_refs = [r.raw_entity for r in filter(lambda r: r.resolution_failed, possibly_resolved_cats)]
        resolved_cats = list(filter(lambda r: not r.resolution_failed, possibly_resolved_cats))
        #try to resolve only unresolved categories (unresolved_raw_refs) as refs:
        resolved_refs = self._ref_resolver.bulk_resolve(unresolved_raw_refs, book_context_ref, thoroughness, reset_ibids=reset_ibids)
        return resolved_refs, resolved_cats

    @staticmethod
    def _partition_raw_refs_and_named_entities(raw_refs_and_named_entities: List[RawNamedEntity]) \
            -> Tuple[List[RawRef], List[RawNamedEntity]]:
        raw_refs = [ne for ne in raw_refs_and_named_entities if isinstance(ne, RawRef)]
        named_entities = [ne for ne in raw_refs_and_named_entities if not isinstance(ne, RawRef)]
        return raw_refs, named_entities

    @staticmethod
    def _get_bulk_link_iterable(inputs: List[str], all_named_entities: List[List[RawNamedEntity]],
                                book_context_refs: Optional[List[Optional[Ref]]] = None, verbose=False
                                ) -> Iterable[Tuple[Ref, List[RawNamedEntity]]]:
        iterable = zip(inputs, book_context_refs, all_named_entities)
        if verbose:
            iterable = tqdm(iterable, total=len(book_context_refs))
        return iterable

    @staticmethod
    def _remove_failures(*args):
        out = []
        for arg in args:
            out.append(list(filter(lambda x: not x.resolution_failed, arg)))
        return out
