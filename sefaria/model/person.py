"""
Person.py
Writes to MongoDB Collection: links
"""

from . import abstract as abst
from . import schema

import logging
logger = logging.getLogger(__name__)


class Person(abst.AbstractMongoRecord):
    """
    Homo Sapiens
    """
    collection = 'person'
    name_group = None

    required_attrs = [
        "names"
    ]
    optional_attrs = [
        "era"
    ]

    # Names
    # This is the same as on TimePeriod, and very similar to Terms - abstract out
    def _set_derived_attributes(self):
        if getattr(self, "names", None):
            self.set_names(self.names)

    def set_names(self, names):
        self.name_group = schema.TitleGroup(names)

    def _normalize(self):
        self.names = self.name_group.titles

    def all_names(self, lang=None):
        return self.name_group.all_titles(lang)

    def primary_name(self, lang=None):
        return self.name_group.primary_title(lang)

    def secondary_names(self, lang=None):
        return self.name_group.secondary_titles(lang)

    # Dates



class PersonSet(abst.AbstractMongoSet):
    recordClass = Person



"""
def process_index_title_change_in_gardens(indx, **kwargs):
    if indx.is_commentary():
        pattern = r'^{} on '.format(re.escape(kwargs["old"]))
    else:
        commentators = text.IndexSet({"categories.0": "Commentary"}).distinct("title")
        pattern = ur"(^{} \d)|(^({}) on {} \d)".format(re.escape(kwargs["old"]), "|".join(commentators), re.escape(kwargs["old"]))
        #pattern = r'(^{} \d)|( on {} \d)'.format(re.escape(kwargs["old"]), re.escape(kwargs["old"]))
    links = LinkSet({"refs": {"$regex": pattern}})
    for l in links:
        l.refs = [r.replace(kwargs["old"], kwargs["new"], 1) if re.search(pattern, r) else r for r in l.refs]
        try:
            l.save()
        except InputError: #todo: this belongs in a better place - perhaps in abstract
            logger.warning("Deleting link that failed to save: {} {}".format(l.refs[0], l.refs[1]))
            l.delete()


def process_index_delete_in_gardens(indx, **kwargs):
    if indx.is_commentary():
        pattern = ur'^{} on '.format(re.escape(indx.title))
    else:
        commentators = text.IndexSet({"categories.0": "Commentary"}).distinct("title")
        pattern = ur"(^{} \d)|^({}) on {} \d".format(re.escape(indx.title), "|".join(commentators), re.escape(indx.title))
    LinkSet({"refs": {"$regex": pattern}}).delete()
"""