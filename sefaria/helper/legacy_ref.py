# encoding=utf-8

from sefaria.model.abstract import AbstractMongoRecord
from sefaria.model.text import Ref
from django.utils.module_loading import import_string


class LegacyRefParsingData(AbstractMongoRecord):
    """
    This class is a mongo backed data store for data to aid legacy ref parsing. 
    It can contain ref mapping or any other data we think of down the line to help in future cases.
    Imagine a structure for e.g. 
    ```
    "index_title" : {
     "mapping": { "old_ref 1" : "mapped_ref 1" ...}
    }
    ```
    To be used with LegacyRefParser classes in this module.
    """
    collection = 'legacy_ref_data'
    criteria_field = 'title'
    pkeys = ["index_title"]
    required_attrs = [
        "index_title",
    ]

    # TODO validate structure of `index_title` field
    

class ZoharLegacyRefParser:
    """
    Class to parse old Zohar refs that will no longer exist in the Zohar structure. Since it cannot rely on real time ref resolution,
    What we need to do is string parsing according to the known pattern of old Zohar refs to parse out the single segment or section ref or the start and end sections of a
    ranged ref, to be able to look them up in the mapping and return the best approximate ref in the current Zohar schema
    """
    
    def __int__(self):
        self._load_mapping()
    
    def _load_mapping(self):
        """
        Load mapping from the DB
        @return:
        """
        lrpd = LegacyRefParsingData().load({"index_title": "Zohar"})
        self._mapping = lrpd.mapping  # TODO this field doesn't exist...
    
    def is_ranged_ref(self):
        #Really just check if there is a dash somewhere in the address
        pass
    
    def parse(self, ref):
        #This is where we look up the ref in the mapping and return the correct ref, the following code is just boilerplate please change it
        converted_ref = self._mapping[ref] # get the correct ref, will probably be more complicated than this
        converted_ref = Ref(converted_ref)
        # TODO add fields indicating ref was converted
        converted_ref.orig_ref = ref
        converted_ref.legacy_converted = True
        return converted_ref


class NoLegacyRefParserError(Exception):
    pass


class NonExistantLegacyRefParser:
    pass


NON_EXISTANT_LEGACY_REF_PARSER = NonExistantLegacyRefParser()
    

class LegacyRefParserHandler(object):
    """
    pattern copied from django.core.cache.CacheHandler
    This just makes sure to load the correct legacy ref parser class given an index title
    """
    def __init__(self):
        self._parsers = {}

    def __getitem__(self, alias):
        parser = self._get_parser_by_alias(alias)
        if isinstance(parser, NonExistantLegacyRefParser):
            raise NoLegacyRefParserError(f"Could not find proper legacy parser matching alias '{alias}'")
        return parser

    def _get_parser_by_alias(self, alias):
        try:
            return self._parsers[alias]
        except KeyError:
            pass
        try:
            parser = self._create_legacy_parser(alias)
        except NoLegacyRefParserError as e:
            parser = NON_EXISTANT_LEGACY_REF_PARSER
        self._parsers[alias] = parser
        return parser

    def parse(self, book, tref):
        parser = self[book]
        return parser.parse(tref)

    @staticmethod
    def _create_legacy_parser(index_title, **kwargs):
        # This is an extremely simplified version of django.core.cache._create_cache().
        # When there are more legacy parsers, what it should be doing is dynamically concatenating the index title to try and do import_string(index_title+"LegacyParser")
        # https://docs.djangoproject.com/en/1.11/ref/utils/#django.utils.module_loading.import_string
        # our of all the available classes listed in this module. 
        # Currently all it does is check for a Zohar parser or error
        if index_title == "Zohar":
            legacy_parser = import_string('sefaria.helper.legacy_ref.ZoharLegacyRefParser')
        else:
            raise NoLegacyRefParserError(f"Could not find proper legacy parser matching index title '{index_title}'")
        return legacy_parser()


legacy_ref_parser_handler = LegacyRefParserHandler()
