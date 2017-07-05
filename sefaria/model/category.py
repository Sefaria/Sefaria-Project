# -*- coding: utf-8 -*-

from . import abstract as abstract
from . import schema as schema


class Category(schema.AbstractTitledRecord):
    collection = 'category'

    track_pkeys = True

    pkeys = ["lastPath"]  # Needed for dependency tracking
    required_attrs = ["titles", "lastPath", "path"]
    optional_attrs = ["enDesc", "heDesc"]

    def change_key_name(self, name):
        self.lastPath = name
        self.path[-1] = name
        self.add_title(name, "en", True, True)

    def _validate(self):
        assert self.lastPath == self.path[-1] == self.get_primary_title("en"), "Category name not matching"

    def get_toc_object(self):
        from sefaria.model import library
        toc_tree = library.get_toc_tree()
        toc_tree.lookup_category(self.path)


class CategorySet(abstract.AbstractMongoSet):
    recordClass = Category



def process_category_name_change_in_categories(changed_cat, **kwargs):
    pass

def process_category_name_change_in_indexes(changed_cat, **kwargs):
    pass








def process_group_name_change_in_sheets(group, **kwargs):
    """
    When a group's name changes, update all the sheets in this group to follow
    """
    from sefaria.system.database import db

    db.sheets.update_many({"group": kwargs["old"]}, {"$set": {"group": kwargs["new"]}})