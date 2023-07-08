from abc import ABC, abstractmethod
from itertools import product
from typing import List
from sefaria.model.schema import AddressInteger
from sefaria.model.linker.referenceable_book_node import ReferenceableBookNode, NumberedReferenceableBookNode, NamedReferenceableBookNode, DiburHamatchilNodeSet
from sefaria.model.linker.ref_part import RawRefPart, SectionContext, RefPartType
from sefaria.system.exceptions import InputError
from sefaria.model.text import Ref


def subref(ref: Ref, section: int):
    if ref.index_node.addressTypes[len(ref.sections)-1] == "Talmud":
        d = ref._core_dict()
        d['sections'][-1] += (section-1)
        d['toSections'] = d['sections'][:]
        return Ref(_obj=d)
    else:
        return ref.subref(section)


class ResolvedRefRefiner(ABC):

    def __init__(self, part_to_match: RawRefPart, node: ReferenceableBookNode, resolved_ref: 'ResolvedRef'):
        self.part_to_match = part_to_match
        self.node = node
        self.resolved_ref = resolved_ref

    def _get_resolved_parts(self):
        return self.resolved_ref.resolved_parts + [self.part_to_match]

    def _clone_resolved_ref(self, **kwargs) -> 'ResolvedRef':
        return self.resolved_ref.clone(**kwargs)

    def _has_prev_unused_numbered_ref_part(self) -> bool:
        """
        Helper function to avoid matching AddressInteger sections out of order
        Returns True if there is a RawRefPart which immediately precedes `raw_ref_part` and is not yet included in this match
        """
        prev_part = self.resolved_ref.raw_ref.prev_num_parts_map.get(self.part_to_match, None)
        if prev_part is None: return False
        return prev_part not in set(self.resolved_ref.resolved_parts)

    def _has_prev_unused_numbered_ref_part_for_node(self, lang: str) -> bool:
        """
        For SchemaNodes or ArrayMapNodes that have numeric equivalents (e.g. an alt struct for perek)
        make sure we are not matching AddressIntegers out of order. See self.has_prev_unused_numbered_ref_part()
        """
        if self.part_to_match.type != RefPartType.NUMBERED or \
                not self.node.get_numeric_equivalent() or \
                not self._has_prev_unused_numbered_ref_part():
            return False
        try:
            possible_sections, possible_to_sections, addr_classes = AddressInteger(0).get_all_possible_sections_from_string(lang, self.part_to_match.text, strip_prefixes=True)
            for sec, toSec, addr_class in zip(possible_sections, possible_to_sections, addr_classes):
                if sec != self.node.get_numeric_equivalent(): continue
                if addr_class == AddressInteger: return True
        except KeyError:
            return False

    @abstractmethod
    def refine(self, lang: str, **kwargs) -> List['ResolvedRef']:
        pass


class ResolvedRefRefinerForDefaultNode(ResolvedRefRefiner):

    def refine(self, lang: str, **kwargs) -> List['ResolvedRef']:
        resolved_parts = self.resolved_ref.resolved_parts
        return [self._clone_resolved_ref(resolved_parts=resolved_parts, node=self.node, ref=self.node.ref())]


class ResolvedRefRefinerForNumberedPart(ResolvedRefRefiner):

    def refine(self, lang: str, **kwargs) -> List['ResolvedRef']:
        if isinstance(self.part_to_match, SectionContext):
            return self.__refine_context_full()
        return self.__refine_context_free(lang, **kwargs)

    def __refine_context_full(self) -> List['ResolvedRef']:
        if self.node is None or not self.node.matches_section_context(self.part_to_match):
            return []
        try:
            refined_ref = self.resolved_ref.ref.subref(self.part_to_match.address)
        except (InputError, IndexError, AssertionError, AttributeError):
            return []
        return [self._clone_resolved_ref(resolved_parts=self._get_resolved_parts(), node=self.node, ref=refined_ref)]

    def __refine_context_free(self, lang: str, fromSections=None) -> List['ResolvedRef']:
        if self.node is None:
            return []
        try:
            possible_sections, possible_to_sections, addr_classes = self.node.get_all_possible_sections_from_string(lang, self.part_to_match.text, fromSections, strip_prefixes=True)
        except (IndexError, TypeError, KeyError):
            return []
        refined_refs = []
        addr_classes_used = []
        for sec, toSec, addr_class in zip(possible_sections, possible_to_sections, addr_classes):
            if self._has_prev_unused_numbered_ref_part() and not addr_class.can_match_out_of_order(lang, self.part_to_match.text):
                """
                If raw_ref has NUMBERED parts [a, b]
                and part b matches before part a
                and part b gets matched as AddressInteger
                discard match because AddressInteger parts need to match in order
                """
                continue
            try:
                refined_ref = subref(self.resolved_ref.ref, sec)
                if toSec != sec:
                    to_ref = subref(self.resolved_ref.ref, toSec)
                    refined_ref = refined_ref.to(to_ref)
                refined_refs += [refined_ref]
                addr_classes_used += [addr_class]
            except (InputError, IndexError, AssertionError, AttributeError):
                continue

        return [self._clone_resolved_ref(resolved_parts=self._get_resolved_parts(), node=self.node, ref=refined_ref) for refined_ref in refined_refs]


class ResolvedRefRefinerForRangedPart(ResolvedRefRefiner):

    def __get_refined_matches_for_ranged_sections(self, sections: List['RawRefPart'], node: NumberedReferenceableBookNode, lang, fromSections: list=None):
        resolved_raw_refs: List['ResolvedRef'] = [self._clone_resolved_ref(resolved_parts=self._get_resolved_parts(), node=node)]
        incomplete_resolved_raw_refs = []
        is_first_pass = True
        for section_part in sections:
            queue_len = len(resolved_raw_refs)
            for _ in range(queue_len):
                temp_resolved_raw_ref = resolved_raw_refs.pop(0)
                if not is_first_pass:
                    temp_children = temp_resolved_raw_ref.node.get_children(temp_resolved_raw_ref.ref)
                    temp_resolved_raw_ref.node = None if len(temp_children) == 0 else temp_children[0]
                is_first_pass = False
                temp_resolved_ref_refiner = ResolvedRefRefinerForNumberedPart(section_part, temp_resolved_raw_ref.node, temp_resolved_raw_ref)
                next_resolved_raw_refs = temp_resolved_ref_refiner.refine(lang, fromSections=fromSections)
                resolved_raw_refs += next_resolved_raw_refs
                if len(next_resolved_raw_refs) == 0 and False:
                    # disabling incomplete ranged ref matches to avoid false positives
                    incomplete_resolved_raw_refs += [temp_resolved_raw_ref]
        return resolved_raw_refs, incomplete_resolved_raw_refs

    def refine(self, lang: str, **kwargs) -> List['ResolvedRef']:
        section_resolved_raw_refs, incomplete_section_refs = self.__get_refined_matches_for_ranged_sections(self.part_to_match.sections, self.node, lang)
        toSection_resolved_raw_refs, _ = self.__get_refined_matches_for_ranged_sections(self.part_to_match.toSections, self.node, lang, fromSections=[x.ref.sections for x in section_resolved_raw_refs])
        ranged_resolved_raw_refs = []
        for section, toSection in product(section_resolved_raw_refs, toSection_resolved_raw_refs):
            try:
                ranged_resolved_raw_refs += [self._clone_resolved_ref(resolved_parts=self._get_resolved_parts(), node=section.node, ref=section.ref.to(toSection.ref))]
            except InputError:
                continue
        if len(section_resolved_raw_refs) == 0:
            ranged_resolved_raw_refs += incomplete_section_refs
        return ranged_resolved_raw_refs


class ResolvedRefRefinerForNamedNode(ResolvedRefRefiner):

    def refine(self, lang: str, **kwargs) -> List['ResolvedRef']:
        if self.node.ref_part_title_trie(lang).has_continuations(self.part_to_match.key(), key_is_id=self.part_to_match.key_is_id) \
                and not self._has_prev_unused_numbered_ref_part_for_node(lang):

            return [self._clone_resolved_ref(resolved_parts=self._get_resolved_parts(), node=self.node, ref=self.node.ref())]
        return []


class ResolvedRefRefinerForDiburHamatchilPart(ResolvedRefRefiner):

    def __get_refined_matches_for_dh_part(self, lang, raw_ref_part: RawRefPart, node: DiburHamatchilNodeSet):
        """
        Finds dibur hamatchil ref which best matches `raw_ref_part`
        Currently a simplistic algorithm
        If there is a DH match, return the corresponding 'ResolvedRef'
        """
        if not self.resolved_ref.complies_with_thoroughness_level():
            return []
        best_matches = node.best_fuzzy_matches(lang, raw_ref_part)

        if len(best_matches):
            best_dh = max(best_matches, key=lambda x: x.order_key())
            self.resolved_ref._set_matched_dh(raw_ref_part, best_dh.potential_dh_token_idx)

        return [self._clone_resolved_ref(resolved_parts=self._get_resolved_parts().copy(), node=dh_match.dh_node, ref=Ref(dh_match.dh_node.ref)) for dh_match in best_matches]

    def refine(self, lang: str, **kwargs) -> List['ResolvedRef']:
        node = self.node
        if isinstance(node, NumberedReferenceableBookNode):
            # jagged array node can be skipped entirely if it has a dh child
            # technically doesn't work if there is a referenceable child in between ja and dh node
            node_children = self.node.get_children(self.resolved_ref.ref)
            node = None if len(node_children) == 0 else node_children[0]
        if isinstance(node, DiburHamatchilNodeSet):
            return self.__get_refined_matches_for_dh_part(lang, self.part_to_match, node)
        return []


class ResolvedRefRefinerCatchAll(ResolvedRefRefiner):

    def refine(self, lang: str, **kwargs) -> List['ResolvedRef']:
        return []
