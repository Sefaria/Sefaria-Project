from typing import List, Generator, Optional
from functools import reduce
from collections import defaultdict
from sefaria.model.linker.ref_part import RawRef, RawRefPart, SpanOrToken, span_inds, RefPartType
from sefaria.helper.normalization import NormalizerComposer

try:
    import spacy
    from spacy.tokens import Span
    from spacy.language import Language
except ImportError:
    spacy = Doc = Span = Token = Language = None


class NamedEntityRecognizer:
    """
    Given models, runs them and returns named entity results
    Currently, named entities include:
    - refs
    - people
    - groups of people
    """

    def __init__(self, lang: str, raw_ref_model: Language, raw_ref_part_model: Language):
        self._lang = lang
        self._raw_ref_model = raw_ref_model
        self._raw_ref_part_model = raw_ref_part_model
        self._normalizer = self.__init_normalizer()

    def __init_normalizer(self) -> NormalizerComposer:
        # see ML Repo library_exporter.py:TextWalker.__init__() which uses same normalization
        # important that normalization is equivalent to normalization done at training time
        normalizer_steps = ['unidecode', 'html', 'double-space']
        if self._lang == 'he':
            normalizer_steps += ['maqaf', 'cantillation']
        return NormalizerComposer(normalizer_steps)

    def bulk_get_raw_refs(self, input: List[str]) -> List[List[RawRef]]:
        """
        Runs models on input to locate all refs and ref parts
        Note: takes advantage of bulk spaCy operations. It is more efficient to pass multiple strings in input than to
        run this function multiple times
        @param input: List of strings to search for refs in.
        @return: 2D list of RawRefs. Each inner list corresponds to the refs found in a string of the input.
        """
        normalized_input = self._normalize_input(input)
        all_raw_ref_spans = list(self._bulk_get_raw_ref_spans(normalized_input))
        ref_part_input = reduce(lambda a, b: a + [(sub_b.text, b[0]) for sub_b in b[1]], enumerate(all_raw_ref_spans), [])
        all_raw_ref_part_spans = list(self._bulk_get_raw_ref_part_spans(ref_part_input, as_tuples=True))
        all_raw_ref_part_span_map = defaultdict(list)
        for ref_part_span, input_idx in all_raw_ref_part_spans:
            all_raw_ref_part_span_map[input_idx] += [ref_part_span]

        all_raw_refs = []
        for input_idx, raw_ref_spans in enumerate(all_raw_ref_spans):
            raw_ref_part_spans = all_raw_ref_part_span_map[input_idx]
            all_raw_refs += [self._bulk_make_raw_refs(raw_ref_spans, raw_ref_part_spans)]
        return all_raw_refs

    def bulk_map_normal_output_to_original_input(self, input: List[str], raw_ref_list_list: List[List[RawRef]]):
        for temp_input, raw_ref_list in zip(input, raw_ref_list_list):
            self.map_normal_output_to_original_input(temp_input, raw_ref_list)

    def map_normal_output_to_original_input(self, input: str, raw_ref_list: List[RawRef]) -> None:
        """
        Ref resolution ran on normalized input. Remap raw refs to original (non-normalized) input
        """
        unnorm_doc = self._raw_ref_model.make_doc(input)
        mapping = self._normalizer.get_mapping_after_normalization(input)
        # this function name is waaay too long
        conv = self._normalizer.convert_normalized_indices_to_unnormalized_indices
        norm_inds = [raw_ref.char_indices for raw_ref in raw_ref_list]
        unnorm_inds = conv(norm_inds, mapping)
        unnorm_part_inds = []
        for (raw_ref, (norm_raw_ref_start, _)) in zip(raw_ref_list, norm_inds):
            unnorm_part_inds += [conv([[norm_raw_ref_start + i for i in part.char_indices]
                                       for part in raw_ref.raw_ref_parts], mapping)]
        for raw_ref, temp_unnorm_inds, temp_unnorm_part_inds in zip(raw_ref_list, unnorm_inds, unnorm_part_inds):
            raw_ref.map_new_indices(unnorm_doc, temp_unnorm_inds, temp_unnorm_part_inds)

    @property
    def raw_ref_model(self):
        return self._raw_ref_model

    @property
    def raw_ref_part_model(self):
        return self._raw_ref_part_model

    def _normalize_input(self, input: List[str]):
        """
        Normalize input text to match normalization that happened at training time
        """
        return [self._normalizer.normalize(s) for s in input]

    def _get_raw_ref_spans_in_string(self, st: str) -> List[Span]:
        doc = self._raw_ref_model(st)
        return doc.ents

    def _get_raw_ref_part_spans_in_string(self, st: str) -> List[Span]:
        doc = self._raw_ref_part_model(st)
        return doc.ents

    def _bulk_get_raw_ref_spans(self, input: List[str], batch_size=150, **kwargs) -> Generator[List[Span], None, None]:
        for doc in self._raw_ref_model.pipe(input, batch_size=batch_size, **kwargs):
            if kwargs.get('as_tuples', False):
                doc, context = doc
                yield doc.ents, context
            else:
                yield doc.ents

    def _bulk_get_raw_ref_part_spans(self, input: List[str], batch_size=None, **kwargs) -> Generator[List[Span], None, None]:
        for doc in self._raw_ref_part_model.pipe(input, batch_size=batch_size or len(input), **kwargs):
            if kwargs.get('as_tuples', False):
                doc, context = doc
                yield doc.ents, context
            else:
                yield doc.ents

    def _bulk_make_raw_refs(self, raw_ref_spans: List[SpanOrToken], raw_ref_part_spans: List[List[SpanOrToken]]) -> List[RawRef]:
        raw_refs = []
        dh_continuations = self._bulk_make_dh_continuations(raw_ref_spans, raw_ref_part_spans)
        for span, part_span_list, temp_dh_continuations in zip(raw_ref_spans, raw_ref_part_spans, dh_continuations):
            raw_refs += [self._make_raw_ref(span, part_span_list, temp_dh_continuations)]
        return raw_refs

    def _make_raw_ref(self, span: SpanOrToken, part_span_list: List[SpanOrToken], dh_continuations: List[SpanOrToken]) -> RawRef:
        raw_ref_parts = []
        for part_span, dh_continuation in zip(part_span_list, dh_continuations):
            part_type = RefPartType.span_label_to_enum(part_span.label_)
            raw_ref_parts += [RawRefPart(part_type, part_span, dh_continuation)]
        return RawRef(self._lang, raw_ref_parts, span)

    def _bulk_make_dh_continuations(self, raw_ref_spans, raw_ref_part_spans) -> List[List[SpanOrToken]]:
        dh_continuations = []
        for ispan, (span, part_span_list) in enumerate(zip(raw_ref_spans, raw_ref_part_spans)):
            temp_dh_continuations = []
            for ipart, part_span in enumerate(part_span_list):
                part_type = RefPartType.span_label_to_enum(part_span.label_)
                dh_continuation = None
                if part_type == RefPartType.DH:
                    dh_continuation = self._get_dh_continuation(ispan, ipart, raw_ref_spans, part_span_list, span, part_span)
                temp_dh_continuations += [dh_continuation]
            dh_continuations += [temp_dh_continuations]
        return dh_continuations

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
