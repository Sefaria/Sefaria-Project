from collections import defaultdict
from typing import List, Union, Dict, Optional, Tuple, Generator, Iterable, Set
from enum import IntEnum, Enum
from functools import reduce
from tqdm import tqdm
from sefaria.system.exceptions import InputError
from sefaria.model import abstract as abst
from sefaria.model import text
from sefaria.model import schema
from sefaria.model.linker.ref_part import RawRef, RawRefPart, SpanOrToken, span_inds, RefPartType, SectionContext, ContextPart, TermContext
from sefaria.model.linker.referenceable_book_node import NamedReferenceableBookNode, ReferenceableBookNode
from sefaria.model.linker.match_template import MatchTemplateTrie, LEAF_TRIE_ENTRY
from sefaria.model.linker.resolved_ref_refiner_factory import resolved_ref_refiner_factory
import structlog
logger = structlog.get_logger(__name__)
try:
    import spacy
    from spacy.tokens import Span, Token, Doc
    from spacy.language import Language
except ImportError:
    spacy = Doc = Span = Token = Language = None


class ContextType(Enum):
    """
    Types of context which can be used to help resolve refs
    """
    CURRENT_BOOK = "CURRENT_BOOK"
    IBID = "IBID"


# maps ContextTypes that will always (I believe) map to certain RefPartTypes
# they don't necessarily need to map to any RefPart but if they do, they will match these types
CONTEXT_TO_REF_PART_TYPE = {
    ContextType.CURRENT_BOOK: {RefPartType.RELATIVE},
    ContextType.IBID: {RefPartType.IBID}
}


class ResolutionThoroughness(IntEnum):
    NORMAL = 1
    HIGH = 2


class ResolvedRef(abst.Cloneable):
    """
    Partial or complete resolution of a RawRef
    """
    is_ambiguous = False

    def __init__(self, raw_ref: RawRef, resolved_parts: List[RawRefPart], node, ref: text.Ref, context_ref: text.Ref = None, context_type: ContextType = None, context_parts: List[ContextPart] = None, _thoroughness=ResolutionThoroughness.NORMAL, _matched_dh_map=None) -> None:
        self.raw_ref = raw_ref
        self.resolved_parts = resolved_parts
        self.node: ReferenceableBookNode = node
        self.ref = ref
        self.context_ref = context_ref
        self.context_type = context_type
        self.context_parts = context_parts[:] if context_parts else []
        self._thoroughness = _thoroughness
        self._matched_dh_map = _matched_dh_map or {}

    def complies_with_thoroughness_level(self):
        return self._thoroughness >= ResolutionThoroughness.HIGH or not self.ref.is_book_level()

    @property
    def pretty_text(self) -> str:
        """
        Return text of underlying RawRef with modifications to make it nicer
        Currently
        - adds ending parentheses if just outside span
        - adds extra DH words that were matched but aren't in span
        @return:
        """
        new_raw_ref_span = self._get_pretty_dh_span(self.raw_ref.span)
        new_raw_ref_span = self._get_pretty_end_paren_span(new_raw_ref_span)
        return new_raw_ref_span.text

    def _get_pretty_dh_span(self, curr_span) -> SpanOrToken:
        curr_start, curr_end = span_inds(curr_span)
        for dh_span in self._matched_dh_map.values():
            temp_start, temp_end = span_inds(dh_span)
            curr_start = temp_start if temp_start < curr_start else curr_start
            curr_end = temp_end if temp_end > curr_end else curr_end

        return curr_span.doc[curr_start:curr_end]

    def _get_pretty_end_paren_span(self, curr_span) -> SpanOrToken:
        import re

        curr_start, curr_end = span_inds(curr_span)
        if re.search(r'\([^)]+$', curr_span.text) is not None:
            for temp_end in range(curr_end, curr_end+2):
                if ")" not in curr_span.doc[temp_end].text: continue
                curr_end = temp_end + 1
                break

        return curr_span.doc[curr_start:curr_end]

    def _set_matched_dh(self, part: RawRefPart, potential_dh_token_idx: int):
        if part.potential_dh_continuation is None: return
        matched_dh_continuation = part.potential_dh_continuation[:potential_dh_token_idx]
        self._matched_dh_map[part] = matched_dh_continuation

    def merge_parts(self, other: 'ResolvedRef') -> None:
        for part in other.resolved_parts:
            if part in self.resolved_parts: continue
            if part.is_context:
                # prepend context parts, so they pass validation that context parts need to precede non-context parts
                self.resolved_parts = [part] + self.resolved_parts
            else:
                self.resolved_parts += [part]

    def get_resolved_parts(self, include: Iterable[type] = None, exclude: Iterable[type] = None) -> List[RawRefPart]:
        """
        Returns list of resolved_parts according to criteria `include` and `exclude`
        If neither `include` nor `exclude` is passed, return all parts in `self.resolved_parts`
        :param include: if not None, only include parts that are an instance of at least one class specified in `include`
        :param exclude: if not None, exclude parts that are an instance of at least one class specified in `exclude`
        """
        parts = []
        for part in self.resolved_parts:
            if include is not None and not any(isinstance(part, typ) for typ in include):
                continue
            if exclude is not None and any(isinstance(part, typ) for typ in exclude):
                continue
            parts += [part]
        return parts

    def num_resolved(self, include: Iterable[type] = None, exclude: Iterable[type] = None) -> int:
        return len(self.get_resolved_parts(include, exclude))

    @staticmethod
    def count_by_part_type(parts) -> Dict[RefPartType, int]:
        part_type_counts = defaultdict(int)
        for part in parts:
            part_type_counts[part.type] += 1
        return part_type_counts

    def get_node_children(self):
        return self.node.get_children(self.ref)

    @property
    def order_key(self):
        """
        For sorting
        """
        explicit_matched = self.get_resolved_parts(exclude={ContextPart})
        num_context_parts_matched = 0
        # theory is more context is helpful specifically for DH matches because if DH still matches with more context,
        # it's more likely to be correct (as opposed to with numbered sections, it's relatively easy to add more context
        # and doesn't give more confidence that it's correct
        if next(iter(part for part in explicit_matched if part.type == RefPartType.DH), False):
            num_context_parts_matched = self.num_resolved(include={ContextPart})
        return len(explicit_matched), num_context_parts_matched


class AmbiguousResolvedRef:
    """
    Container for multiple ambiguous ResolvedRefs
    """
    is_ambiguous = True

    def __init__(self, resolved_refs: List[ResolvedRef]):
        if len(resolved_refs) == 0:
            raise InputError("Length of `resolved_refs` must be at least 1")
        self.resolved_raw_refs = resolved_refs
        self.raw_ref = resolved_refs[0].raw_ref  # assumption is all resolved_refs share same raw_ref. expose at top level

    @property
    def pretty_text(self):
        # assumption is first resolved refs pretty_text is good enough
        return self.resolved_raw_refs[0].pretty_text


class TermMatcher:
    """
    Used to match raw ref parts to non-unique terms naively.
    Stores all existing terms for speed.
    Used in context matching.
    """
    def __init__(self, lang: str, nonunique_terms: schema.NonUniqueTermSet) -> None:
        self.lang = lang
        self._str2term_map = defaultdict(list)
        for term in nonunique_terms:
            for title in term.get_titles(lang):
                self._str2term_map[title] += [term]

    def match_term(self, ref_part: RawRefPart) -> List[schema.NonUniqueTerm]:
        from sefaria.utils.hebrew import get_prefixless_inds

        matches = []
        if ref_part.type != RefPartType.NAMED: return matches
        starti_inds = [0]
        if self.lang == 'he':
            starti_inds += get_prefixless_inds(ref_part.text)
        for starti in starti_inds:
            matches += self._str2term_map.get(ref_part.text[starti:], [])
        return matches

    def match_terms(self, ref_parts: List[RawRefPart]) -> List[schema.NonUniqueTerm]:
        matches = []
        for part in ref_parts:
            matches += self.match_term(part)
        matches = list({m.slug: m for m in matches}.values())  # unique
        return matches


class IbidHistory:

    def __init__(self, last_n_titles: int = 3, last_n_refs: int = 3):
        self.last_n_titles = last_n_titles
        self.last_n_refs = last_n_refs
        self._last_refs: List[text.Ref] = []
        self._last_titles: List[str] = []
        self._title_ref_map: Dict[str, text.Ref] = {}

    def _get_last_refs(self) -> List[text.Ref]:
        return self._last_refs

    def _set_last_match(self, oref: text.Ref):
        self._last_refs += [oref]
        title = oref.index.title
        if title not in self._title_ref_map:
            self._last_titles += [title]
        self._title_ref_map[oref.index.title] = oref

        # enforce last_n_titles
        if len(self._last_titles) > self.last_n_titles:
            oldest_title = self._last_titles.pop(0)
            del self._title_ref_map[oldest_title]

        # enforce last_n_refs
        if len(self._last_refs) > self.last_n_refs:
            self._last_refs.pop(0)

    last_refs = property(_get_last_refs, _set_last_match)

    def get_ref_by_title(self, title: str) -> Optional[text.Ref]:
        return self._title_ref_map.get(title, None)


class RefResolver:

    def __init__(self, raw_ref_model_by_lang: Dict[str, Language], raw_ref_part_model_by_lang: Dict[str, Language],
                 ref_part_title_trie_by_lang: Dict[str, MatchTemplateTrie],
                 term_matcher_by_lang: Dict[str, TermMatcher]) -> None:
        from sefaria.helper.normalization import NormalizerByLang, NormalizerComposer

        self._raw_ref_model_by_lang = raw_ref_model_by_lang
        self._raw_ref_part_model_by_lang = raw_ref_part_model_by_lang
        self._ref_part_title_trie_by_lang = ref_part_title_trie_by_lang
        self._term_matcher_by_lang = term_matcher_by_lang
        self._ibid_history = IbidHistory()
        self._thoroughness = ResolutionThoroughness.NORMAL

        # see ML Repo library_exporter.py:TextWalker.__init__() which uses same normalization
        # important that normalization is equivalent to normalization done at training time
        base_normalizer_steps = ['unidecode', 'html', 'double-space']
        self._normalizer = NormalizerByLang({
            'en': NormalizerComposer(base_normalizer_steps),
            'he': NormalizerComposer(base_normalizer_steps + ['maqaf', 'cantillation']),
        })

    def reset_ibid_history(self):
        self._ibid_history = IbidHistory()

    def _normalize_input(self, lang: str, input: List[str]):
        """
        Normalize input text to match normalization that happened at training time
        """
        return [self._normalizer.normalize(s, lang=lang) for s in input]

    def _map_normal_output_to_original_input(self, lang: str, input: List[str], resolved: List[List[Union[ResolvedRef, AmbiguousResolvedRef]]]) -> None:
        """
        Ref resolution ran on normalized input. Remap resolved refs to original (non-normalized) input
        """
        for temp_input, temp_resolved in zip(input, resolved):
            unnorm_doc = self.get_raw_ref_model(lang).make_doc(temp_input)
            mapping = self._normalizer.get_mapping_after_normalization(temp_input, lang=lang)
            conv = self._normalizer.convert_normalized_indices_to_unnormalized_indices  # this function name is waaay too long
            norm_inds = [rr.raw_ref.char_indices for rr in temp_resolved]
            unnorm_inds = conv(norm_inds, mapping)
            unnorm_part_inds = []
            for (rr, (norm_raw_ref_start, _)) in zip(temp_resolved, norm_inds):
                unnorm_part_inds += [conv([[norm_raw_ref_start + i for i in part.char_indices] for part in rr.raw_ref.raw_ref_parts], mapping)]
            for resolved_ref, temp_unnorm_inds, temp_unnorm_part_inds in zip(temp_resolved, unnorm_inds, unnorm_part_inds):
                resolved_ref.raw_ref.map_new_indices(unnorm_doc, temp_unnorm_inds, temp_unnorm_part_inds)

    def bulk_resolve_refs(self, lang: str, book_context_refs: List[Optional[text.Ref]], input: List[str], with_failures=False, verbose=False, reset_ibids_every_context_ref=True, thoroughness=ResolutionThoroughness.NORMAL) -> List[List[Union[ResolvedRef, AmbiguousResolvedRef]]]:
        """
        Main function for resolving refs in text. Given a list of texts, returns ResolvedRefs for each
        @param lang:
        @param book_context_refs:
        @param input:
        @param with_failures:
        @param verbose:
        @param reset_ibids_every_context_ref:
        @param thoroughness: how thorough should the search be. More thorough == slower. Currently "normal" will avoid searching for DH matches at book level and avoid filtering empty refs
        @return:
        """
        self._thoroughness = thoroughness
        self.reset_ibid_history()
        normalized_input = self._normalize_input(lang, input)
        all_raw_refs = self._bulk_get_raw_refs(lang, normalized_input)
        resolved = []
        iter = zip(book_context_refs, all_raw_refs)
        if verbose:
            iter = tqdm(iter, total=len(book_context_refs))
        for book_context_ref, raw_refs in iter:
            if reset_ibids_every_context_ref:
                self.reset_ibid_history()
            inner_resolved = []
            for raw_ref in raw_refs:
                temp_resolved = self.resolve_raw_ref(lang, book_context_ref, raw_ref)
                if len(temp_resolved) == 0:
                    self.reset_ibid_history()
                    if with_failures:
                        inner_resolved += [ResolvedRef(raw_ref, [], None, None, context_ref=book_context_ref)]
                elif any(r.is_ambiguous for r in temp_resolved):
                    # can't be sure about future ibid inferences
                    # TODO can probably salvage parts of history if matches are ambiguous within one book
                    self.reset_ibid_history()
                else:
                    self._ibid_history.last_refs = temp_resolved[-1].ref
                inner_resolved += temp_resolved
            resolved += [inner_resolved]
        self._map_normal_output_to_original_input(lang, input, resolved)
        return resolved

    def _bulk_get_raw_refs(self, lang: str, input: List[str]) -> List[List[RawRef]]:
        all_raw_ref_spans = list(self._bulk_get_raw_ref_spans(lang, input))
        ref_part_input = reduce(lambda a, b: a + [(sub_b.text, b[0]) for sub_b in b[1]], enumerate(all_raw_ref_spans), [])
        all_raw_ref_part_spans = list(self._bulk_get_raw_ref_part_spans(lang, ref_part_input, as_tuples=True))
        all_raw_ref_part_span_map = defaultdict(list)
        for ref_part_span, input_idx in all_raw_ref_part_spans:
            all_raw_ref_part_span_map[input_idx] += [ref_part_span]

        all_raw_refs = []
        for input_idx, raw_ref_spans in enumerate(all_raw_ref_spans):
            raw_ref_part_spans = all_raw_ref_part_span_map[input_idx]
            raw_refs = []
            for ispan, (span, part_span_list) in enumerate(zip(raw_ref_spans, raw_ref_part_spans)):
                raw_ref_parts = []
                for ipart, part_span in enumerate(part_span_list):
                    part_type = RefPartType.span_label_to_enum(part_span.label_)
                    dh_continuation = None
                    if part_type == RefPartType.DH:
                        dh_continuation = self._get_dh_continuation(ispan, ipart, raw_ref_spans, part_span_list, span, part_span)
                    raw_ref_parts += [RawRefPart(part_type, part_span, dh_continuation)]
                raw_refs += [RawRef(lang, raw_ref_parts, span)]
            all_raw_refs += [raw_refs]
        return all_raw_refs
    
    @staticmethod
    def _get_dh_continuation(ispan: int, ipart: int, raw_ref_spans: List[SpanOrToken], part_span_list: List[SpanOrToken], span: SpanOrToken, part_span: SpanOrToken) -> Optional[SpanOrToken]:
        if ipart == len(part_span_list) - 1:
            curr_doc = span.doc
            _, span_end = span_inds(span)
            if ispan == len(raw_ref_spans) - 1:
                dh_cont = curr_doc[span_end:]
            else:
                next_span_start, _ = span_inds(raw_ref_spans[ispan + 1])
                dh_cont = curr_doc[span_end:next_span_start]
        else:
            _, part_span_end = span_inds(part_span)
            next_part_span_start, _ = span_inds(part_span_list[ipart + 1])
            dh_cont = part_span.doc[part_span_end:next_part_span_start]

        return dh_cont

    def __get_attr_by_lang(self, lang: str, by_lang_attr: dict, error_msg: str):
        try:
            return by_lang_attr[lang]
        except KeyError as e:
            raise KeyError(f"{error_msg} for lang `{lang}`")

    def get_raw_ref_model(self, lang: str) -> Language:
        return self.__get_attr_by_lang(lang, self._raw_ref_model_by_lang, 'No Raw Ref Model')

    def get_raw_ref_part_model(self, lang: str) -> Language:
        return self.__get_attr_by_lang(lang, self._raw_ref_part_model_by_lang, 'No Raw Ref Model')

    def get_ref_part_title_trie(self, lang: str) -> MatchTemplateTrie:
        return self.__get_attr_by_lang(lang, self._ref_part_title_trie_by_lang, 'No Raw Ref Part Title Trie')

    def get_term_matcher(self, lang: str) -> TermMatcher:
        return self.__get_attr_by_lang(lang, self._term_matcher_by_lang, 'No Term Matcher')

    def _get_raw_ref_spans_in_string(self, lang: str, st: str) -> List[Span]:
        doc = self.get_raw_ref_model(lang)(st)
        return doc.ents

    def _bulk_get_raw_ref_spans(self, lang: str, input: List[str], batch_size=150, **kwargs) -> Generator[List[Span], None, None]:
        for doc in self.get_raw_ref_model(lang).pipe(input, batch_size=batch_size, **kwargs):
            if kwargs.get('as_tuples', False):
                doc, context = doc
                yield doc.ents, context
            else:
                yield doc.ents

    def _get_raw_ref_part_spans_in_string(self, lang: str, st: str) -> List[Span]:
        doc = self.get_raw_ref_part_model(lang)(st)
        return doc.ents

    def _bulk_get_raw_ref_part_spans(self, lang: str, input: List[str], batch_size=None, **kwargs) -> Generator[List[Span], None, None]:
        for doc in self.get_raw_ref_part_model(lang).pipe(input, batch_size=batch_size or len(input), **kwargs):
            if kwargs.get('as_tuples', False):
                doc, context = doc
                yield doc.ents, context
            else:
                yield doc.ents

    @staticmethod
    def split_non_cts_parts(lang, raw_ref: RawRef) -> List[RawRef]:
        if not any(part.type == RefPartType.NON_CTS for part in raw_ref.raw_ref_parts): return [raw_ref]
        split_raw_refs = []
        curr_parts = []
        curr_part_start = 0
        for ipart, part in enumerate(raw_ref.raw_ref_parts):
            if part.type != RefPartType.NON_CTS:
                curr_parts += [part]
            if part.type == RefPartType.NON_CTS or ipart == len(raw_ref.raw_ref_parts) - 1:
                if len(curr_parts) == 0: continue
                curr_part_end = ipart  # exclude curr part which is NON_CTS
                if ipart == len(raw_ref.raw_ref_parts) - 1: curr_part_end = ipart + 1  # include curr part
                try:
                    raw_ref_span = raw_ref.subspan(slice(curr_part_start, curr_part_end))
                    curr_parts = [p.realign_to_new_raw_ref(raw_ref.span, raw_ref_span) for p in curr_parts]
                    split_raw_refs += [RawRef(lang, curr_parts, raw_ref_span)]
                except AssertionError:
                    pass
                curr_parts = []
                curr_part_start = ipart+1
        return split_raw_refs

    def set_thoroughness(self, thoroughness: ResolutionThoroughness) -> None:
        self._thoroughness = thoroughness

    def resolve_raw_ref(self, lang: str, book_context_ref: Optional[text.Ref], raw_ref: RawRef) -> List[Union[ResolvedRef, AmbiguousResolvedRef]]:
        split_raw_refs = self.split_non_cts_parts(lang, raw_ref)
        resolved_list = []
        for i, temp_raw_ref in enumerate(split_raw_refs):
            is_non_cts = i > 0 and len(resolved_list) > 0
            if is_non_cts:
                # TODO assumes context is only first resolved ref
                book_context_ref = resolved_list[0].ref
            context_swap_map = None if book_context_ref is None else getattr(book_context_ref.index.nodes,
                                                                        'ref_resolver_context_swaps', None)
            self._apply_context_swaps(lang, raw_ref, context_swap_map)
            unrefined_matches = self.get_unrefined_ref_part_matches(lang, book_context_ref, temp_raw_ref)
            if is_non_cts:
                # filter unrefined matches to matches that resolved previously
                resolved_titles = {r.ref.index.title for r in resolved_list}
                unrefined_matches = list(filter(lambda x: x.ref.index.title in resolved_titles, unrefined_matches))
                # resolution will start at context_ref.sections - len(ref parts). rough heuristic
                for match in unrefined_matches:
                    try:
                        match.ref = match.ref.subref(book_context_ref.sections[:-len(temp_raw_ref.raw_ref_parts)])
                    except (InputError, AttributeError):
                        continue
            temp_resolved_list = self.refine_ref_part_matches(lang, book_context_ref, unrefined_matches)
            if len(temp_resolved_list) > 1:
                resolved_list += [AmbiguousResolvedRef(temp_resolved_list)]
            else:
                resolved_list += temp_resolved_list

        if len(resolved_list) == 0:
            resolved_list += self.resolve_raw_ref_using_ref_instantiation(raw_ref)

        return resolved_list

    @staticmethod
    def resolve_raw_ref_using_ref_instantiation(raw_ref: RawRef) -> List[ResolvedRef]:
        try:
            ref = text.Ref(raw_ref.text)
            return [ResolvedRef(raw_ref, raw_ref.parts_to_match, None, ref)]
        except:
            return []

    def get_unrefined_ref_part_matches(self, lang: str, book_context_ref: Optional[text.Ref], raw_ref: RawRef) -> List[
            'ResolvedRef']:
        context_free_matches = self._get_unrefined_ref_part_matches_recursive(lang, raw_ref, ref_parts=raw_ref.parts_to_match)
        contexts = [(book_context_ref, ContextType.CURRENT_BOOK)] + [(ibid_ref, ContextType.IBID) for ibid_ref in self._ibid_history.last_refs]
        matches = context_free_matches
        if len(matches) == 0:
            context_full_matches = []
            for context_ref, context_type in contexts:
                context_full_matches += self._get_unrefined_ref_part_matches_for_title_context(lang, context_ref, raw_ref, context_type)
            matches = context_full_matches + context_free_matches
        return matches

    def _get_unrefined_ref_part_matches_for_title_context(self, lang: str, context_ref: Optional[text.Ref], raw_ref: RawRef, context_type: ContextType) -> List[ResolvedRef]:
        matches = []
        if context_ref is None: return matches
        term_contexts = self._get_term_contexts(context_ref.index.nodes)
        if len(term_contexts) == 0: return matches
        temp_ref_parts = raw_ref.parts_to_match + term_contexts
        temp_matches = self._get_unrefined_ref_part_matches_recursive(lang, raw_ref, ref_parts=temp_ref_parts)
        for match in temp_matches:
            if match.num_resolved(include={TermContext}) == 0: continue
            match.context_ref = context_ref
            match.context_type = context_type
            match.context_parts += term_contexts
            matches += [match]
        return matches

    def _apply_context_swaps(self, lang: str, raw_ref: RawRef, context_swap_map: Dict[str, str]=None):
        """
        Use `context_swap_map` to swap matching element of `ref_parts`
        Allows us to redefine how a ref part is interpreted depending on the context
        E.g. some rishonim refer to other rishonim based on nicknames

        Modifies `raw_ref` with updated ref_parts
        """
        swapped_ref_parts = []
        term_matcher = self.get_term_matcher(lang)
        if context_swap_map is None: return
        for part in raw_ref.raw_ref_parts:
            # TODO assumes only one match in term_matches
            term_matches = term_matcher.match_term(part)
            found_match = False
            for match in term_matches:
                if match.slug not in context_swap_map: continue
                swapped_ref_parts += [TermContext(schema.NonUniqueTerm.init(slug)) for slug in context_swap_map[match.slug]]
                found_match = True
                break
            if not found_match: swapped_ref_parts += [part]
        raw_ref.parts_to_match = swapped_ref_parts

    def _get_unrefined_ref_part_matches_recursive(self, lang: str, raw_ref: RawRef, title_trie: MatchTemplateTrie = None, ref_parts: list = None, prev_ref_parts: list = None) -> List[ResolvedRef]:
        title_trie = title_trie or self.get_ref_part_title_trie(lang)
        prev_ref_parts = prev_ref_parts or []
        matches = []
        for part in ref_parts:
            temp_raw_ref = raw_ref
            # no need to consider other types at root level
            if part.type != RefPartType.NAMED: continue

            temp_title_trie, partial_key_end = title_trie.get_continuations(part.key(), allow_partial=True)
            if temp_title_trie is None: continue
            if partial_key_end is None:
                matched_part = part
            else:
                try:
                    temp_raw_ref, apart, bpart = raw_ref.split_part(part, partial_key_end)
                    matched_part = apart
                except InputError:
                    matched_part = part  # fallback on original part
            temp_prev_ref_parts = prev_ref_parts + [matched_part]
            if LEAF_TRIE_ENTRY in temp_title_trie:
                for node in temp_title_trie[LEAF_TRIE_ENTRY]:
                    try:
                        ref = node.ref()
                    except InputError:
                        continue
                    matches += [ResolvedRef(temp_raw_ref, temp_prev_ref_parts, node, ref, _thoroughness=self._thoroughness)]
            temp_ref_parts = [temp_part for temp_part in ref_parts if temp_part != part]
            matches += self._get_unrefined_ref_part_matches_recursive(lang, temp_raw_ref, temp_title_trie, ref_parts=temp_ref_parts, prev_ref_parts=temp_prev_ref_parts)

        return ResolvedRefPruner.prune_unrefined_ref_part_matches(matches)

    def refine_ref_part_matches(self, lang: str, book_context_ref: Optional[text.Ref], matches: List[ResolvedRef]) -> List[ResolvedRef]:
        temp_matches = []
        refs_matched = {match.ref.normal() for match in matches}
        for unrefined_match in matches:
            unused_parts = list(set(unrefined_match.raw_ref.parts_to_match) - set(unrefined_match.resolved_parts))
            context_free_matches = self._get_refined_ref_part_matches_recursive(lang, unrefined_match, unused_parts)

            # context
            # if unrefined_match already used context, make sure it continues to use it
            # otherwise, consider other possible context
            context_ref_list = [book_context_ref, self._ibid_history.get_ref_by_title(unrefined_match.ref.index.title)] if unrefined_match.context_ref is None else [unrefined_match.context_ref]
            context_type_list = [ContextType.CURRENT_BOOK, ContextType.IBID] if unrefined_match.context_ref is None else [unrefined_match.context_type]
            context_full_matches = []
            for context_ref, context_type in zip(context_ref_list, context_type_list):
                context_full_matches += self._get_refined_ref_part_matches_for_section_context(lang, context_ref, context_type, unrefined_match, unused_parts)

            # combine
            if len(context_full_matches) > 0:
                context_free_matches = list(filter(lambda x: x.ref.normal() not in refs_matched, context_free_matches))
            temp_matches += context_free_matches + context_full_matches
        return ResolvedRefPruner.prune_refined_ref_part_matches(self._thoroughness, temp_matches)

    @staticmethod
    def _get_section_contexts(context_ref: text.Ref, match_index: text.Index, common_index: text.Index) -> List[SectionContext]:
        """
        Currently doesn't work if any of the indexes are complex texts
        Returns list section contexts extracted from `context_node`
        :param context_ref: context ref where we are searching
        :param match_index: Index of current match we are trying to refine
        :param common_index: Index
        """
        def get_section_set(index: text.Index) -> Set[Tuple[str, str, bool]]:
            root_node = index.nodes.get_default_child() or index.nodes
            try:
                referenceable_sections = getattr(root_node, 'referenceableSections', [True] * len(root_node.addressTypes))
                return set(zip(root_node.addressTypes, root_node.sectionNames, referenceable_sections))
            except AttributeError:
                # complex text
                return set()

        if context_ref.is_range():
            # SectionContext doesn't seem to make sense for ranged refs (It works incidentally when context is parsha
            # and input is "See beginning of parsha pasuk 1" but not sure we want to plan for that case)
            return []

        context_node = context_ref.index_node
        referenceable_sections = getattr(context_node, 'referenceableSections', [True]*len(context_node.addressTypes))
        context_sec_list = list(zip(context_node.addressTypes, context_node.sectionNames, referenceable_sections))
        match_sec_set  = get_section_set(match_index)
        common_sec_set = get_section_set(common_index) & match_sec_set & set(context_sec_list)
        if len(common_sec_set) == 0: return []
        sec_contexts = []
        for isec, sec_tuple in enumerate(context_sec_list):
            if sec_tuple in common_sec_set and isec < len(context_ref.sections):
                addr_type_str, sec_name, referenceable = sec_tuple
                if not referenceable: continue
                addr_type = schema.AddressType.to_class_by_address_type(addr_type_str)
                sec_contexts += [SectionContext(addr_type, sec_name, context_ref.sections[isec])]
        return sec_contexts

    @staticmethod
    def _get_all_term_contexts(node: schema.SchemaNode, include_root=False) -> List[TermContext]:
        """
        Return all TermContexts extracted from `node` and all parent nodes until root
        @param node:
        @return:
        """
        term_contexts = []
        curr_node = node
        while curr_node is not None and (include_root or not curr_node.is_root()):
            term_contexts += RefResolver._get_term_contexts(curr_node)
            curr_node = curr_node.parent
        return term_contexts

    @staticmethod
    def _get_term_contexts(node: schema.SchemaNode) -> List[TermContext]:
        match_templates = list(node.get_match_templates())
        if len(match_templates) == 0: return []
        # not clear which match_template to choose. shortest has advantage of adding minimum context to search
        longest_template = min(match_templates, key=lambda x: len(list(x.terms)))
        return [TermContext(term) for term in longest_template.terms]

    @staticmethod
    def _get_refined_ref_part_matches_for_section_context(lang: str, context_ref: Optional[text.Ref], context_type: ContextType, ref_part_match: ResolvedRef, ref_parts: List[RawRefPart]) -> List[ResolvedRef]:
        """
        Tries to infer sections from context ref and uses them to refine `ref_part_match`
        """
        if context_ref is None: return []
        context_titles = set(getattr(context_ref.index, 'base_text_titles', [])) | {context_ref.index.title}
        match_titles = set(getattr(ref_part_match.ref.index, 'base_text_titles', [])) | {ref_part_match.ref.index.title}
        matches = []
        for common_base_text in (context_titles & match_titles):
            common_index = text.library.get_index(common_base_text)
            sec_contexts = RefResolver._get_section_contexts(context_ref, ref_part_match.ref.index, common_index)
            term_contexts = RefResolver._get_all_term_contexts(context_ref.index_node, include_root=False)
            context_to_consider = sec_contexts + term_contexts
            temp_matches = RefResolver._get_refined_ref_part_matches_recursive(lang, ref_part_match, ref_parts + context_to_consider)

            # remove matches which don't use context
            temp_matches = list(filter(lambda x: len(set(x.get_resolved_parts(include={ContextPart})) & set(context_to_consider)) > 0, temp_matches))
            for match in temp_matches:
                match.context_ref = context_ref
                match.context_type = context_type
                match.context_parts += sec_contexts + term_contexts

            matches += temp_matches
        return matches

    @staticmethod
    def _get_refined_ref_part_matches_recursive(lang: str, match: ResolvedRef, ref_parts: List[RawRefPart]) -> List[ResolvedRef]:
        fully_refined = []
        children = match.get_node_children()
        for part in ref_parts:
            for child in children:
                resolved_ref_refiner = resolved_ref_refiner_factory.create(part, child, match)
                temp_matches = resolved_ref_refiner.refine(lang)
                for temp_match in temp_matches:
                    temp_ref_parts = list(set(ref_parts) - set(temp_match.resolved_parts))
                    fully_refined += RefResolver._get_refined_ref_part_matches_recursive(lang, temp_match, temp_ref_parts)
        if len(fully_refined) == 0:
            # original match is better than no matches
            return [match]
        return fully_refined


class ResolvedRefPruner:

    def __init__(self):
        pass

    @staticmethod
    def prune_unrefined_ref_part_matches(ref_part_matches: List[ResolvedRef]) -> List[ResolvedRef]:
        index_match_map = defaultdict(list)
        for match in ref_part_matches:
            key = match.node.ref().normal()
            index_match_map[key] += [match]
        pruned_matches = []
        for match_list in index_match_map.values():
            pruned_matches += [max(match_list, key=lambda m: m.num_resolved())]
        return pruned_matches

    @staticmethod
    def do_explicit_sections_match_before_context_sections(match: ResolvedRef) -> bool:
        first_explicit_section = None
        for part in match.get_resolved_parts():
            if not first_explicit_section and part.type == RefPartType.NUMBERED and not part.is_context:
                first_explicit_section = part
            elif first_explicit_section and part.is_context:
                return True
        return False

    @staticmethod
    def matched_all_explicit_sections(match: ResolvedRef) -> bool:
        resolved_explicit = set(match.get_resolved_parts(exclude={ContextPart}))
        to_match_explicit = {part for part in match.raw_ref.parts_to_match if not part.is_context}

        if match.context_type in CONTEXT_TO_REF_PART_TYPE.keys():
            # remove an equivalent number of context parts that were resolved from to_match_explicit to approximate
            # comparison. this is a bit hacky but seems to work for all known cases so far.
            num_parts_to_remove = match.num_resolved(include={ContextPart})
            for _ in range(num_parts_to_remove):
                part = next((p for p in to_match_explicit if p.type in CONTEXT_TO_REF_PART_TYPE[match.context_type]), None)
                if part is None:
                    break  # no more
                to_match_explicit.remove(part)
        return resolved_explicit == to_match_explicit

    @staticmethod
    def ignored_context_ref_part_type(match: ResolvedRef) -> bool:
        """
        When using context, must include at least same number of ref part types in match as were in context
        Logic being, don't drop a section without replacing it with something equivalent
        Prevents errors like the following:

        Input = [DH]
        Context = [Title] [Section]
        Correct Output = [Title] [Section] [DH]
        Invalid Output = [Title] [DH]

        context_ref_part_type_counts = {NAMED: 1, NUMBERED: 1}
        output_counts = {NAMED: 1, NUMBERED: 1, DH: 1}
        invalid_output_counts = {NAMED: 1, DH: 1}
        """
        context_part_type_counts = match.count_by_part_type(match.context_parts)
        explicit_part_type_counts = match.count_by_part_type(match.get_resolved_parts())
        for part_type, count in context_part_type_counts.items():
            if part_type not in explicit_part_type_counts:
                return True
            explicit_part_type_counts[part_type] -= count
            if explicit_part_type_counts[part_type] < 0:
                return True
        return False

    @staticmethod
    def is_match_correct(match: ResolvedRef) -> bool:
        # make sure no explicit sections matched before context sections
        if ResolvedRefPruner.do_explicit_sections_match_before_context_sections(match):
            return False
        if not ResolvedRefPruner.matched_all_explicit_sections(match):
            return False
        if ResolvedRefPruner.ignored_context_ref_part_type(match):
            return False

        return True

    @staticmethod
    def remove_superfluous_matches(thoroughness: ResolutionThoroughness, resolved_refs: List[ResolvedRef]) -> List[ResolvedRef]:
        # make unique
        resolved_refs = list({r.ref: r for r in resolved_refs}.values())
        if thoroughness >= ResolutionThoroughness.HIGH or len(resolved_refs) > 1:
            # remove matches that have empty refs
            resolved_refs = list(filter(lambda x: not x.ref.is_empty(), resolved_refs))
        return resolved_refs

    @staticmethod
    def remove_incorrect_matches(resolved_refs: List[ResolvedRef]) -> List[ResolvedRef]:
        temp_resolved_refs = list(filter(ResolvedRefPruner.is_match_correct, resolved_refs))
        if len(temp_resolved_refs) == 0:
            temp_resolved_refs = ResolvedRefPruner._merge_subset_matches(resolved_refs)
            temp_resolved_refs = list(filter(ResolvedRefPruner.is_match_correct, temp_resolved_refs))
        return temp_resolved_refs

    @staticmethod
    def get_context_free_matches(resolved_refs: List[ResolvedRef]) -> List[ResolvedRef]:
        def match_is_context_free(match: ResolvedRef) -> bool:
            return match.context_ref is None and set(match.get_resolved_parts()) == set(match.raw_ref.parts_to_match)
        return list(filter(match_is_context_free, resolved_refs))

    @staticmethod
    def get_top_matches_by_order_key(resolved_refs: List[ResolvedRef]) -> List[ResolvedRef]:
        resolved_refs.sort(key=lambda x: x.order_key, reverse=True)
        top_order_key = resolved_refs[0].order_key
        top_resolved_refs = []
        for resolved_ref in resolved_refs:
            if resolved_ref.order_key != top_order_key: break
            top_resolved_refs += [resolved_ref]
        return top_resolved_refs

    @staticmethod
    def prune_refined_ref_part_matches(thoroughness, resolved_refs: List[ResolvedRef]) -> List[ResolvedRef]:
        """
        Applies some heuristics to remove false positives
        """
        resolved_refs = ResolvedRefPruner.remove_incorrect_matches(resolved_refs)
        if len(resolved_refs) == 0:
            return resolved_refs

        # if any context-free match uses all input parts, dont need to try context
        context_free_matches = ResolvedRefPruner.get_context_free_matches(resolved_refs)
        if len(context_free_matches) > 0:
            resolved_refs = context_free_matches

        resolved_refs = ResolvedRefPruner.get_top_matches_by_order_key(resolved_refs)
        resolved_refs = ResolvedRefPruner.remove_superfluous_matches(thoroughness, resolved_refs)

        return resolved_refs

    @staticmethod
    def _merge_subset_matches(resolved_refs: List[ResolvedRef]) -> List[ResolvedRef]:
        """
        Merge matches where one ref is contained in another ref
        E.g. if matchA.ref == Ref("Genesis 1") and matchB.ref == Ref("Genesis 1:1"), matchA will be deleted and its parts will be appended to matchB's parts
        """
        resolved_refs.sort(key=lambda x: x.ref and x.ref.order_id())
        merged_resolved_refs = []
        next_merged = False
        for imatch, match in enumerate(resolved_refs[:-1]):
            if match.is_ambiguous or match.ref is None or next_merged:
                merged_resolved_refs += [match]
                next_merged = False
                continue
            next_match = resolved_refs[imatch+1]
            if match.ref.index.title != next_match.ref.index.title:
                # optimization, the easiest cases to check for
                merged_resolved_refs += [match]
            elif match.ref.contains(next_match.ref):
                next_match.merge_parts(match)
            elif next_match.ref.contains(match.ref):
                # unfortunately Ref.order_id() doesn't consistently put larger refs before smaller ones
                # e.g. Tosafot on Berakhot 2 precedes Tosafot on Berakhot Chapter 1...
                # check if next match actually contains this match
                match.merge_parts(next_match)
                merged_resolved_refs += [match]
                next_merged = True
            else:
                merged_resolved_refs += [match]
        if len(resolved_refs) > 0:
            # never dealt with last resolved_ref
            merged_resolved_refs += [resolved_refs[-1]]
        return merged_resolved_refs
