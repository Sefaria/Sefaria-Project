from . import abstract as abst
from sefaria.model.text import TextChunk, Ref
from sefaria.system.exceptions import InputError, DuplicateRecordError

class MarkedUpTextChunk(abst.AbstractMongoRecord):
    """
    MarkedUpTextChunk objects define the quotations and links inside Sefaria texts
    Probably, every Quoting Commentary will have a MarkedUpTextChunk object
    """
    collection = "marked_up_text_chunks"
    criteria_field = "ref"
    track_pkeys = True
    pkeys = ["ref", "versionTitle", "language"]

    required_attrs = [
        "ref",
        "versionTitle",
        "language",
        "spans"
    ]

    attr_schemas = {
        "ref": {"type": "string", "required": True},
        "versionTitle": {"type": "string", "required": True},
        "language": {"type": "string", "allowed": ["en", "he"], "required": True},
        "spans": {
            "type": "list",
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
                        "allowed": ["quote", "citation"],
                        "required": True
                    },
                    "ref": {"type": "string", "required": True}
                }
            },
            "required": True
        }
    }


    def _validate(self):
        super()._validate()
        oref = Ref(self.ref)
        if not oref.is_segment_level():
            raise InputError(type(self).__name__ + "._validate(): Ref must be at segment level: " + str(oref))
        tc = TextChunk(oref, lang=self.language, vtitle=self.versionTitle)

        if not tc.text:
            raise InputError(type(self).__name__ + "._validate(): Corresponding TextChunk is empty")

        # Enforce uniqueness
        pkey_query = {}
        for key in self.pkeys:
            value = getattr(self, key, None)
            if value is None:
                raise InputError(f"{type(self).__name__}._validate(): Missing value for primary key: {key}")
            pkey_query[key] = value

        existing = self.load(pkey_query)
        if existing:
            raise DuplicateRecordError(f"{type(self).__name__}._validate(): Duplicate primary key (ref, language, versionTitle)")

        for span in self.spans:
            text = tc.text
            citation_text = text[span['charRange'][0]:span['charRange'][1]]
            if citation_text != span['text']:
                raise InputError(f"{type(self).__name__}._validate(): Span text does not match the text in the corresponding TextChunk for {span['ref']}")

        return True

    def _normalize(self):
        self.ref = Ref(self.ref).normal()
        for span in self.spans:
            span['ref'] = Ref(span['ref']).normal()

    def __str__(self):
        return "TextSpan: {}".format(self.ref)
