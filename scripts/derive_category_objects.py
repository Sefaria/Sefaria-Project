# -*- coding: utf-8 -*-

from sefaria.model import *
from sefaria.summaries import update_table_of_contents, toc_serial_to_objects


def visit_structure(treenode, callback, order=None, **kwargs):
    """
    Tree visitor for traversing existing structure nodes of content trees and passing them to callback.
    Traverses from bottom up, with intention that this be used to aggregate content from content nodes up.
    Modifies contents in place.
    :param treenode:
    :param callback:
    :param order:
    :param kwargs:
    :return:
    """
    if treenode.children:
        for i, node in enumerate(treenode.children):
            visit_structure(node, callback, i, **kwargs)
        if order is not None:  # skip root
            callback(treenode, **kwargs)


def create_category(treenode):
    c = Category()
    c.add_primary_titles(treenode.primary_title("en"), treenode.primary_title("he"))
    c.path = treenode.full_path
    c.lastPath = treenode.full_path[-1]
    c.save()

serial_toc = update_table_of_contents()
toctree = toc_serial_to_objects(serial_toc)
visit_structure(toctree, create_category)