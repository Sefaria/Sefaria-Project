import pytest
from typing import List
from functools import reduce
from sefaria.model.text import Ref, library
from sefaria.model.linker.ref_part import RefPartType, RawRef, RawRefPart
from sefaria.settings import ENABLE_LINKER

if not ENABLE_LINKER:
    pytest.skip("Linker not enabled", allow_module_level=True)

ref_resolver = library.get_ref_resolver()


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
    def convert_to_raw_encoded_part_list(lang, text, span_inds, part_types):
        nlp = ref_resolver.get_raw_ref_part_model(lang)
        doc = nlp.make_doc(text)
        span = doc[0:]
        raw_encoded_part_list = []

        for part_type, span_ind in zip(part_types, span_inds):
            subspan = span[span_ind]
            symbol = EncodedPart.get_symbol_by_part_type(part_type)
            raw_encoded_part_list += [f"{symbol}{subspan.text}"]

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
            nlp = ref_resolver.get_raw_ref_part_model(self.lang)
            doc = nlp.make_doc(self.input_str)
            self._span = doc[0:]
        return self._span

    @property
    def span_indexes(self):
        span_inds = []
        for char_start, char_end in self._get_char_inds():
            subspan = self.span.char_span(char_start, char_end)
            span_inds += [slice(subspan.start, subspan.end)]
        return span_inds

    @property
    def raw_ref_parts(self):
        try:
            part_spans = [self.span[index] for index in self.span_indexes]
        except IndexError as e:
            self.print_debug_info()
            raise e
        raw_ref_parts = []
        for part_type, part_span in zip(self.part_types, part_spans):
            if part_type == RefPartTypeNone: continue
            raw_ref_parts += [RawRefPart(part_type, part_span)]
        return raw_ref_parts

    def get_raw_ref_params(self):
        return self.lang, self.raw_ref_parts, self.span

    def print_debug_info(self):
        print('Input:', self.input_str)
        print('Span indexes:', self.span_indexes)
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