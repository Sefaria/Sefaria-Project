from collections import defaultdict, Counter
from itertools import product
from typing import List, Sequence, Dict, Optional, Tuple, Iterable, Callable, Set, TYPE_CHECKING
from enum import Enum

from sefaria.model import schema
from sefaria.model.linker.ref_part import RawRef, RawRefPart, TermContext
import structlog

if TYPE_CHECKING:
    from sefaria.model.linker.ref_resolver import TermMatcher

logger = structlog.get_logger(__name__)


class ContextMutationOp(str, Enum):
    ADD = "add"
    SWAP = "swap"


class ContextMutation:
    """
    Wrapper for a context mutation rule declared on a SchemaNode.
    """

    def __init__(self, op: ContextMutationOp, input_terms: Sequence[str], output_terms: Sequence[str]) -> None:
        if len(input_terms) == 0:
            raise ValueError("ContextMutation requires at least one input term")
        self.op = op
        self.input_terms = tuple(input_terms)
        self.output_terms = tuple(output_terms)

    def applies_to(self, matched_terms: Sequence[str]) -> bool:
        return tuple(matched_terms) == self.input_terms

    def apply(self, raw_parts: List[RawRefPart], output_contexts: Sequence[TermContext]) -> List[RawRefPart]:
        """Given the already-matched raw parts and the TermContexts to insert, return the mutated part list."""
        if len(output_contexts) != len(self.output_terms):
            raise ValueError("Mismatch between declared output_terms and provided TermContexts")
        if self.op == ContextMutationOp.SWAP:
            return list(output_contexts)
        if self.op == ContextMutationOp.ADD:
            return list(raw_parts) + list(output_contexts)
        raise ValueError(f"Unknown ContextMutation op {self.op}")

    def __repr__(self) -> str:
        return f"ContextMutation(op={self.op}, input_terms={self.input_terms}, output_terms={self.output_terms})"


class ContextMutationSet:
    """
    Collection of ContextMutations keyed by their input tuple with descendant-precedence semantics.
    """

    def __init__(self) -> None:
        self._mutations: Dict[Tuple[str, ...], List[ContextMutation]] = {}

    def add_mutations(self, mutations: Iterable[ContextMutation]) -> None:
        for mutation in mutations:
            key = mutation.input_terms
            self._mutations.setdefault(key, []).append(mutation)

    def get(self, input_terms: Sequence[str]) -> Optional[ContextMutation]:
        key = tuple(input_terms)
        if key not in self._mutations:
            return None
        return self._mutations[key][-1]

    def apply(self, matched_terms: Sequence[str], raw_parts: List[RawRefPart],
              term_factory: Callable[[str], TermContext]) -> List[RawRefPart]:
        """
        Convenience wrapper that looks up the matching ContextMutation for `matched_terms`
        and applies it to the provided raw parts using the given term factory.
        """
        mutation = self.get(matched_terms)
        if mutation is None:
            return raw_parts
        output_contexts = [term_factory(slug) for slug in mutation.output_terms]
        return mutation.apply(raw_parts, output_contexts)

    def __len__(self) -> int:
        return len(self._mutations)

    def debug_view(self) -> Dict[Tuple[str, ...], List[ContextMutation]]:
        """
        Return a shallow copy of the raw mutation mapping for debugging.
        """
        return {key: list(value) for key, value in self._mutations.items()}

    def effective_mutations(self) -> Iterable[Tuple[Tuple[str, ...], ContextMutation]]:
        # Yield (input_terms, mutation) in insertion order, taking the last entry
        # per key so descendant mutations override ancestors.
        for key, stack in self._mutations.items():
            if len(stack) == 0:
                continue
            yield key, stack[-1]

    def __repr__(self) -> str:
        return f"ContextMutationSet({self.debug_view()})"

    def apply_to(self, raw_ref: RawRef, term_matcher: 'TermMatcher') -> None:
        """
        Mutate `raw_ref.parts_to_match` based on the collected mutations.

        Example (from tests):
          raw parts: ["Dummy Title", "Yet Another Dummy Title", "#25", "#4"]
          slug_candidates rows:
             ['dummy-title', 'yet-another-dummy-title', '__EMPTY__', '__EMPTY__']
             ['dummy-title2', ...]
          For mutation input_terms ["dummy-title", "yet-another-dummy-title"], we scan each row of the Cartesian product
          ("cross product") built from the candidate slugs per part. When a row contains every required slug (multiset subset),
          we bind each slug to the first available index (skip disallowed indices for swaps), then apply ADD or SWAP:
             - SWAP replaces the matched indices with the output contexts (e.g., "even-haezer", "shulchan-arukh")
             - ADD inserts new contexts after the last matched index (avoiding duplicates)

        After all applicable mutations have run, `raw_ref.parts_to_match` reflects the mutated parts sequence.
        """
        if len(self) == 0:
            raw_ref.parts_to_match = raw_ref.raw_ref_parts
            return

        term_cache: Dict[str, schema.NonUniqueTerm] = {}

        def term_factory(slug: str) -> TermContext:
            if slug not in term_cache:
                term = schema.NonUniqueTerm.init(slug)
                if term is None:
                    raise ValueError(f"Unknown term slug: {slug}")
                term_cache[slug] = term
            return TermContext(term_cache[slug])

        raw_parts = raw_ref.raw_ref_parts
        slug_candidates: List[List[str]] = []
        for part in raw_parts:
            term_matches = term_matcher.match_term(part)
            candidates = [match.slug for match in term_matches]
            slug_candidates.append(candidates if candidates else ["__EMPTY__"])

        effective_mutations = list(self.effective_mutations())
        if len(effective_mutations) == 0:
            raw_ref.parts_to_match = raw_parts
            return

        swap_inserts: Dict[int, List[RawRefPart]] = {}
        swap_removed_indices: Set[int] = set()
        additions_by_index: Dict[int, List[TermContext]] = defaultdict(list)
        existing_context_slugs: Set[str] = set()

        def _find_matching_indices(input_terms: Tuple[str, ...], disallowed: Set[int]) -> Optional[List[int]]:
            if len(input_terms) == 0:
                return []
            needed = Counter(input_terms)
            for slug_row in product(*slug_candidates):
                if needed - Counter(slug_row):
                    continue
                indices = _find_ordered_subset_indices(slug_row, input_terms, disallowed)
                if indices is not None:
                    return indices
            return None

        for input_terms, mutation in effective_mutations:
            term_tuple = tuple(input_terms)
            disallowed = swap_removed_indices if mutation.op == ContextMutationOp.SWAP else set()
            matched_indices = _find_matching_indices(term_tuple, disallowed)
            if matched_indices is None:
                continue
            matched_parts = [raw_parts[idx] for idx in matched_indices]
            try:
                output_contexts = [term_factory(slug) for slug in mutation.output_terms]
                mutated_parts = mutation.apply(matched_parts, output_contexts)
            except Exception as err:
                logger.warning("ref_resolver.context_mutation.apply_failed", slug_sequence=input_terms, error=str(err))
                continue
            if mutation.op == ContextMutationOp.SWAP:
                swap_inserts[matched_indices[0]] = list(mutated_parts)
                swap_removed_indices.update(matched_indices)
            else:
                anchor_index = matched_indices[-1]
                for new_part in mutated_parts:
                    if isinstance(new_part, TermContext) and new_part.term.slug not in existing_context_slugs:
                        additions_by_index[anchor_index].append(new_part)
                        existing_context_slugs.add(new_part.term.slug)

        parts_to_match: List[RawRefPart] = []
        for index, part in enumerate(raw_parts):
            if index in swap_inserts:
                parts_to_match.extend(swap_inserts[index])
                for inserted_part in swap_inserts[index]:
                    if isinstance(inserted_part, TermContext):
                        existing_context_slugs.add(inserted_part.term.slug)
            if index in swap_removed_indices:
                continue
            parts_to_match.append(part)
            if isinstance(part, TermContext):
                existing_context_slugs.add(part.term.slug)
            if index in additions_by_index:
                parts_to_match.extend(additions_by_index[index])

        raw_ref.parts_to_match = parts_to_match


def _find_ordered_subset_indices(sequence: Sequence[str], targets: Sequence[str],
                                 disallowed_indices: Set[int]) -> Optional[List[int]]:
    """
    Given `sequence` and target slugs, return the earliest set of indices in sequence
    for each term in `targets` such that occurrences are ordered and not in `disallowed_indices`.
    """
    indices: List[int] = []
    last_index = -1
    for target in targets:
        try:
            next_index = sequence.index(target, last_index + 1)
        except ValueError:
            return None
        while next_index in disallowed_indices:
            try:
                next_index = sequence.index(target, next_index + 1)
            except ValueError:
                return None
        indices.append(next_index)
        last_index = next_index
    return indices
