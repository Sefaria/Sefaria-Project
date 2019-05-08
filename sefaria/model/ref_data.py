from . import abstract as abst

class RefData(abst.AbstractMongoRecord):
    """
    A segment ref with stats
    """
    collection = 'ref_data'
    DEFAULT_PAGERANK = 1.0
    DEFAULT_SHEETRANK = (1.0 / 5) ** 2
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
