"""
count.py
Writes to MongoDB Collection: counts
"""
import sefaria.model.abstract as abst
import sefaria.model.text as text


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

    def _set_derived_attributes(self):
        if getattr(self, "title", None):
            indx = text.get_index(self.title)
            attrs = indx.contents()
            del attrs["_id"]
            self.index_attr_keys = attrs.keys()
            self.__dict__.update(attrs)

    def contents(self):
        attrs = super(Count, self).contents()
        for key in self.index_attr_keys:
            attrs[key] = getattr(self, key, None)
        del attrs["_id"]  # nothing needs _id?  Can we push this up to the super?
        return attrs


class CountSet(abst.AbstractMongoSet):
    recordClass = Count


def process_index_title_change_in_counts(indx, **kwargs):
    c = Count().load({"title": kwargs["old"]})
    if getattr(c, "_id", None):
        c.title = kwargs["new"]
        c.save()

def process_index_delete_in_counts(indx, **kwargs):
    CountSet({"title":indx.title}).delete()
