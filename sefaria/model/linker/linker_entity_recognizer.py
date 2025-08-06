from typing import Generator, Optional, Union, Any
import time
from sefaria.model.linker.ref_part import RawRef, RawRefPart, RefPartType, RawNamedEntity, NamedEntityType
from sefaria.helper.normalization import NormalizerComposer
from sefaria.settings import GPU_SERVER_URL
import requests
from ne_span import NESpan, NEDoc
import structlog
logger = structlog.get_logger(__name__)


class LinkerEntityRecognizer:
    """
    Wrapper around AbstractNER
    Given AbstractNER for NER and Raw Ref parts, runs them and returns parsed RawNamedEntity including RawRefs.
    Currently, named entities include:
    - refs
    - people
    - groups of people
    """

    def __init__(self, lang: str):
        """

        @param lang: language that the Recognizer understands (based on how the models were trained)
        """
        self._lang = lang
        self._normalizer = self.__init_normalizer()

    def __init_normalizer(self) -> NormalizerComposer:
        # see ML Repo library_exporter.py:TextWalker.__init__() which uses same normalization
        # important that normalization is equivalent to normalization done at training time
        normalizer_steps = ['unidecode', 'html', 'double-space']
        if self._lang == 'he':
            normalizer_steps += ['maqaf', 'cantillation']
        return NormalizerComposer(normalizer_steps)

    def bulk_recognize(self, inputs: list[str]) -> list[list[RawNamedEntity]]:
        """
        Return all RawNamedEntity's in `inputs`. If the entity is a citation, parse out the inner RawRefParts and create
        RawRefs.
        @param inputs: List of strings to search for named entities in.
        @return: 2D list of RawNamedEntity's. Includes RawRefs which are a subtype of RawNamedEntity
        """
        normalized_inputs = self._normalize_input(inputs)
        start_time = time.perf_counter()
        resp = requests.post(f"{GPU_SERVER_URL}/bulk-recognize-entities",
                             json={"texts": normalized_inputs, "lang": self._lang})
        elapsed_time = time.perf_counter() - start_time
        logger.debug("bulk_recognize GPU server post completed", elapsed_time=elapsed_time, num_inputs=len(normalized_inputs))
        data = resp.json()
        merged_entities = []
        for input_str, result in zip(normalized_inputs, data['results']):
            raw_refs, non_citations = self._parse_recognize_response(input_str, result)
            merged_entities += [raw_refs + non_citations]
        return merged_entities

    def recognize(self, input_str: str) -> [list[RawRef], list[RawNamedEntity]]:
        normalized_input = self._normalize_input([input_str])[0]
        start_time = time.perf_counter()
        resp = requests.post(f"{GPU_SERVER_URL}/recognize-entities",
                             json={"text": normalized_input, "lang": self._lang})
        elapsed_time = time.perf_counter() - start_time
        logger.debug("recognize GPU server post completed", elapsed_time=elapsed_time)
        data = resp.json()
        return self._parse_recognize_response(normalized_input, data)

    def _parse_recognize_response(self, input_str: str, data: dict) -> (list[RawRef], list[RawNamedEntity]):
        all_citations, non_citations = [], []
        all_raw_ref_parts = []
        doc = NEDoc(input_str)
        for raw_entity in data['entities']:
            if NamedEntityType.span_label_to_enum(raw_entity['label']) == NamedEntityType.CITATION:
                temp_cit, raw_ref_parts = self._deserialize_raw_ref(doc, raw_entity)
                all_citations.append(temp_cit)
                all_raw_ref_parts.append(raw_ref_parts)
            else:
                non_citations.append(self._deserialize_raw_named_entity(doc, raw_entity))
        raw_refs = self._bulk_make_raw_refs(all_citations, all_raw_ref_parts)
        return raw_refs, non_citations

    def _deserialize_raw_ref(self, doc: NEDoc, raw: dict) -> (RawNamedEntity, list[NESpan]):
        """
        Deserialize a RawRef from a dictionary representation.
        @param raw: Dictionary representation of the RawRef.
        @return: A RawRef object.
        """
        named_entity = self._deserialize_raw_named_entity(doc, raw)
        span_doc = NEDoc(named_entity.span.text)
        part_span_list = []
        for part in raw['parts']:
            part_span = NESpan(span_doc, part['range'][0], part['range'][1], part['label'])
            part_span_list.append(part_span)
        return named_entity, part_span_list

    @staticmethod
    def _deserialize_raw_named_entity(doc: NEDoc, raw: dict) -> RawNamedEntity:
        span = NESpan(doc, raw['range'][0], raw['range'][1], raw['label'])
        return RawNamedEntity(span, NamedEntityType.span_label_to_enum(raw['label']))

    def bulk_map_normal_output_to_original_input(self, input: list[str], raw_ref_list_list: list[list[RawRef]]):
        for temp_input, raw_ref_list in zip(input, raw_ref_list_list):
            self.map_normal_output_to_original_input(temp_input, raw_ref_list)

    def map_normal_output_to_original_input(self, input: str, named_entities: list[RawNamedEntity]) -> None:
        """
        Ref resolution ran on normalized input. Remap raw refs to original (non-normalized) input
        """
        unnorm_doc = NEDoc(input)
        mapping, subst_end_indices = self._normalizer.get_mapping_after_normalization(input)
        conv = self._normalizer.norm_to_unnorm_indices_with_mapping
        norm_inds = [named_entity.char_indices for named_entity in named_entities]
        unnorm_inds = conv(norm_inds, mapping, subst_end_indices)
        unnorm_part_inds = []
        for (named_entity, (norm_raw_ref_start, _)) in zip(named_entities, norm_inds):
            raw_ref_parts = named_entity.raw_ref_parts if isinstance(named_entity, RawRef) else []
            unnorm_part_inds += [conv([[norm_raw_ref_start + i for i in part.char_indices]
                                       for part in raw_ref_parts], mapping, subst_end_indices)]
        for named_entity, temp_unnorm_inds, temp_unnorm_part_inds in zip(named_entities, unnorm_inds, unnorm_part_inds):
            named_entity.map_new_char_indices(unnorm_doc, temp_unnorm_inds)
            if isinstance(named_entity, RawRef):
                named_entity.map_new_part_char_indices(temp_unnorm_part_inds)

    def _normalize_input(self, input: list[str]):
        """
        Normalize input text to match normalization that happened at training time
        """
        return [self._normalizer.normalize(s) for s in input]

    # TODO the following four functions are very loosely coupled to the LinkerEntityRecognizer and should be moved out
    def _bulk_make_raw_refs(self, named_entities: list[RawNamedEntity], raw_ref_part_spans: list[list[NESpan]]) -> list[RawRef]:
        raw_refs = []
        dh_continuations = self._bulk_make_dh_continuations(named_entities, raw_ref_part_spans)
        for named_entity, part_span_list, temp_dh_continuations in zip(named_entities, raw_ref_part_spans, dh_continuations):
            raw_refs += [self._make_raw_ref(named_entity.span, part_span_list, temp_dh_continuations)]
        return raw_refs

    def _make_raw_ref(self, span: NESpan, part_span_list: list[NESpan], dh_continuations: list[NESpan]) -> RawRef:
        raw_ref_parts = []
        for part_span, dh_continuation in zip(part_span_list, dh_continuations):
            part_type = RefPartType.span_label_to_enum(part_span.label)
            raw_ref_parts += [RawRefPart(part_type, part_span, dh_continuation)]
        return RawRef(span, self._lang, raw_ref_parts)

    @staticmethod
    def _bulk_make_dh_continuations(named_entities: list[RawNamedEntity], raw_ref_part_spans) -> list[list[NESpan]]:
        dh_continuations = []
        for ispan, (named_entity, part_span_list) in enumerate(zip(named_entities, raw_ref_part_spans)):
            temp_dh_continuations = []
            for ipart, part_span in enumerate(part_span_list):
                part_type = RefPartType.span_label_to_enum(part_span.label)
                dh_continuation = None
                if part_type == RefPartType.DH:
                    dh_continuation = LinkerEntityRecognizer._get_dh_continuation(ispan, ipart, named_entities, part_span_list,
                                                                                  named_entity.span, part_span)
                temp_dh_continuations += [dh_continuation]
            dh_continuations += [temp_dh_continuations]
        return dh_continuations

    @staticmethod
    def _get_dh_continuation(ispan: int, ipart: int, named_entities: list[RawNamedEntity], part_span_list: list[NESpan], span: NESpan, part_span: NESpan) -> Optional[NESpan]:
        if ipart == len(part_span_list) - 1:
            curr_doc = span.doc
            _, span_end = span.range
            if ispan == len(named_entities) - 1:
                dh_cont = curr_doc.subspan(slice(span_end, None))
            else:
                next_span_start, _ = named_entities[ispan + 1].span.range
                dh_cont = curr_doc.subspan(slice(span_end, next_span_start))
        else:
            _, part_span_end = part_span.range
            next_part_span_start, _ = part_span_list[ipart + 1].range
            dh_cont = part_span.subspan(slice(part_span_end, next_part_span_start))

        return dh_cont
