import dataclasses
from typing import List, Optional, Union, Iterable, Tuple
from tqdm import tqdm
from sefaria.model.text import Ref
from sefaria.model.linker.ref_part import RawRef, RawNamedEntity
from sefaria.model.linker.ref_resolver import RefResolver, ResolutionThoroughness, PossiblyAmbigResolvedRef
from sefaria.model.linker.named_entity_resolver import NamedEntityResolver, ResolvedNamedEntity
from sefaria.model.linker.named_entity_recognizer import NamedEntityRecognizer


@dataclasses.dataclass
class LinkedDoc:
    text: str
    resolved_refs: List[PossiblyAmbigResolvedRef]
    resolved_named_entities: List[ResolvedNamedEntity]

    @property
    def all_resolved(self) -> List[Union[PossiblyAmbigResolvedRef, ResolvedNamedEntity]]:
        return self.resolved_refs + self.resolved_named_entities


class Linker:

    def __init__(self, ner: NamedEntityRecognizer, ref_resolver: RefResolver, ne_resolver: NamedEntityResolver, ):
        self._ner = ner
        self._ref_resolver = ref_resolver
        self._ne_resolver = ne_resolver

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
        all_named_entities = self._ner.bulk_recognize(inputs)
        docs = []
        book_context_refs = book_context_refs or [None]*len(all_named_entities)
        iterable = self._get_bulk_link_iterable(inputs, all_named_entities, book_context_refs, verbose)
        for input_str, book_context_ref, inner_named_entities in iterable:
            raw_refs, named_entities = self._partition_raw_refs_and_named_entities(inner_named_entities)
            resolved_refs, resolved_named_entities = [], []
            if type_filter in {'all', 'citation'}:
                resolved_refs = self._ref_resolver.bulk_resolve(raw_refs, book_context_ref, with_failures, thoroughness)
            if type_filter in {'all', 'named entity'}:
                resolved_named_entities = self._ne_resolver.bulk_resolve(named_entities, with_failures)
            docs += [LinkedDoc(input_str, resolved_refs, resolved_named_entities)]

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
        resolved_refs, resolved_named_entities = [], []
        if type_filter in {'all', 'citation'}:
            resolved_refs = self._ref_resolver.bulk_resolve(raw_refs, book_context_ref, with_failures, thoroughness)
        if type_filter in {'all', 'named entity'}:
            resolved_named_entities = self._ne_resolver.bulk_resolve(named_entities, with_failures)
        doc = LinkedDoc(input_str, resolved_refs, resolved_named_entities)
        self._ner.map_normal_output_to_original_input(input_str, [x.raw_entity for x in doc.all_resolved])
        return doc

    def get_ner(self) -> NamedEntityRecognizer:
        return self._ner

    def reset_ibid_history(self) -> None:
        """
        Reflecting this function out
        @return:
        """
        self._ref_resolver.reset_ibid_history()

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
