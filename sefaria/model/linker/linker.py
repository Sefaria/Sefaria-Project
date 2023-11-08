from typing import List, Optional, Union, Iterable, Tuple
from tqdm import tqdm
from sefaria.model.text import Ref
from sefaria.model.linker.ref_part import RawRef, RawNamedEntity
from sefaria.model.linker.ref_resolver import RefResolver, ResolutionThoroughness
from sefaria.model.linker.named_entity_resolver import NamedEntityResolver, NamedEntityRecognizer


class Linker:

    def __init__(self, ref_resolver: RefResolver, ne_resolver: NamedEntityResolver, ne_recognizer: NamedEntityRecognizer):
        self._ref_resolver = ref_resolver
        self._ne_resolver = ne_resolver
        self._ne_recognizer = ne_recognizer

    def bulk_link(self, inputs: List[str], book_context_refs: Optional[List[Optional[Ref]]] = None, with_failures=False,
                  verbose=False, thoroughness=ResolutionThoroughness.NORMAL):
        all_named_entities = self._ne_recognizer.bulk_get_raw_named_entities(inputs)
        resolved = []
        iterable = self._get_bulk_link_iterable(all_named_entities, book_context_refs, verbose)
        for book_context_ref, inner_named_entities in iterable:
            raw_refs, named_entities = self._partition_raw_refs_and_named_entities(inner_named_entities)
            resolved_refs = self._ref_resolver.bulk_resolve(raw_refs, book_context_ref, with_failures, thoroughness)
            resolved_named_entities = self._ne_resolver.bulk_resolve(named_entities, with_failures)
            resolved += [resolved_refs + resolved_named_entities]

        named_entity_list_list = [[rr.raw_named_entity for rr in inner_resolved] for inner_resolved in resolved]
        self._ne_recognizer.bulk_map_normal_output_to_original_input(inputs, named_entity_list_list)
        return resolved

    @staticmethod
    def _partition_raw_refs_and_named_entities(raw_refs_and_named_entities: List[RawNamedEntity]) \
            -> Tuple[List[RawRef], List[RawNamedEntity]]:
        raw_refs = [ne for ne in raw_refs_and_named_entities if isinstance(ne, RawRef)]
        named_entities = [ne for ne in raw_refs_and_named_entities if not isinstance(ne, RawRef)]
        return raw_refs, named_entities

    @staticmethod
    def _get_bulk_link_iterable(all_named_entities: List[List[RawNamedEntity]],
                                book_context_refs: Optional[List[Optional[Ref]]] = None, verbose=False
                                ) -> Iterable[Tuple[Ref, List[RawNamedEntity]]]:
        iterable = zip(book_context_refs, all_named_entities)
        if verbose:
            iterable = tqdm(iterable, total=len(book_context_refs))
        return iterable

