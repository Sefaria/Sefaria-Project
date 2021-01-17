# -*- coding: utf-8 -*-
"""
summaries.py - create and manage Table of Contents document for all texts

Writes to MongoDB Collection: summaries
"""
from sefaria.system.database import db
from sefaria.utils.hebrew import hebrew_term
from .model import *
from .model.category import CATEGORY_ORDER, TOP_CATEGORIES, REVERSE_ORDER
import logging
logger = logging.getLogger(__name__)

# Called from Library.get_search_filter_toc
def update_search_filter_table_of_contents():
    search_toc = []
    # Add an entry for every text we know about
    indices = IndexSet()
    for i in indices:
        if i.categories and i.categories[0] == "_unlisted":  # For the dummy sheet Index record
            continue
        cats = get_toc_categories(i, for_search=True)
        node = get_or_make_summary_node(search_toc, cats)
        text_dict = i.slim_toc_contents()
        node.append(text_dict)
    # Recursively sort categories and texts
    return sort_toc_node(search_toc, recur=True)

# Called internally from
# update_search_filter_table_of_contents
# update_title_in_toc
def get_toc_categories(index_obj, for_search=False):
    cats = index_obj.categories[:]
    if cats[0] not in TOP_CATEGORIES:
        cats.insert(0, "Other")
    if for_search and getattr(index_obj, "dependence", None) == 'Commentary':
        try:
            cats.remove('Commentary')
        except ValueError as e:
            pass
        cats[0] += " Commentaries"  # this will create an additional bucket for each top level category's commentary

    return cats

# Called from Library.delete_index_from_toc
def recur_delete_element_from_toc(bookname, toc):
    for toc_elem in toc:
        #base element, a text- check if title matches.
        if 'title' in toc_elem:
            if toc_elem['title'] == bookname:
                #if there is a match, append to this recursion's list of results.
                toc_elem['to_delete'] = True
        #category
        elif 'category' in toc_elem:
            #first go down the tree
            toc_elem['contents'][:] = [x for x in recur_delete_element_from_toc(bookname, toc_elem['contents']) if not 'to_delete' in x]
            #add the current category name to any already-found results (since at this point we are on our way up from the recursion.
            if not len(toc_elem['contents']):
                toc_elem['to_delete'] = True
    return toc

# Called from Library.update_index_in_toc and Library.recount_index_in_toc
def update_title_in_toc(toc, index, old_ref=None, recount=True, for_search=False):
    """
    Update text summary docs to account for change or insertion of 'text'
    * recount - whether or not to perform a new count of available text
    """
    text = index.toc_contents() if not for_search else index.slim_toc_contents()
    cats = get_toc_categories(index, for_search=for_search)

    if recount:
        VersionState(index.title).refresh()

    node = get_or_make_summary_node(toc, cats)

    found = False
    test_title = old_ref or text["title"]
    for item in node:
        if item.get("title") == test_title:
            item.update(text)
            found = True
            break
    if not found:
        node.append(text)
        node[:] = sort_toc_node(node)

    return toc


# used locally in:
# update_title_in_toc
# update_search_filter_table_of_contents
def get_or_make_summary_node(summary, nodes, contents_only=True, make_if_not_found=True):
    """
    Returns the node in 'summary' that is named by the list of categories in 'nodes',
    If make_if_not_found is true, creates the node if it doesn't exist.
    Used recursively on sub-summaries.
    """
    if len(nodes) == 1:
    #  Basecase, only need to search through one level
        for node in summary:
            if node.get("category") == nodes[0]:
                return node["contents"] if contents_only else node
        # we didn't find it, so let's add it
        if make_if_not_found:
            summary.append({"category": nodes[0], "heCategory": hebrew_term(nodes[0]), "contents": []})
            return summary[-1]["contents"] if contents_only else summary[-1]
        else:
            return None

    # Look for the first category, or add it, then recur
    for node in summary:
        if node.get("category") == nodes[0]:
            return get_or_make_summary_node(node["contents"], nodes[1:], contents_only=contents_only, make_if_not_found=make_if_not_found)

    if make_if_not_found:
        summary.append({"category": nodes[0], "heCategory": hebrew_term(nodes[0]), "contents": []})
        return get_or_make_summary_node(summary[-1]["contents"], nodes[1:], contents_only=contents_only, make_if_not_found=make_if_not_found)
    else:
        return None

# used locally in sort_toc_node
def node_sort_key(a):
    """
    Sort function for texts/categories per below.
    Return sort key as tuple:  (isString, value)

    """
    if "category" in a:
        try:
            return False, CATEGORY_ORDER.index(a["category"])
        except ValueError:
            temp_cat_name = a["category"].replace(" Commentaries", "")
            if temp_cat_name in TOP_CATEGORIES:
                return False, CATEGORY_ORDER.index(temp_cat_name) + 0.5
            return True, 'zz' + a["category"]
    elif "title" in a:
        try:
            return False, CATEGORY_ORDER.index(a["title"])
        except ValueError:
            if "order" in a:
                return False, a["order"]
            else:
                return True, a["title"]

    return False, 9999


# used locally in
# update_title_in_toc
# update_search_filter_table_of_contents
def sort_toc_node(node, recur=False):
    """
    Sort the texts and categories in node according to:
    1. the order of categories and texts listed in the global var 'order'
    2. the order field on a text
    3. alphabetically

    If 'recur', call sort_toc_node on each category in 'node' as well.
    """
    if all([ca.get("base_text_order") for ca in node]):
        node = sorted(node, key=lambda c: c["base_text_order"])
    else:
        node = sorted(node, key=node_sort_key)
        node = sorted(node, key=lambda a: 'zzz' + a["category"] if "category" in a and a["category"] in REVERSE_ORDER else 'a')

    if recur:
        for cat in node:
            if "category" in cat:
                cat["contents"] = sort_toc_node(cat["contents"], recur=True)

    return node


# next three are to deprecate.  Used only in workflows.py
# used in workflows.py - next_untranslated_text_in_category
def get_texts_summaries_for_category(category):
    """
    Returns the list of texts records in the table of contents corresponding to "category".
    """
    toc = library.get_toc()
    matched_category = find_category_node(category, toc)
    if matched_category:
        return extract_text_records_from_toc(matched_category["contents"])

# used locally in get_texts_summaries_for_category
def find_category_node(category, toc):
    matched_category_elem = None
    for elem in toc:
        if "category" in elem:
            if elem["category"] == category:
                matched_category_elem = elem
                break
            else:
                matched_category_elem = find_category_node(category, elem["contents"])
                if matched_category_elem:
                    break
    return matched_category_elem

# used locally in get_texts_summaries_for_category
def extract_text_records_from_toc(toc):
    summary = []
    for elem in toc:
        if "category" in elem:
            summary += extract_text_records_from_toc(elem["contents"])
        else:
            summary += [elem]
    return summary
