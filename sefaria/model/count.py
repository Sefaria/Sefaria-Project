"""
count.py
Writes to MongoDB Collection: counts
"""
from . import abstract as abst
import sefaria.datatype.jagged_array as ja

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
        "estimatedCompleteness",
        "flags",
        "allVersionCounts"
    ]

    def _set_derived_attributes(self):
        from . import text
        if getattr(self, "title", None):
            indx = text.get_index(self.title)
            attrs = indx.contents()
            #del attrs["_id"]
            self.index_attr_keys = attrs.keys()
            self.__dict__.update(attrs)
        #todo: this needs to be considered.  What happens when the data is modified? etc.
        if getattr(self, "allVersionCounts", None) is not None:
            self._allVersionCountsJA = ja.JaggedCountArray(self.allVersionCounts)

    #remove uneccesary and dangerous categories attr from text counts
    #This assumes that category nodes have no title element
    #todo: review this. Do we need to subclass text and category counts?
    def _saveable_attr_keys(self):
        attrs = super(Count, self)._saveable_attr_keys()
        if "title" in attrs and "categories" in attrs:
            attrs.remove("categories")
        return attrs

    def contents(self):
        attrs = super(Count, self).contents()
        for key in self.index_attr_keys:
            attrs[key] = getattr(self, key, None)
        #del attrs["_id"]  # nothing needs _id?  Can we push this up to the super?
        return attrs

    def next_address(self, starting_points=None):
        starting_points = starting_points or []
        if len(starting_points) > 0:
            starting_points[-1] += 1
        return self._allVersionCountsJA.next_index(starting_points)

    def prev_address(self, starting_points=None):
        starting_points = starting_points or []
        if len(starting_points) > 0:
            starting_points[-1] -= 1
        return self._allVersionCountsJA.prev_index(starting_points)

    def section_length(self, section_number):
        """
        :param section_number: The 1-based section number (E.g. Chapter 5 is section_number 5)
        :return: The length of that section
        """
        return self._allVersionCountsJA.sub_array_length(section_number - 1)


class CountSet(abst.AbstractMongoSet):
    recordClass = Count




def process_index_delete_in_counts(indx, **kwargs):
    CountSet({"title":indx.title}).delete()
