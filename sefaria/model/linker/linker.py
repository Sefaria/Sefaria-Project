from typing import List, Optional, Union
from sefaria.model.text import Ref
from sefaria.model.linker.ref_part import RawRef
from sefaria.model.linker.ref_resolver import RefResolver, ResolutionThoroughness
from sefaria.model.linker.named_entity_resolver import NamedEntityResolver, NamedEntityRecognizer


class Linker:

    def __init__(self, ref_resolver: RefResolver, ne_resolver: NamedEntityResolver, ne_recognizer: NamedEntityRecognizer):
        self._ref_resolver = ref_resolver
        self._ne_resolver = ne_resolver
        self._ne_recognizer = ne_recognizer

    def bulk_link(self, input: List[str], book_context_refs: Optional[List[Optional[Ref]]] = None, with_failures=False,
                     verbose=False, reset_ibids_every_context_ref=True, thoroughness=ResolutionThoroughness.NORMAL):
        all_named_entities = self._ne_recognizer.bulk_get_raw_named_entities(input)
        resolved = []
        for inner_named_entities in all_named_entities:
            for named_entity in inner_named_entities:
                if isinstance(named_entity, RawRef):
                    # resolve with ref resolver
                    pass
                else:
                    # resolve with ne resolver
                    pass
        return resolved
