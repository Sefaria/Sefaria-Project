from typing import Generator, Optional, Union, Any
from functools import reduce
from collections import defaultdict
from sefaria.model.linker.ref_part import RawRef, RawRefPart, RefPartType, RawNamedEntity, NamedEntityType
from sefaria.helper.normalization import NormalizerComposer
from sefaria.model.linker.named_entity_recognizer import AbstractNER
from sefaria.model.linker.ne_span import NESpan, NEDoc


class LinkerEntityRecognizer:
    """
    Wrapper around AbstractNER
    Given AbstractNER for NER and Raw Ref parts, runs them and returns parsed RawNamedEntity including RawRefs.
    Currently, named entities include:
    - refs
    - people
    - groups of people
    """

    def __init__(self, lang: str, named_entity_model: AbstractNER, raw_ref_part_model: AbstractNER):
        """

        @param lang: language that the Recognizer understands (based on how the models were trained)
        @param named_entity_model: NER model which takes a string and recognizes where entities are
        @param raw_ref_part_model: NER model which takes a string raw ref and recognizes the parts of the ref
        """
        self._lang = lang
        self._named_entity_model = named_entity_model
        self._raw_ref_part_model = raw_ref_part_model
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
        all_raw_named_entities = self._bulk_get_raw_named_entities_wo_raw_refs(inputs)
        all_citations, all_non_citations = self._bulk_partition_named_entities_by_citation_type(all_raw_named_entities)
        all_raw_refs = self._bulk_parse_raw_refs(all_citations)
        merged_entities = []
        for inner_non_citations, inner_citations in zip(all_non_citations, all_raw_refs):
            merged_entities += [inner_non_citations + inner_citations]
        return merged_entities

    def recognize(self, input_str: str) -> [list[RawRef], list[RawNamedEntity]]:
        raw_named_entities = self._get_raw_named_entities_wo_raw_refs(input_str)
        citations, non_citations = self._partition_named_entities_by_citation_type(raw_named_entities)
        raw_refs = self._parse_raw_refs(citations)
        return raw_refs, non_citations

    def _bulk_get_raw_named_entities_wo_raw_refs(self, inputs: list[str]) -> list[list[RawNamedEntity]]:
        """
        Finds RawNamedEntities in `inputs` but doesn't parse citations into RawRefs with RawRefParts
        @param inputs:
        @return:
        """
        normalized_inputs = self._normalize_input(inputs)
        all_raw_named_entity_spans = list(self._bulk_get_raw_named_entity_spans(normalized_inputs))
        all_raw_named_entities = []
        for raw_named_entity_spans in all_raw_named_entity_spans:
            temp_raw_named_entities = []
            for span in raw_named_entity_spans:
                ne_type = NamedEntityType.span_label_to_enum(span.label)
                temp_raw_named_entities += [RawNamedEntity(span, ne_type)]
            all_raw_named_entities += [temp_raw_named_entities]
        return all_raw_named_entities

    def _get_raw_named_entities_wo_raw_refs(self, input_str: str) -> list[RawNamedEntity]:
        """
        Finds RawNamedEntities in `input_str` but doesn't parse citations into RawRefs with RawRefParts
        @param input_str:
        @return:
        """
        normalized_input = self._normalize_input([input_str])[0]
        raw_named_entity_spans = self._get_raw_named_entity_spans(normalized_input)
        raw_named_entities = []
        for span in raw_named_entity_spans:
            ne_type = NamedEntityType.span_label_to_enum(span.label)
            raw_named_entities += [RawNamedEntity(span, ne_type)]
        return raw_named_entities

    @staticmethod
    def _bulk_partition_named_entities_by_citation_type(
            all_raw_named_entities: list[list[RawNamedEntity]]
    ) -> [list[list[RawNamedEntity]], list[list[RawNamedEntity]]]:
        """
        Given named entities, partition them into two lists; list of entities that are citations and those that aren't.
        @param all_raw_named_entities:
        @return:
        """
        citations, non_citations = [], []
        for sublist in all_raw_named_entities:
            inner_citations, inner_non_citations = LinkerEntityRecognizer._partition_named_entities_by_citation_type(sublist)
            citations += [inner_citations]
            non_citations += [inner_non_citations]
        return citations, non_citations

    @staticmethod
    def _partition_named_entities_by_citation_type(
            raw_named_entities: list[RawNamedEntity]
    ) -> [list[RawNamedEntity], list[RawNamedEntity]]:
        citations, non_citations = [], []
        for named_entity in raw_named_entities:
            curr_list = citations if named_entity.type == NamedEntityType.CITATION else non_citations
            curr_list += [named_entity]
        return citations, non_citations

    def _bulk_parse_raw_refs(self, all_citation_entities: list[list[RawNamedEntity]]) -> list[list[RawRef]]:
        """
        Runs models on inputs to locate all refs and ref parts
        Note: takes advantage of bulk spaCy operations. It is more efficient to pass multiple strings in input than to
        run this function multiple times
        @param all_citation_entities: List of RawNamedEntity lists, where each inner list corresponds to the named entities found in a string of the input.
        @return: 2D list of RawRefs. Each inner list corresponds to the refs found in a string of the input.
        """
        ref_part_input = reduce(lambda a, b: a + [(sub_b.text, b[0]) for sub_b in b[1]], enumerate(all_citation_entities), [])
        all_raw_ref_part_spans = list(self._bulk_get_raw_ref_part_spans(ref_part_input, as_tuples=True))
        all_raw_ref_part_span_map = defaultdict(list)
        for ref_part_span, input_idx in all_raw_ref_part_spans:
            all_raw_ref_part_span_map[input_idx] += [ref_part_span]

        all_raw_refs = []
        for input_idx, named_entities in enumerate(all_citation_entities):
            raw_ref_part_spans = all_raw_ref_part_span_map[input_idx]
            all_raw_refs += [self._bulk_make_raw_refs(named_entities, raw_ref_part_spans)]
        return all_raw_refs

    def _parse_raw_refs(self, citation_entities: list[RawNamedEntity]) -> list[RawRef]:
        raw_ref_part_spans = list(self._bulk_get_raw_ref_part_spans([e.text for e in citation_entities]))
        return self._bulk_make_raw_refs(citation_entities, raw_ref_part_spans)

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

    @property
    def named_entity_model(self):
        return self._named_entity_model

    @property
    def raw_ref_part_model(self):
        return self._raw_ref_part_model

    def _normalize_input(self, input: list[str]):
        """
        Normalize input text to match normalization that happened at training time
        """
        return [self._normalizer.normalize(s) for s in input]

    def _get_raw_named_entity_spans(self, st: str) -> list[NESpan]:
        return self._named_entity_model.predict(st)

    def _get_raw_ref_part_spans(self, st: str) -> list[NESpan]:
        return self._raw_ref_part_model.predict(st)

    def _bulk_get_raw_named_entity_spans(self, inputs: Union[list[str], list[tuple[str, Any]]], batch_size=150, as_tuples=False) -> Generator[list[NESpan], None, None]:
        if as_tuples:
            yield from self._named_entity_model.bulk_predict_as_tuples(inputs, batch_size)
        else:
            yield from self._named_entity_model.bulk_predict(inputs, batch_size)

    def _bulk_get_raw_ref_part_spans(self, inputs: Union[list[str], list[tuple[str, Any]]], batch_size=None, as_tuples=False) -> Generator[list[NESpan], None, None]:
        batch_size = batch_size or len(inputs)
        if as_tuples:
            yield from self._raw_ref_part_model.bulk_predict_as_tuples(inputs, batch_size)
        else:
            yield from self._raw_ref_part_model.bulk_predict(inputs, batch_size)

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
