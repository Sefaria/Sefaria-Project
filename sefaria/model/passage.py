# coding=utf-8
from . import abstract as abst
from . import text
import structlog
from sefaria.model.linker.has_match_template import MatchTemplateMixin
logger = structlog.get_logger(__name__)


class Passage(abst.AbstractMongoRecord, MatchTemplateMixin):
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
        "same_as",    # []
        "source",
        "match_templates",
    ]

    possible_types = ["Mishnah", "Sugya", "passage", "biblical-story"]

    @classmethod
    def containing_segment(cls, ref):
        #get shortest passage containing this segment ref
        assert isinstance(ref, text.Ref)
        assert ref.is_segment_level()
        passages = PassageSet({"ref_list": ref.starting_ref().normal()})
        return min(passages, key=lambda passage: len(passage.ref_list)) if passages else None

    def _normalize(self):
        super(Passage, self)._normalize()
        self.ref_list = [r.normal() for r in self.ref().range_list()]
        if type == "Mishnah":
            pass
            # Look up mishnah-in-talmud links for this mishnah, get the Mishnah location and put in sameAs

    def _validate(self):
        super(Passage, self)._validate()
        assert self.type in self.possible_types

    def ref(self):
        return text.Ref(self.full_ref)


class PassageSet(abst.AbstractMongoSet):
    recordClass = Passage


