# coding=utf-8
from . import abstract as abst
from . import text
import logging
logger = logging.getLogger(__name__)


class Passage(abst.AbstractMongoRecord):
    """
    Homo Sapiens
    """
    collection = 'passage'

    required_attrs = [
        "fullRef",  # ""
        "type",     # "Mishnah" or "Sugya"
        "refList"   # []
    ]
    optional_attrs = [
        "sameAs"    # []
    ]

    def _normalize(self):
        super(Passage, self)._normalize()
        self.refList = [r.normal for r in self.ref().range_list()]
        if type == "Mishnah":
            pass
            # Look up mishnah-in-talmud links for this mishnah, get the Mishnah location and put in sameAs

    def _validate(self):
        super(Passage, self)._validate()
        assert self.type == "Mishnah" or self.type == "Sugya"

    def ref(self):
        return text.Ref(self.fullRef)


class PassageSet(abst.AbstractMongoSet):
    recordClass = Passage


