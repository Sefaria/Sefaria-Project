"""
count.py
Writes to MongoDB Collection: counts
"""
import sefaria.model.abstract as abst


class Count(abst.AbstractMongoRecord):
    """
    A note on a specific place in a text.  May be public or private.
    """
    collection = 'counts'

    required_attrs = [
        "textComplete",
        "percentAvailable",
        "availableCounts"
    ]
    optional_attrs = [
        "categories",
        "availableTexts",
        "title",
        "linksCount",
        "sectionCounts",
        "estimatedCompleteness",
        "flags"
    ]


class CountSet(abst.AbstractMongoSet):
    recordClass = Count