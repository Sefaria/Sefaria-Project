"""
count.py
Writes to MongoDB Collection: counts
"""
import logging
logger = logging.getLogger(__name__)

from . import abstract as abst
import sefaria.datatype.jagged_array as ja
from sefaria.system.exceptions import BookNameError


class Count(abst.AbstractMongoRecord):
    """
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
            try:
                indx = text.library.get_index(self.title)
                attrs = indx.contents()
                #del attrs["_id"]
                self.index_attr_keys = attrs.keys()
                self.__dict__.update(attrs)
            except BookNameError as e:
                logger.warning(u"Count object failed to get Index for {} : {} Normal right after Index name change.".format(self.title, e))

        #todo: this needs to be considered.  What happens when the data is modified? etc.
        if getattr(self, "allVersionCounts", None) is not None:
            self._allVersionCountsJA = ja.JaggedIntArray(self.allVersionCounts)

    #remove uneccesary and dangerous categories attr from text counts
    #This assumes that category nodes have no title element
    #todo: review this. Do we need to subclass text and category counts?
    def _saveable_attr_keys(self):
        attrs = super(Count, self)._saveable_attr_keys()
        if getattr(self, "title", None):
            attrs.remove("categories")
        return attrs

    def contents(self, **kwargs):
        attrs = super(Count, self).contents()
        for key in self.index_attr_keys:
            attrs[key] = getattr(self, key, None)
        return attrs

    #deprecated  - use JA directly
    def next_address(self, starting_points=None):
        starting_points = starting_points or []
        if len(starting_points) > 0:
            starting_points[-1] += 1
        return self._allVersionCountsJA.next_index(starting_points)

    #deprecated  - use JA directly
    def prev_address(self, starting_points=None):
        starting_points = starting_points or []
        if len(starting_points) > 0:
            starting_points[-1] -= 1
        return self._allVersionCountsJA.prev_index(starting_points)

    #deprecated  - use JA directly
    def section_length(self, section_numbers):
        """
        :param section_numbers: The list of 1-based (E.g. Chapter 5 is section_number 5) section numbers
        :return: The length of that section
        """
        return self._allVersionCountsJA.sub_array_length([s - 1 for s in section_numbers])


class CountSet(abst.AbstractMongoSet):
    recordClass = Count


def process_index_delete_in_counts(indx, **kwargs):
    CountSet({"title":indx.title}).delete()
