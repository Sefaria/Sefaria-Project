# coding=utf-8
from . import abstract as abst
from . import text
import structlog
logger = structlog.get_logger(__name__)


class Passage(abst.AbstractMongoRecord):
    """
    Sugyot
    """
    collection = 'passage'

    required_attrs = [
        "full_ref",  # ""
        "type",     # "Mishnah" or "Sugya"
        "ref_list"   # []
    ]
    optional_attrs = [
        "same_as"    # []
    ]

    @classmethod
    def containing_segment(cls, ref):
        assert isinstance(ref, text.Ref)
        assert ref.is_segment_level()
        return cls().load({"ref_list": ref.starting_ref().normal()})

    def _normalize(self):
        super(Passage, self)._normalize()
        self.ref_list = [r.normal() for r in self.ref().range_list()]
        if type == "Mishnah":
            pass
            # Look up mishnah-in-talmud links for this mishnah, get the Mishnah location and put in sameAs

    def _validate(self):
        super(Passage, self)._validate()
        assert self.type == "Mishnah" or self.type == "Sugya"

    def ref(self):
        return text.Ref(self.full_ref)


class PassageSet(abst.AbstractMongoSet):
    recordClass = Passage


