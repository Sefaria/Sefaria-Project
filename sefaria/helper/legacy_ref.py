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
    Current assumption is all trefs in the mapping (both old and mapped) are in URL form and are segment level.
    """
    collection = 'legacy_ref_data'
    criteria_field = 'title'
    pkeys = ["index_title"]
    required_attrs = [
        "index_title",
        "data",
    ]

    __slots__ = ['index_title', 'data']


class LegacyRefParser:
    """
    Currently empty super class used for type hints and to make the code more flexible in the future
    """

    def parse(self, legacy_tref: str) -> Ref:
        pass


class NonExistentLegacyRefParser(LegacyRefParser):
    """
    This class acts as a semantic indication of a lack of LegacyRefParser
    Currently used in `LegacyRefParserHandler` as return value when no parser is found
    Doesn't inherit from `LegacyRefParser` since it doesn't define the same contract (or any contract)
    """

    def parse(self, legacy_tref: str) -> Ref:
        raise Exception("Not implemented")


NON_EXISTENT_LEGACY_REF_PARSER = NonExistentLegacyRefParser()


class MappingLegacyRefParser(LegacyRefParser):
    """
    Parses legacy refs using a mapping from old ref -> new ref
    Assumption for now is this class can only map refs that are either
    - segment level
    - ranged segment level but not spanning sections
    """
    
    def __init__(self, data: LegacyRefParsingData):
        self._mapping: Dict[str, str] = data.data['mapping']

    def parse(self, legacy_tref: str) -> Ref:
        """

        @param legacy_tref:
        @return:
        """
        legacy_tref = self.__to_url_form(legacy_tref)
        if self.__is_ranged_ref(legacy_tref):
            return self.__parse_ranged_ref(legacy_tref)
        return self.__parse_segment_ref(legacy_tref)

    @staticmethod
    def __to_url_form(tref: str):
        """
        replace last space before sections with a period
        AND
        then replace remaining spaces with underscore
        @param tref:
        @return:
        """
        return re.sub(r" (?=[\d.:ab]+$)", ".", tref).replace(" ", "_")

    @staticmethod
    def __is_ranged_ref(tref: str) -> bool:
        return "-" in tref

    @staticmethod
    def __range_list(ranged_tref: str) -> List[str]:
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

    def __get_mapped_tref(self, legacy_tref: str) -> str:
        try:
            return self._mapping[legacy_tref]
        except KeyError as err:
            raise LegacyRefParserMappingKeyError(*err.args)

    def __parse_segment_ref(self, legacy_tref: str) -> Ref:
        converted_tref = self.__get_mapped_tref(legacy_tref)
        converted_ref = Ref(converted_tref)
        converted_ref.legacy_tref = legacy_tref
        return converted_ref

    def __parse_ranged_ref(self, legacy_tref: str) -> Ref:
        parsed_range_list = [self.__parse_segment_ref(temp_tref) for temp_tref in self.__range_list(legacy_tref)]
        parsed_range_list.sort(key=lambda x: x.order_id())  # not assuming mapping is in order
        ranged_oref = parsed_range_list[0].to(parsed_range_list[-1])
        ranged_oref.legacy_tref = legacy_tref
        return ranged_oref


# Python type hint which is either a valid `LegacyRefParser` or a lack of one
PossiblyNonExistentLegacyRefParser = Union[LegacyRefParser, NonExistentLegacyRefParser]


class LegacyRefParserHandler:
    """
    pattern copied from django.core.cache.CacheHandler
    This just makes sure to load the correct legacy ref parser class given an index title
    """
    def __init__(self):
        self._parsers: Dict[str, PossiblyNonExistentLegacyRefParser] = {}

    def __getitem__(self, index_title: str) -> LegacyRefParser:
        parser = self.__get_parser(index_title)
        if isinstance(parser, NonExistentLegacyRefParser):
            raise NoLegacyRefParserError(f"Could not find proper legacy parser matching index title '{index_title}'")
        return parser

    def __get_parser(self, index_title: str) -> PossiblyNonExistentLegacyRefParser:
        try:
            return self._parsers[index_title]
        except KeyError:
            pass
        try:
            parser = self.__create_legacy_parser(index_title)
        except NoLegacyRefParserError as e:
            parser = NON_EXISTENT_LEGACY_REF_PARSER
        self._parsers[index_title] = parser
        return parser


    @staticmethod
    def __load_data(index_title: str) -> LegacyRefParsingData:
        """
        Load mapping from the DB
        @return:
        """
        lrpd = LegacyRefParsingData().load({"index_title": index_title})
        if lrpd is None:
            raise NoLegacyRefParserError(f"No LegacyRefParser for index title '{index_title}'")
        return lrpd

    @staticmethod
    def __create_legacy_parser(index_title: str, **kwargs) -> LegacyRefParser:
        """
        Currently, only returns one type of LegacyRefParser but in the future can determine type from the data
        determine the type from the data
        """
        data = LegacyRefParserHandler.__load_data(index_title)
        return MappingLegacyRefParser(data)


legacy_ref_parser_handler = LegacyRefParserHandler()
