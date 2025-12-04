from sefaria.model.abstract import AbstractMongoSet
from sefaria.model.marked_up_text_chunk import MUTCSpanType, MarkedUpTextChunk
from sefaria.model.text import Ref
from sefaria.system.exceptions import InputError
import structlog
logger = structlog.get_logger(__name__)


class LinkerOutput(MarkedUpTextChunk):
    """
    Track linker resolutions for debugging purposes.
    """
    collection = "linker_output"
    criteria_field = "ref"
    track_pkeys = True
    pkeys = ["ref", "versionTitle", "language"]

    required_attrs = [
        "ref",
        "versionTitle",
        "language",
        "spans"
    ]
    optional_list_str_schema_keys = ('categoryPath', 'inputRefParts', 'inputRefPartTypes', 
                                     'inputRefPartClasses', 'refPartsToMatch', 'resolvedRefParts',
                                     'resolvedRefPartTypes', 'resolvedRefPartClasses', 'inputRangeSections',
                                     'inputRangeToSections')

    attr_schemas = {
        "ref": {"type": "string", "required": True},
        "versionTitle": {"type": "string", "required": True},
        "language": {"type": "string", "allowed": ["en", "he"], "required": True},
        "spans": {
            "type": "list",
            "empty": False,
            "schema": {
                "type": "dict",
                "schema": {
                    "charRange": {
                        "type": "list",
                        "schema": {"type": "integer"},
                        "minlength": 2,
                        "maxlength": 2,
                        "required": True
                    },
                    "text": {"type": "string", "required": True},
                    "type": {
                        "type": "string",
                        "allowed": [x.value for x in MUTCSpanType],
                        "required": True
                    },
                    "ref": {"type": "string", "required": False, "nullable": True},
                    "topicSlug": {"type": "string", "required": False, "nullable": True},
                    "contextRef": {"type": "string", "required": False, "nullable": True},
                    "contextType": {"type": "string", "required": False, "nullable": True},
                    "failed": {"type": "boolean", "required": True},
                    "ambiguous": {"type": "boolean", "required": True},
                    **{k: {"type": "list", "schema": {"type": "string"}, "required": False, "nullable": True} for k in optional_list_str_schema_keys}
                }
            },
            "required": True
        }
    }


class LinkerOutputSet(AbstractMongoSet):
    recordClass = LinkerOutput


def process_index_title_change_in_linker_output(indx, **kwargs):
    print("Cascading Marked Up Text Chunks from {} to {}".format(kwargs['old'], kwargs['new']))

    # ensure that the regex library we're using here is the same regex library being used in `Ref.regex`
    from .text import re as reg_reg
    patterns = [pattern.replace(reg_reg.escape(indx.title), reg_reg.escape(kwargs["old"]))
                for pattern in Ref(indx.title).regex(as_list=True)]
    queries = [{'ref': {'$regex': pattern}} for pattern in patterns]
    objs = LinkerOutputSet({"$or": queries})
    for o in objs:
        o.ref = o.ref.replace(kwargs["old"], kwargs["new"], 1)
        try:
            o.save()
        except InputError:
            logger.warning("Failed to convert ref data from: {} to {}".format(kwargs['old'], kwargs['new']))


def process_index_delete_in_linker_output(indx, **kwargs):
    from sefaria.model.text import prepare_index_regex_for_dependency_process
    pattern = prepare_index_regex_for_dependency_process(indx)
    LinkerOutputSet({"ref": {"$regex": pattern}}).delete()
