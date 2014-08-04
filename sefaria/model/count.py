"""
count.py
Writes to MongoDB Collection: counts
"""
import sefaria.model.abstract as abst
import sefaria.model.index


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


def process_index_title_change_in_counts(old, new):
    c = Count().load_by_query({"title": old})
    if getattr(c, "_id", None):
        c.title = new
        c.save()

abst.subscribe(sefaria.model.index.Index, "title", process_index_title_change_in_counts)
