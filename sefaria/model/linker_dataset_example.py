from sefaria.model.abstract import AbstractMongoRecord, AbstractMongoSet
from sefaria.model.text import Ref


class LinkerDatasetExample(AbstractMongoRecord):
    """
    A single labeled training example for the linker NER models, captured by an admin from
    the Linker Admin panel. Two flavors, distinguished by `type`:

    - "ref":      text is a full segment (normalized through the linker normalizer) and
                  `labels` are the citation + person spans, i.e. training data for the
                  named-entity ("ref") model.
    - "ref part": text is a single citation (normalized) and `labels` are its ref parts,
                  i.e. training data for the "ref part" model.

    `labels` is stored in spaCy NER training format: {"entities": [[start, end, label], ...]}
    where offsets index into `text` and `label` is the raw language-specific model label
    (see ne_span.LABEL_TO_NAMED_ENTITY_TYPE_ATTR / LABEL_TO_REF_PART_TYPE_ATTR).
    """
    collection = "linker_dataset_examples"

    required_attrs = [
        "type",
        "text",
        "labels",
        "ref",
    ]
    optional_attrs = [
        "lang",
        "versionTitle",
        "added_by",
        "added_at",
    ]

    attr_schemas = {
        "type": {"type": "string", "allowed": ["ref", "ref part"], "required": True},
        "text": {"type": "string", "required": True},
        "ref": {"type": "string", "required": True},
        "lang": {"type": "string", "allowed": ["en", "he"], "required": False},
        "versionTitle": {"type": "string", "required": False},
        "added_by": {"type": "integer", "required": False, "nullable": True},
        "added_at": {"type": "integer", "required": False},
        "labels": {
            "type": "dict",
            "required": True,
            "schema": {
                "entities": {
                    "type": "list",
                    "required": True,
                    "schema": {
                        "type": "list",
                        "items": [
                            {"type": "integer"},
                            {"type": "integer"},
                            {"type": "string"},
                        ],
                    },
                }
            },
        },
    }

    def _validate(self):
        super()._validate()
        Ref(self.ref)  # raises InputError / BookNameError on a bad ref
        return True

    def _sanitize(self):
        # `text` comes from already-sanitized Version text (via TextChunk) or citation spans;
        # bleaching it would corrupt char offsets stored in `labels`. Other fields are metadata.
        pass

    def __str__(self):
        return "LinkerDatasetExample ({}): {}".format(self.type, self.ref)


class LinkerDatasetExampleSet(AbstractMongoSet):
    recordClass = LinkerDatasetExample
