import math

from . import abstract as abst
from . import text
from sefaria.system.exceptions import InputError

import structlog
logger = structlog.get_logger(__name__)


class RefData(abst.AbstractMongoRecord):
    """
    A segment ref with stats
    """
    collection = 'ref_data'
    DEFAULT_PAGERANK = 1.0
    DEFAULT_SHEETRANK = (1.0 / 5) ** 2
    DEFAULT_PAGESHEETRANK = DEFAULT_PAGERANK * DEFAULT_SHEETRANK
    required_attrs = [
        "ref",           # segment ref
        "pagesheetrank", # pagesheetrank value for segment ref
    ]

    def inverse_pagesheetrank(self):
        # returns float which is inversely proportional to pr, on a log-scale
        PR_MAX_CUTOFF = 70000
        MIN_PR = 0.1
        return 1.0 / (math.log(self.pagesheetrank) - math.log(MIN_PR)) if self.pagesheetrank < PR_MAX_CUTOFF else 0.0


class RefDataSet(abst.AbstractMongoSet):
    recordClass = RefData

    @classmethod
    def from_ref(cls, ref):
        all_refs = [r.normal() for r in ref.all_segment_refs()]
        return cls({"ref": {"$in": all_refs}})

    def top(self, n):
        return sorted(self, key=lambda rd: rd.pagesheetrank, reverse=True)[0:n]

    def nth_ref(self, n):
        return text.Ref(self.top(n)[-1].ref)

    def top_ref(self):
        return self.nth_ref(1)


def process_index_title_change_in_ref_data(indx, **kwargs):
    print("Cascading Ref Data from {} to {}".format(kwargs['old'], kwargs['new']))

    # ensure that the regex library we're using here is the same regex library being used in `Ref.regex`
    from .text import re as reg_reg
    patterns = [pattern.replace(reg_reg.escape(indx.title), reg_reg.escape(kwargs["old"]))
                for pattern in text.Ref(indx.title).regex(as_list=True)]
    queries = [{'ref': {'$regex': pattern}} for pattern in patterns]
    objs = RefDataSet({"$or": queries})
    for o in objs:
        o.ref = o.ref.replace(kwargs["old"], kwargs["new"], 1)
        try:
            o.save()
        except InputError:
            logger.warning("Failed to convert ref data from: {} to {}".format(kwargs['old'], kwargs['new']))


def process_index_delete_in_ref_data(indx, **kwargs):
    from sefaria.model.text import prepare_index_regex_for_dependency_process
    pattern = prepare_index_regex_for_dependency_process(indx)
    RefDataSet({"ref": {"$regex": pattern}}).delete()
