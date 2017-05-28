# -*- coding: utf-8 -*-
"""
summaries.py - create and manage Table of Contents document for all texts

Writes to MongoDB Collection: summaries
"""
import json
from datetime import datetime
from pprint import pprint

import sefaria.system.cache as scache
from sefaria.system.database import db
from sefaria.utils.hebrew import hebrew_term
from model import *
from sefaria.system.exceptions import BookNameError
import logging
logger = logging.getLogger(__name__)

# Giant list ordering or categories
# indentation and inclusion of duplicate categories (like "Seder Moed")
# is for readability only. The table of contents will follow this structure.
ORDER = [
    "Tanakh",
        "Torah",
            "Genesis",
            "Exodus",
            "Leviticus",
            "Numbers",
            "Deuteronomy",
        "Prophets",
        "Writings",
        "Targum",
            'Onkelos Genesis',
            'Onkelos Exodus',
            'Onkelos Leviticus',
            'Onkelos Numbers',
            'Onkelos Deuteronomy',
            'Targum Jonathan on Genesis',
            'Targum Jonathan on Exodus',
            'Targum Jonathan on Leviticus',
            'Targum Jonathan on Numbers',
            'Targum Jonathan on Deuteronomy',
    "Mishnah",
        "Seder Zeraim",
        "Seder Moed",
        "Seder Nashim",
        "Seder Nezikin",
        "Seder Kodashim",
        "Seder Tahorot",
    "Talmud",
        "Bavli",
                "Seder Zeraim",
                "Seder Moed",
                "Seder Nashim",
                "Seder Nezikin",
                "Seder Kodashim",
                "Seder Tahorot",
        "Yerushalmi",
                "Seder Zeraim",
                "Seder Moed",
                "Seder Nashim",
                "Seder Nezikin",
                "Seder Kodashim",
                "Seder Tahorot",
        "Rif",
    "Midrash",
        "Aggadic Midrash",
            "Midrash Rabbah",
        "Halachic Midrash",
    "Tanaitic",
        "Tosefta",
            "Seder Zeraim",
            "Seder Moed",
            "Seder Nashim",
            "Seder Nezikin",
            "Seder Kodashim",
            "Seder Tahorot",
        "Masechtot Ketanot",
    "Halakhah",
        "Mishneh Torah",
            'Introduction',
            'Sefer Madda',
            'Sefer Ahavah',
            'Sefer Zemanim',
            'Sefer Nashim',
            'Sefer Kedushah',
            'Sefer Haflaah',
            'Sefer Zeraim',
            'Sefer Avodah',
            'Sefer Korbanot',
            'Sefer Taharah',
            'Sefer Nezikim',
            'Sefer Kinyan',
            'Sefer Mishpatim',
            'Sefer Shoftim',
        "Shulchan Arukh",
    "Kabbalah",
        "Zohar",
    'Liturgy',
        'Siddur',
        'Haggadah',
        'Piyutim',
    'Philosophy',
    'Parshanut',
    'Chasidut',
        "Early Works",
        "Breslov",
        "R' Tzadok HaKohen",
    'Musar',
    'Responsa',
        "Rashba",
        "Rambam",
    'Apocrypha',
    'Elucidation',
    'Modern Works',
    'Other',
]

TOP_CATEGORIES = [
    "Tanakh",
    "Mishnah",
    "Talmud",
    "Midrash",
    "Halakhah",
    "Kabbalah",
    "Liturgy",
    "Philosophy",
    "Tanaitic",
    "Chasidut",
    "Musar",
    "Responsa",
    "Apocrypha",
    "Modern Works",
    "Other"
]

REVERSE_ORDER = [
    'Commentary'  # Uch, STILL special casing commentary here... anything to be done??
]


def update_table_of_contents():
    toc = []
    sparseness_dict = get_sparesness_lookup()
    # Add an entry for every text we know about
    indices = IndexSet()
    for i in indices:
        cats = get_toc_categories(i)
        node = get_or_make_summary_node(toc, cats)
        text_dict = i.toc_contents()
        text_dict["sparseness"] = sparseness_dict[text_dict["title"]]
        node.append(text_dict)
    # Recursively sort categories and texts
    return sort_toc_node(toc, recur=True)


def update_search_filter_table_of_contents():
    search_toc = []
    sparseness_dict = get_sparesness_lookup()
    # Add an entry for every text we know about
    indices = IndexSet()
    for i in indices:
        cats = get_toc_categories(i, for_search=True)
        node = get_or_make_summary_node(search_toc, cats)
        text_dict = i.slim_toc_contents()
        text_dict["sparseness"] = sparseness_dict[text_dict["title"]]
        node.append(text_dict)
    # Recursively sort categories and texts
    return sort_toc_node(search_toc, recur=True)


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


def update_title_in_toc(toc, index, old_ref=None, recount=True, for_search=False):
    """
    Update text summary docs to account for change or insertion of 'text'
    * recount - whether or not to perform a new count of available text
    """
    resort_other = False
    indx_dict = index.toc_contents() if not for_search else index.slim_toc_contents()
    cats = get_toc_categories(index, for_search=for_search)
    """if cats[0] == "Other":
        resort_other = True"""
    if recount:
        VersionState(index.title).refresh()

    node = get_or_make_summary_node(toc, cats)
    text = add_counts_to_index(indx_dict)

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

    # If a new category may have been added to other, resort the categories
    """if resort_other:
        toc[-1]["contents"] = sort_toc_node(toc[-1]["contents"])"""

    return toc


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


def get_sparesness_lookup():
    vss = db.vstate.find({}, {"title": 1, "content._en.sparseness": 1, "content._he.sparseness": 1})
    return {vs["title"]: max(vs["content"]["_en"]["sparseness"], vs["content"]["_he"]["sparseness"]) for vs in vss}


def add_counts_to_index(indx_dict):
    """
    Returns a dictionary which decorates `indx_dict` with a spareness score.
    """
    vs = StateNode(indx_dict["title"], meta=True)
    indx_dict["sparseness"] = max(vs.get_sparseness("he"), vs.get_sparseness("en"))
    return indx_dict


def node_sort_key(a):
    """
    Sort function for texts/categories per below.
    """
    if "category" in a:
        try:
            return ORDER.index(a["category"])
        except ValueError:
            temp_cat_name = a["category"].replace(" Commentaries", "")
            if temp_cat_name in TOP_CATEGORIES:
                return ORDER.index(temp_cat_name) + 0.5
            return 'zz' + a["category"]
    elif "title" in a:
        try:
            return ORDER.index(a["title"])
        except ValueError:
            if "order" in a:
                return a["order"]
            else:
                return a["title"]

    return None


def node_sort_sparse(a):
    if "category" in a or "order" in a:
        # Keep categories or texts with explicit orders at top
        score = -4
    else:
        score = -a.get('sparseness', 1)

    return score


def sort_toc_node(node, recur=False):
    """
    Sort the texts and categories in node according to:
    1. the order of categories and texts listed in the global var 'order'
    2. the order field on a text
    3. alphabetically

    If 'recur', call sort_toc_node on each category in 'node' as well.
    """
    node = sorted(node, key=node_sort_key)
    node = sorted(node, key=node_sort_sparse)
    node = sorted(node, key=lambda a: 'zzz' + a["category"] if "category" in a and a["category"] in REVERSE_ORDER else 'a')

    if recur:
        for cat in node:
            if "category" in cat:
                cat["contents"] = sort_toc_node(cat["contents"], recur=True)

    return node


def get_texts_summaries_for_category(category):
    """
    Returns the list of texts records in the table of contents corresponding to "category".
    """
    toc = library.get_toc()
    matched_category = find_category_node(category, toc)
    if matched_category:
        return extract_text_records_from_toc(matched_category["contents"])


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


def extract_text_records_from_toc(toc):
    summary = []
    for elem in toc:
        if "category" in elem:
            summary += extract_text_records_from_toc(elem["contents"])
        else:
            summary += [elem]
    return summary


def flatten_toc(toc, include_categories=False, categories_in_titles=False, version_granularity=False):
    """
    Returns an array of strings which corresponds to each category and text in the
    Table of Contents in order.

    - categories_in_titles: whether to include each category preceding a text title,
        e.g., "Tanach > Torah > Genesis".
    - version_granularity: whether to include a separate entry for every text version.
    """
    results = []
    for x in toc:
        name = x.get("category", None) or x.get("title", None)
        if "category" in x:
            if include_categories:
                results += [name]
            subcats = flatten_toc(x["contents"], categories_in_titles=categories_in_titles)
            if categories_in_titles:
                subcats = ["%s > %s" %(name, y) for y in subcats]
            results += subcats

        elif "title" in x:
            if not version_granularity:
                results += [name]
            else:
                #versions = texts.get_version_list(name)
                versions = Ref(name).version_list()
                for v in versions:
                    lang = {"he": "Hebrew", "en": "English"}[v["language"]]
                    results += ["%s > %s > %s.json" % (name, lang, v["versionTitle"])]

    return results


""" Sketch toward object oriented TOC """


def toc_serial_to_objects(toc):
    root = TocCategory()
    root.add_title("TOC", "en", primary=True)
    root.add_title(u"שרש", "he", primary=True)
    for e in toc:
        root.append(deserialize_tree(e, struct_class=TocCategory, leaf_class=TocTextIndex, children_attr="contents"))
    return root


class TocNode(TitledTreeNode):
    """
    Abstract superclass for all TOC nodes.
    """
    langs = ["he", "en"]
    title_attrs = {
        "en": "",
        "he": ""
    }

    def __init__(self, serial=None, **kwargs):
        super(TocNode, self).__init__(serial, **kwargs)

        # remove title attributes after deserialization, so as not to mess with serial dicts.
        if serial is not None:
            for lang in self.langs:
                self.add_title(serial.get(self.title_attrs[lang]), lang, primary=True)
                delattr(self, self.title_attrs[lang])

    @property
    def full_path(self):
        return [n.primary_title("en") for n in self.ancestors()[1:]] + [self.primary_title("en")]

    # This varies a bit from the superclass. Seems not worthwhile to abstract into the superclass.
    def serialize(self, **kwargs):
        d = {}
        if self.children:
            d["contents"] = [n.serialize(**kwargs) for n in self.children]

        params = {k: getattr(self, k) for k in self.required_param_keys + self.optional_param_keys if
                  getattr(self, k, "BLANKVALUE") is not "BLANKVALUE"}
        if any(params):
            d.update(params)

        for lang in self.langs:
            d[self.title_attrs[lang]] = self.title_group.primary_title(lang)

        return d


class TocCategory(TocNode):
    """
    "category": "",
    "heCategory": hebrew_term(""),
    "contents": []
    """
    title_attrs = {
        "he": "heCategory",
        "en": "category"
    }


class TocTextIndex(TocNode):
    """
    categories: Array(2)
    dependence: false
    firstSection: "Mishnah Eruvin 1"
    heTitle: "משנה עירובין"
    order: 13
    primary_category: "Mishnah"
    sparseness: 4
    title: "Mishnah Eruvin"
    """
    optional_param_keys = [
        "categories",
        "dependence",
        "firstSection",
        "order",
        "sparseness",
        "primary_category",
        "collectiveTitle",
        "base_text_titles",
        "base_text_mapping",
        "heCollectiveTitle",
        "commentator",
        "heCommentator"
    ]
    title_attrs = {
        "en": "title",
        "he": "heTitle"
    }