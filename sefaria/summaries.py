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


# Giant list ordering or categories
# indentation and inclusion of duplicate categories (like "Seder Moed")
# is for readability only. The table of contents will follow this structure.
ORDER = [
    "Tanach",
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
    "Tosefta",
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
        'Piyutim',
    'Philosophy',
    'Parshanut',
    'Chasidut',
    'Musar',
    'Responsa',
        "Rashba",
        "Rambam",
    'Apocrypha',
    'Elucidation',
    'Modern Works',
    'Other',
]

REORDER_RULES = {
    "Commentary2": ["Commentary"],
    #"Targum":      ["Tanach", "Targum"]
}


def get_toc():
    """
    Returns table of contents object from cache,
    DB or by generating it, as needed.
    """
    toc_cache = scache.get_cache_elem('toc_cache')
    if toc_cache:
        return toc_cache

    toc = get_toc_from_db()
    if toc:
        save_toc(toc)
        return toc

    return update_table_of_contents()


def get_toc_json():
    """
    Returns JSON representation of TOC.
    """
    toc_json = scache.get_cache_elem('toc_json_cache')
    if toc_json:
        return toc_json
    toc = get_toc()
    toc_json = json.dumps(toc)
    scache.set_cache_elem('toc_json_cache', toc_json, 600000)
    return toc_json


def save_toc(toc):
    """
    Saves the table of contents object to in-memory cache,
    invalidtes texts_list cache.
    """
    scache.set_cache_elem('toc_cache', toc, 600000)
    scache.delete_template_cache("texts_list")
    scache.delete_template_cache("texts_dashboard")
    library.local_cache.pop("category_id_dict", None)


def get_toc_from_db():
    """
    Retrieves the table of contents stored in MongoDB.
    """
    toc = db.summaries.find_one({"name": "toc"})
    return toc["contents"] if toc else None


def save_toc_to_db():
    """
    Saves table of contents to MongoDB.
    (This write can be slow.)
    """
    db.summaries.remove()
    toc_doc = {
        "name": "toc",
        "contents": scache.get_cache_elem('toc_cache'),
        "dateSaved": datetime.now(),
    }
    db.summaries.save(toc_doc)


def update_table_of_contents():
    toc = []

    # Add an entry for every text we know about
    indices = IndexSet()
    for i in indices:
        print i.categories
        if i.is_commentary():
            # Special case commentary below
            continue
        if i.categories[0] in REORDER_RULES:
            i.categories = REORDER_RULES[i.categories[0]] + i.categories[1:]
            if i.categories[0] == "Commentary":
                i.categories[0], i.categories[1] = i.categories[1], i.categories[0]
        if i.categories[0] not in ORDER:
            i.categories.insert(0, "Other")

        node = get_or_make_summary_node(toc, i.categories)
        text = add_counts_to_index(i.toc_contents())
        node.append(text)

    # Special handling to list available commentary texts which do not have
    # individual index records
    commentary_texts = library.get_commentary_version_titles()
    for c in commentary_texts:

        try:
            i = get_index(c)
        except BookNameError:
            continue

        if len(i.categories) >= 1 and i.categories[0] == "Commentary":
            cats = i.categories[1:2] + ["Commentary"] + i.categories[2:]
        else:
            cats = i.categories[0:1] + ["Commentary"] + i.categories[1:]

        node = get_or_make_summary_node(toc, cats)
        text = add_counts_to_index(i.toc_contents())
        node.append(text)


    # Recursively sort categories and texts
    toc = sort_toc_node(toc, recur=True)

    save_toc(toc)
    save_toc_to_db()

    return toc


def update_summaries_on_delete(ref, toc = None):
    """
    Deletes a title from the ToC
    :param ref: really the title of a book in the ToC
    """
    toc = recur_delete_element_from_toc(ref, get_toc())
    save_toc(toc)
    save_toc_to_db()


def recur_delete_element_from_toc(ref, toc):
    for toc_elem in toc:
        #base element, a text- check if title matches.
        if 'title' in toc_elem:
            if toc_elem['title'] == ref:
                #if there is a match, append to this recursion's list of results.
                toc_elem['to_delete'] = True
        #category
        elif 'category' in toc_elem:
            #first go down the tree
            toc_elem['contents'][:] = [x for x in recur_delete_element_from_toc(ref, toc_elem['contents']) if not 'to_delete' in x]
            #add the current category name to any already-found results (since at this point we are on our way up from the recursion.
            if not len(toc_elem['contents']):
                toc_elem['to_delete'] = True
    return toc


def make_simple_index_dict(index):
    if not index.is_new_style() or index.is_commentary():
        indx_dict = {
            "title": index.title,
            "heTitle": index.heTitle,
            "categories": index.categories
        }
    else:
        indx_dict = {
            "title": index.nodes.primary_title("en"),
            "heTitle": index.nodes.primary_title("he"),
            "categories": index.categories
        }
    return indx_dict


def update_summaries_on_change(bookname, old_ref=None, recount=True):
    """
    Update text summary docs to account for change or insertion of 'text'
    * recount - whether or not to perform a new count of available text
    """
    index = get_index(bookname)

    indx_dict = index.toc_contents()

    if recount:
        #counts.update_full_text_count(bookname)
        VersionState(bookname).refresh()
    toc = get_toc()
    resort_other = False

    if indx_dict["categories"][0] in REORDER_RULES:
        indx_dict["categories"] = REORDER_RULES[indx_dict["categories"][0]] + indx_dict["categories"][1:]

    if indx_dict["categories"][0] != "Commentary":
        if indx_dict["categories"][0] not in ORDER:
            indx_dict["categories"].insert(0, "Other")
            resort_other = True
        node = get_or_make_summary_node(toc, indx_dict["categories"])
        text = add_counts_to_index(indx_dict)
    else:
        cats = indx_dict["categories"][1:2] + ["Commentary"] + indx_dict["categories"][2:]
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

    # If a new category may have been added to other, resort the cateogries
    if resort_other:
        toc[-1]["contents"] = sort_toc_node(toc[-1]["contents"])

    save_toc(toc)
    save_toc_to_db()


def update_summaries():
    """
    Update all stored documents which summarize known and available texts
    """
    update_table_of_contents()
    scache.reset_texts_cache()


def get_or_make_summary_node(summary, nodes):
    """
    Returns the node in 'summary' that is named by the list of categories in 'nodes',
    creates the node if it doesn't exist.
    Used recursively on sub-summaries.
    """
    if len(nodes) == 1:
    # Basecase, only need to search through on level
        for node in summary:
            if node.get("category") == nodes[0]:
                return node["contents"]
        # we didn't find it, so let's add it
        summary.append({"category": nodes[0], "heCategory": hebrew_term(nodes[0]), "contents": []})
        return summary[-1]["contents"]

    # Look for the first category, or add it, then recur
    for node in summary:
        if node.get("category") == nodes[0]:
            return get_or_make_summary_node(node["contents"], nodes[1:])
    summary.append({"category": nodes[0], "heCategory": hebrew_term(nodes[0]), "contents": []})
    return get_or_make_summary_node(summary[-1]["contents"], nodes[1:])


def add_counts_to_index(indx_dict):
    """
    Returns a dictionary representing a text which includes index info,
    and text counts.
    """
    vs = StateNode(indx_dict["title"])
    indx_dict["sparseness"] = max(vs.get_sparseness("he"), vs.get_sparseness("en"))
    return indx_dict

'''
#not currently used
#todo: category counts
def add_counts_to_category(cat, parents=[]):
    """
    Recursively annotate catetory 'cat' as well as any subcategories with count info.
    - parent - optionally specficfy parent categories so that e.g, Seder Zeraim in Mishnah
    can be diffentiated from Seder Zeraim in Talmud.

    Adds the fields to cat:
    * availableCounts
    * textComplete
    * percentAvailable
    * num_texts
    """
    cat_list = parents + [cat["category"]]

    # Recur on any subcategories
    for subcat in cat["contents"]:
        if "category" in subcat:
            add_counts_to_category(subcat, parents=cat_list)

    counts_doc = counts.get_category_count(cat_list) or counts.count_category(cat_list)
    cat.update(counts_doc)

    # count texts in this category by summing sub counts and counting texts
    cat["num_texts"] = 0
    for item in cat["contents"]:
        if "category" in item:
            # add sub cat for a subcategory
            cat["num_texts"] += item["num_texts"]
        elif "title" in item:
            # add 1 for each indvidual text
            cat["num_texts"] += 1
'''

def node_sort_key(a):
    """
    Sort function for texts/categories per below.
    """
    if "category" in a:
        try:
            return ORDER.index(a["category"])
        except ValueError:
            # If there is a text with the exact name as this category
            # (e.g., "Bava Metzia" as commentary category)
            # sort by text's order
            i = Index().load({"title": a["category"]})
            if i and getattr(i, "order", None):
                return i.order[-1]
            else:
                return 'zz' + a["category"]
    elif "title" in a:
        try:
            return ORDER.index(a["title"])
        except ValueError:
            if "order" in a:
                return a["order"][-1]
            else:
                return a["title"]

    return None


def node_sort_sparse(a):
    if "category" in a: # Category - sort to top
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

    if recur:
        for cat in node:
            if "category" in cat:
                cat["contents"] = sort_toc_node(cat["contents"], recur=True)

    return node


def get_texts_summaries_for_category(category):
    """
    Returns the list of texts records in the table of contents corresponding to "category".
    """
    toc = get_toc()
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

    - categorie_in_titles: whether to include each category preceding a text title,
        e.g., "Tanach > Torah > Genesis".
    - version_granularity: whether to include a seperate entry for every text version.
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


def category_id_dict(toc=None, cat_head="", code_head=""):
    if toc is None:
        d = library.local_cache.get("category_id_dict")
        if not d:
            d = category_id_dict(get_toc())
            library.local_cache["category_id_dict"] = d
        return d

    d = {}

    for i, c in enumerate(toc):
        name = c["category"] if "category" in c else c["title"]
        if cat_head:
            key = "/".join([cat_head, name])
            val = code_head + format(i, '02')
        else:
            key = name
            val = "A" + format(i, '02')

        d[key] = val
        if "contents" in c:
            d.update(category_id_dict(c["contents"], key, val))

    return d

