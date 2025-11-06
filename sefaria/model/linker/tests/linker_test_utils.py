import pytest
from typing import Dict, Iterable, List
from functools import reduce
from contextlib import contextmanager
from copy import deepcopy
from ne_span import NEDoc, RefPartType
from sefaria.model.text import Ref, library
from sefaria.model import schema
from sefaria.model.linker.ref_part import RawRef, RawRefPart
from sefaria.settings import ENABLE_LINKER

if not ENABLE_LINKER:
    pytest.skip("Linker not enabled", allow_module_level=True)


class RefPartTypeNone:
    """
    Represents no ref part type. A RefPart with this type will not be considered in parsing
    """
    pass


class EncodedPart:

    PART_TYPE_MAP = {
        "@": RefPartType.NAMED,
        "#": RefPartType.NUMBERED,
        "*": RefPartType.DH,
        "0": RefPartTypeNone,
        "^": RefPartType.RANGE_SYMBOL,
        "&": RefPartType.IBID,
        "<": RefPartType.RELATIVE,
        "~": RefPartType.NON_CTS,
    }

    def __init__(self, raw_encoded_part):
        self.raw_encoded_part = raw_encoded_part

    def _get_symbol(self):
        return self.raw_encoded_part[0]

    @property
    def text(self):
        return self.raw_encoded_part[1:]

    @property
    def part_type(self):
        symbol = self._get_symbol()

        if symbol not in self.PART_TYPE_MAP:
            raise Exception(f"Symbol '{symbol}' does not exist in EncodedParts.PART_TYPE_MAP. Valid symbols are "
                            f"{', '.join(self.PART_TYPE_MAP.keys())}")

        return self.PART_TYPE_MAP.get(symbol)

    @staticmethod
    def get_symbol_by_part_type(part_type):
        for symbol, temp_part_type in EncodedPart.PART_TYPE_MAP.items():
            if part_type == temp_part_type: return symbol

    @staticmethod
    def convert_to_raw_encoded_part_list(lang, text, span_slices, part_types):
        raw_encoded_part_list = []

        for part_type, span_slice in zip(part_types, span_slices):
            subtext = text[span_slice]
            symbol = EncodedPart.get_symbol_by_part_type(part_type)
            raw_encoded_part_list += [f"{symbol}{subtext}"]

        return raw_encoded_part_list


class EncodedPartList:

    def __init__(self, lang, raw_encoded_part_list: List[str]):
        self.lang = lang
        self.encoded_part_list: List[EncodedPart] = [EncodedPart(x) for x in raw_encoded_part_list]
        self._span = None

    @staticmethod
    def _get_part_separator():
        return " "

    def _get_char_inds(self):
        char_inds = []
        for part in self.encoded_part_list:
            if len(char_inds) > 0:
                last_char_ind = char_inds[-1][-1] + len(self._get_part_separator())
            else:
                last_char_ind = 0
            char_inds += [(last_char_ind, last_char_ind + len(part.text))]
        return char_inds

    @property
    def input_str(self):
        part_texts = [x.text for x in self.encoded_part_list]
        return reduce(lambda a, b: a + self._get_part_separator() + b, part_texts)

    @property
    def part_types(self):
        return [part.part_type for part in self.encoded_part_list]

    @property
    def span(self):
        if not self._span:
            doc = NEDoc(self.input_str)
            self._span = doc.subspan(slice(0, None))
        return self._span

    @property
    def span_slices(self):
        span_slices = []
        for char_start, char_end in self._get_char_inds():
            subspan = self.span.subspan(slice(char_start, char_end))
            span_slices += [slice(*subspan.range)]
        return span_slices

    @property
    def raw_ref_parts(self):
        try:
            part_spans = [self.span.subspan(span_slice) for span_slice in self.span_slices]
        except IndexError as e:
            self.print_debug_info()
            raise e
        raw_ref_parts = []
        for part_type, part_span in zip(self.part_types, part_spans):
            if part_type == RefPartTypeNone: continue
            raw_ref_parts += [RawRefPart(part_type, part_span)]
        return raw_ref_parts

    def get_raw_ref_params(self):
        return self.span, self.lang, self.raw_ref_parts

    def print_debug_info(self):
        print('Input:', self.input_str)
        print('Span indexes:', self.span_slices)
        print('Spans:')
        for i, subspan in enumerate(self.span):
            print(f'{i}) {subspan.text}')


def create_raw_ref_data(raw_encoded_parts: List[str], context_tref=None, lang='he', prev_trefs=None):
    """
    Just reflecting prev_trefs here b/c pytest.parametrize can't handle optional parameters
    """
    encoded_parts = EncodedPartList(lang, raw_encoded_parts)
    raw_ref = RawRef(*encoded_parts.get_raw_ref_params())
    context_oref = context_tref and Ref(context_tref)
    return raw_ref, context_oref, lang, prev_trefs


def print_spans(raw_ref: RawRef):
    print('\nInput:', raw_ref.text)
    print('Spans:')
    for i, part in enumerate(raw_ref.raw_ref_parts):
        print(f'{i}) {part.text}')


_MISSING = object()


@contextmanager
def temporary_context_mutations(target, mutations, *, append: bool = False):
    """
    Temporarily attach ref_resolver context mutations to a SchemaNode.

    :param target: SchemaNode (or Ref whose index_node should be patched).
    :param mutations: Iterable of mutation dicts.
    :param append: When True, extend any existing mutations instead of replacing.
    """
    def _resolve_node(obj):
        if isinstance(obj, schema.SchemaNode):
            return obj
        if isinstance(obj, Ref):
            node = getattr(obj, "index_node", None)
            if node is not None:
                return node
            index = getattr(obj, "index", None)
            node = getattr(index, "nodes", None) if index is not None else None
            if node is not None:
                return node
            raise ValueError(f"Could not determine schema node for Ref {obj.normal()}")
        raise TypeError("temporary_context_mutations expects a SchemaNode or Ref as target")

    node = _resolve_node(target)
    original = getattr(node, "ref_resolver_context_mutations", _MISSING)

    mutations_list = list(mutations)
    if not mutations_list and (not append or original is _MISSING):
        # No-op request; nothing to patch.
        yield node
        return

    if append and original is not _MISSING and original is not None:
        new_value = deepcopy(original) + deepcopy(mutations_list)
    else:
        new_value = deepcopy(mutations_list)

    if new_value:
        node.ref_resolver_context_mutations = new_value
    else:
        if original is _MISSING:
            yield node
            return
        if original is None:
            node.ref_resolver_context_mutations = None
        else:
            node.ref_resolver_context_mutations = deepcopy(original)
        yield node
        return

    try:
        yield node
    finally:
        if original is _MISSING:
            delattr(node, "ref_resolver_context_mutations")
        else:
            node.ref_resolver_context_mutations = original


@contextmanager
def temporary_non_unique_terms(term_defs: Iterable[Dict], *, ref_resolver=None, term_matcher=None):
    """
    Temporarily register NonUniqueTerm definitions for resolver use without hitting the database.

    :param term_defs: Iterable of dictionaries containing at least 'slug' and 'titles'.
    :param ref_resolver: Optional RefResolver instance used to obtain a TermMatcher.
    :param term_matcher: Optional TermMatcher instance. Provide either this or ref_resolver.
    """
    if term_matcher is None:
        if ref_resolver is None:
            raise ValueError("temporary_non_unique_terms requires either ref_resolver or term_matcher")
        term_matcher = ref_resolver.get_term_matcher()

    term_defs = list(term_defs)
    if len(term_defs) == 0:
        yield []
        return

    cache_snapshots: Dict[str, object] = {}
    created_terms: List[schema.NonUniqueTerm] = []
    matcher_entries: List[tuple[str, int]] = []

    try:
        for term_def in term_defs:
            slug = term_def.get("slug")
            if not slug:
                raise ValueError("temporary_non_unique_terms requires each term definition to include a slug")

            existing = schema.NonUniqueTerm._init_cache.get(slug, _MISSING)
            cache_snapshots[slug] = existing

            if existing is _MISSING:
                term = schema.NonUniqueTerm(term_def)
                schema.NonUniqueTerm._init_cache[slug] = term
            else:
                term = existing
            created_terms.append(term)

            titles_for_lang = term.get_titles(term_matcher.lang) or []
            for title in titles_for_lang:
                entries = term_matcher._str2term_map.setdefault(title, [])
                insert_idx = len(entries)
                entries.append(term)
                matcher_entries.append((title, insert_idx))

        yield created_terms
    finally:
        for title, index in reversed(matcher_entries):
            entries = term_matcher._str2term_map.get(title)
            if not entries:
                continue
            if index < len(entries):
                entries.pop(index)
            if len(entries) == 0:
                del term_matcher._str2term_map[title]

        for term, term_def in zip(created_terms, term_defs):
            slug = term_def.get("slug")
            previous = cache_snapshots.get(slug, _MISSING)
            if previous is _MISSING:
                schema.NonUniqueTerm._init_cache.pop(slug, None)
            else:
                schema.NonUniqueTerm._init_cache[slug] = previous
