from typing import List, Union, Dict
import re

from sefaria.model.abstract import AbstractMongoRecord
from sefaria.model.text import Ref


class LegacyRefParserError(Exception):
    """
    Generic LegacyRefParser error
    """


class NoLegacyRefParserError(LegacyRefParserError):
    pass


class LegacyRefParserMappingKeyError(LegacyRefParserError, KeyError):
    pass


class NonExistantLegacyRefParser:
    pass


NON_EXISTANT_LEGACY_REF_PARSER = NonExistantLegacyRefParser()


class LegacyRefParsingData(AbstractMongoRecord):
    """
    This class is a mongo backed data store for data to aid legacy ref parsing. 
    It can contain ref mapping or any other data we think of down the line to help in future cases.
    Imagine a structure for e.g. 
    ```
    {
        "index_title" : "Zohar",
        "data": {
            "mapping": { "old_ref 1" : "mapped_ref 1" ...}
        }
    }
    ```
    To be used with LegacyRefParser classes in this module.
    """
    collection = 'legacy_ref_data'
    criteria_field = 'title'
    pkeys = ["index_title"]
    required_attrs = [
        "index_title",
        "data",
    ]

    __slots__ = ['index_title', 'data']


class MappingLegacyRefParser:
    """
    Parses legacy refs using a mapping from old ref -> new ref
    """
    
    def __init__(self, data: LegacyRefParsingData):
        self._mapping: Dict[str, str] = data.data['mapping']

    @staticmethod
    def is_ranged_ref(tref: str) -> bool:
        return "-" in tref

    @staticmethod
    def range_list(ranged_tref: str) -> List[str]:
        segment_range_match = re.search(r'(\d+)-(\d+)$', ranged_tref)
        if segment_range_match is None:
            return [ranged_tref]
        start_segment = int(segment_range_match.group(1))
        end_segment = int(segment_range_match.group(2))
        base_tref = ranged_tref[:segment_range_match.start(0)]

        range_list = []
        for segment_num in range(start_segment, end_segment+1):
            range_list += [f"{base_tref}{segment_num}"]

        return range_list

    def parse(self, legacy_tref: str) -> Ref:
        """

        @param legacy_tref: Assumption for now is this is segment level or ranged segment level and not a spanning ref
        @return:
        """
        if self.is_ranged_ref(legacy_tref):
            return self._parse_ranged_ref(legacy_tref)
        return self._parse_segment_ref(legacy_tref)

    def _get_mapped_tref(self, legacy_tref: str) -> str:
        try:
            return self._mapping[legacy_tref]
        except KeyError as err:
            raise LegacyRefParserMappingKeyError(*err.args)

    def _parse_segment_ref(self, legacy_tref: str) -> Ref:
        converted_tref = self._get_mapped_tref(legacy_tref)
        converted_ref = Ref(converted_tref)
        converted_ref.legacy_tref = legacy_tref
        return converted_ref

    def _parse_ranged_ref(self, legacy_tref: str) -> Ref:
        parsed_range_list = [self._parse_segment_ref(temp_tref) for temp_tref in self.range_list(legacy_tref)]
        parsed_range_list.sort(key=lambda x: x.order_id())  # not assuming mapping is in order
        ranged_oref = parsed_range_list[0].to(parsed_range_list[-1])
        ranged_oref.legacy_tref = legacy_tref
        return ranged_oref


PossiblyNonExistantLegacyRefParser = Union[MappingLegacyRefParser, NonExistantLegacyRefParser]


class LegacyRefParserHandler(object):
    """
    pattern copied from django.core.cache.CacheHandler
    This just makes sure to load the correct legacy ref parser class given an index title
    """
    def __init__(self):
        self._parsers: Dict[str, PossiblyNonExistantLegacyRefParser] = {}

    def __getitem__(self, index_title: str) -> MappingLegacyRefParser:
        parser = self._get_parser(index_title)
        if isinstance(parser, NonExistantLegacyRefParser):
            raise NoLegacyRefParserError(f"Could not find proper legacy parser matching index title '{index_title}'")
        return parser

    def _get_parser(self, index_title: str) -> PossiblyNonExistantLegacyRefParser:
        try:
            return self._parsers[index_title]
        except KeyError:
            pass
        try:
            parser = self._create_legacy_parser(index_title)
        except NoLegacyRefParserError as e:
            parser = NON_EXISTANT_LEGACY_REF_PARSER
        self._parsers[index_title] = parser
        return parser

    def parse(self, index_title: str, tref: str) -> Ref:
        parser = self[index_title]
        return parser.parse(tref)

    @staticmethod
    def _load_data(index_title: str) -> LegacyRefParsingData:
        """
        Load mapping from the DB
        @return:
        """
        lrpd = LegacyRefParsingData().load({"index_title": index_title})
        if lrpd is None:
            raise NoLegacyRefParserError(f"No MappingLegacyRefParser for index title '{index_title}'")
        return lrpd

    @staticmethod
    def _create_legacy_parser(index_title: str, **kwargs) -> MappingLegacyRefParser:
        """
        Currently, only returns one type of LegacyRefParser but in the future can determine type from the data
        determine the type from the data
        """
        data = LegacyRefParserHandler._load_data(index_title)
        return MappingLegacyRefParser(data)


legacy_ref_parser_handler = LegacyRefParserHandler()
