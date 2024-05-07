# encoding=utf-8
import unicodecsv as csv
import io
import re

import pymongo

from sefaria.model import *
from sefaria.system.database import db
from sefaria.datatype.jagged_array import JaggedTextArray
from diff_match_patch import diff_match_patch
from functools import reduce
from sefaria.system.exceptions import InputError

import regex as re
import pprint
try:
    import xml.etree.cElementTree as ET
except ImportError:
    import xml.etree.ElementTree as ET
from sefaria.model import *
from sefaria.utils.tibetan import has_tibetan

def add_spelling(category, old, new, lang="en"):
    """
    For a given category, on every index in that title that matches 'old' create a new title with 'new' replacing 'old'
    :param category:
    :param old:
    :param new:
    :return:
    """
    indxs = library.get_indexes_in_category(category)
    for ind in indxs:
        i = library.get_index(ind)
        print()
        assert isinstance(i, Index)
        schema = i.nodes
        assert isinstance(schema, JaggedArrayNode)
        for title in schema.all_node_titles(lang):
            if old in title:
                new_title = title.replace(old, new)
                print(new_title)
                schema.add_title(new_title, lang)
                i.save()


def rename_category(old, new):
    """
    Walk through all index records, replacing every category instance
    called 'old' with 'new'.
    """
    indices = IndexSet({"categories": old})

    assert len(indices), "No categories named {}".format(old)

    for i in indices:
        i.categories = [new if cat == old else cat for cat in i.categories]
        i.save()

    # Not multiserver aware
    library.rebuild_toc()


def resize_text(title, new_structure, upsize_in_place=False):
    # todo: Needs to be converted to objects, but no usages seen in the wild.
    """
    Change text structure for text named 'title'
    to 'new_structure' (a list of strings naming section names)

    Changes index record as well as restructuring any text that is currently saved.

    When increasing size, any existing text will become the first segment of the new level
    ["One", "Two", "Three"] -> [["One"], ["Two"], ["Three"]]

    If upsize_in_place==True, existing text will stay in tact, but be wrapped in new depth:
    ["One", "Two", "Three"] -> [["One", "Two", "Three"]]

    When decreasing size, information is lost as any existing segments are concatenated with " "
    [["One1", "One2"], ["Two1", "Two2"], ["Three1", "Three2"]] - >["One1 One2", "Two1 Two2", "Three1 Three2"]

    """
    index = db.index.find_one({"title": title})
    if not index:
        return False

    old_structure = index["sectionNames"]
    index["sectionNames"] = new_structure
    db.index.save(index)

    delta = len(new_structure) - len(old_structure)
    if delta == 0:
        return True

    texts = db.texts.find({"title": title})
    for text in texts:
        if delta > 0 and upsize_in_place:
            resized = text["chapter"]
            for i in range(delta):
                resized = [resized]
        else:
            resized = JaggedTextArray(text["chapter"]).resize(delta).array()

        text["chapter"] = resized
        db.texts.save(text)

    # TODO Rewrite any existing Links
    # TODO Rewrite any exisitng History items

    library.refresh_index_record_in_cache(index)

    return True


def merge_indices(title1, title2):
    """
    Merges two similar index records
    """
    #merge the index,
    #merge history refsscript to compare mishnah vers
    #TODO: needs more error checking that the indices and versions are of the same shape. Look nto comparing two (new format) index records
    idx1 = Index().load({"title":title1})
    if not idx1:
        return {"error": "Index not found: %s" % title1 }
    idx2 = Index().load({"title":title2})
    if not idx2:
        return {"error": "Index not found: %s" % title2 }
    #we're just going to trash idx2, but make sure all it's related objects move to idx1
    text.process_index_title_change_in_versions(idx1, old=title2, new=title1)
    link.process_index_title_change_in_links(idx1, old=title2, new=title1)
    history.process_index_title_change_in_history(idx1, old=title2, new=title1)
    idx2.delete()


def merge_text_versions(version1, version2, text_title, language, warn=False):
    """
    Merges the contents of two distinct text versions.
    version2 is merged into version1 then deleted.
    Preference is giving to version1 - if both versions contain content for a given segment,
    only the content of version1 will be retained.


    History entries are rewritten for version2.
    NOTE: the history of that results will be incorrect for any case where the content of
    version2 is overwritten - the history of those overwritten edits will remain.
    To end with a perfectly accurate history, history items for segments which have been overwritten
    would need to be identified and deleted.
    """
    v1 = Version().load({"title": text_title, "versionTitle": version1, "language": language})
    if not v1:
        return {"error": "Version not found: %s" % version1 }
    v2 = Version().load({"title": text_title, "versionTitle": version2, "language": language})
    if not v2:
        return {"error": "Version not found: %s" % version2 }

    if isinstance(v1.chapter, dict) or isinstance(v2.chapter, dict):
        #raise Exception("merge_text_versions doesn't yet handle complex records")
        i1 = v1.get_index()
        i2 = v2.get_index()
        assert i1 == i2

        def content_node_merger(snode, *contents, **kwargs):
            """
            :param snode: SchemaContentNode
            :param contents: Length two array of content.  Second is merged into first and returned.
            :param kwargs: "sources": array of source names
            :return:
            """
            assert len(contents) == 2
            if warn and JaggedTextArray(contents[0]).overlaps(JaggedTextArray(contents[1])):
                raise Exception("WARNING - overlapping content in {}".format(snode.full_title()))
            merged_text, sources = merge_texts([contents[0], contents[1]], kwargs.get("sources"))
            return merged_text

        merged_text = i1.nodes.visit_content(content_node_merger, v1.chapter, v2.chapter, sources=[version1, version2])

    else:  #this could be handled with the visitor and callback, above.
        if warn and v1.ja().overlaps(v2.ja()):
            print("WARNING - %s & %s have overlapping content. Aborting." % (version1, version2))

        merged_text, sources = merge_texts([v1.chapter, v2.chapter], [version1, version2])

    v1.chapter = merged_text
    v1.save()
    history.process_version_title_change_in_history(v1, old=version2, new=version1)

    v2.delete()

    return {"status": "ok"}


def merge_multiple_text_versions(versions, text_title, language, warn=False):
    """
    Merges contents of multiple text versions listed in 'versions'
    Versions listed first in 'versions' will receive priority if there is overlap.
    """
    count = 0

    v1 = versions.pop(0)
    for v2 in versions:
        r = merge_text_versions(v1, v2, text_title, language)
        if r["status"] == "ok":
            count += 1
    return {"status": "ok", "merged": count + 1}


def merge_text_versions_by_source(text_title, language, warn=False):
    """
    Merges all texts of text_title in langauge that share the same value for versionSource.
    """
    v = VersionSet({"title": text_title, "language": language})

    for s in v.distinct("versionSource"):
        versions = VersionSet({"title": text_title, "versionSource": s, "language": language}).distinct("versionTitle")
        merge_multiple_text_versions(versions, text_title, language)


def merge_text_versions_by_language(text_title, language, warn=False):
    """
    Merges all texts of text_title in langauge.
    """
    versions = VersionSet({"title": text_title, "language": language}).distinct("versionTitle")
    merge_multiple_text_versions(versions, text_title, language)


# No usages found
def merge_text(a, b):
    """
    Merge two lists representing texts, giving preference to a, but keeping
    values froms b when a position in a is empty or non existant.

    e.g merge_text(["", "Two", "Three"], ["One", "Nope", "Nope", "Four]) ->
        ["One", "Two" "Three", "Four"]
    """
    length = max(len(a), len(b))
    out = [a[n] if n < len(a) and (a[n] or not n < len(b)) else b[n] for n in range(length)]
    return out


def modify_text_by_function(title, vtitle, lang, rewrite_function, uid, needs_rewrite_function=lambda x: True, **kwargs):
    """
    Walks ever segment contained in title, calls rewrite_function on the text and saves the result.
    rewrite_function should accept two parameters: 1) text of current segment 2) zero-indexed indices of segment
    """
    from sefaria.tracker import modify_text

    leaf_nodes = library.get_index(title).nodes.get_leaf_nodes()
    for leaf in leaf_nodes:
        oref = leaf.ref()
        ja = oref.text(lang, vtitle).ja()
        assert isinstance(ja, JaggedTextArray)
        modified_text = ja.modify_by_function(rewrite_function)
        if needs_rewrite_function(ja.array()):
            modify_text(uid, oref, vtitle, lang, modified_text, **kwargs)


def modify_many_texts_and_make_report(rewrite_function, versions_query=None, return_zeros=False):
    """
    Uses pymongo because iterating and saving all texts as Version is heavy.
    That means - be CAREFUL with that.

    :param rewrite_function(string) -> (string, int of times that string has been replaced)
    :param versions_query - query dict for VersionSet, or None for all
    :param return_zeros - bool whether you want cases of 0 replaces in report
    :returns a csv writer with index title, versionTitle, and number of replacements
    """
    def replace_in_text_object(text_obj):
        total = 0
        if isinstance(text_obj, dict):
            for key in text_obj:
                text_obj[key], num = replace_in_text_object(text_obj[key])
                total += num
        elif isinstance(text_obj, list):
            for i, _ in enumerate(text_obj):
                text_obj[i], num = replace_in_text_object(text_obj[i])
                total += num
        elif isinstance(text_obj, str):
            return rewrite_function(text_obj)
        return text_obj, total
    texts_collection = db.texts
    versions_to_change = texts_collection.find(versions_query)
    bulk_operations = []
    output = io.BytesIO()
    report = csv.writer(output)
    report.writerow(['index', 'versionTitle', 'replaces number'])
    for version in versions_to_change:
        new_text, replaces = replace_in_text_object(version['chapter'])
        if replaces or return_zeros:
            report.writerow([version['title'], version['versionTitle'], replaces])
        if replaces:
            bulk_operations.append(pymongo.UpdateOne(
                {'_id': version['_id']},
                {'$set': {'chapter': new_text}}
            ))
    if bulk_operations:
        texts_collection.bulk_write(bulk_operations)
    return output.getvalue()


def split_text_section(oref, lang, old_version_title, new_version_title):
    """
    Splits the text in `old_version_title` so that the content covered by `oref` now appears in `new_version_title`.
    Rewrites history for affected content. 

    NOTE: `oref` cannot be ranging (until we implement saving ranging refs on TextChunk). Spanning refs are handled recursively.
    """
    if oref.is_spanning():
        for span in oref.split_spanning_ref():
            split_text_section(span, lang, old_version_title, new_version_title)
        return

    old_chunk = TextChunk(oref, lang=lang, vtitle=old_version_title)
    new_chunk = TextChunk(oref, lang=lang, vtitle=new_version_title)

    # Copy content to new version
    new_chunk.versionSource = old_chunk.version().versionSource
    new_chunk.text = old_chunk.text
    new_chunk.save()

    # Rewrite History
    ref_regex_queries = [{"ref": {"$regex": r}, "version": old_version_title, "language": lang} for r in oref.regex(as_list=True)]
    query = {"$or": ref_regex_queries}
    db.history.update(query, {"$set": {"version": new_version_title}}, upsert=False, multi=True)

    # Remove content from old version
    old_chunk.text = JaggedTextArray(old_chunk.text).constant_mask(constant="").array()
    old_chunk.save()


def find_and_replace_in_text(title, vtitle, lang, find_string, replace_string, uid):
    """
    Replaces all instances of `find_string` with `replace_string` in the text specified by `title` / `vtitle` / `lang`.
    Changes are attributed to the user with `uid`. 
    """
    def replacer(text, sections):
        return text.replace(find_string, replace_string)

    modify_text_by_function(title, vtitle, lang, replacer, uid)


def replace_roman_numerals(text, allow_lowercase=False, only_lowercase=False):
    """
    Replaces any roman numerals in 'text' with digits.
    Currently only looks for a roman numeral followed by a comma or period, then a space, then a digit.
    e.g. (Isa. Iv. 10) --> (Isa. 4:10)

    WARNING: we've seen e.g., "(v. 15)" used to mean "Verse 15". If run with allow_lowercase=True, this will
    be rewritten as "(5:15)". 
    """
    import roman
    if only_lowercase:
        regex = re.compile(r"((^|[{\[( ])[{\[( ]*)(m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3}))(\. ?)(\d)?")
    else:
        flag = re.I if allow_lowercase else 0
        regex = re.compile(r"((^|[{\[( ])[{\[( ]*)(M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3}))($|[.,;\])}: ]+)(\d)?", flag)

    def replace_roman_numerals_in_match(m):
        s = m.group(3)
        s = s.upper()
        try:
            if s:
                if m.group(8):    
                    return "{}{}:{}".format(m.group(1), roman.fromRoman(s), m.group(8))
                else:
                    return "{}{}{}".format(m.group(1), roman.fromRoman(s), m.group(7))
            else:
                return m.group(0)
        except:
            return m.group(0)

    return re.sub(regex, replace_roman_numerals_in_match, text)


def replace_roman_numerals_including_lowercase(text):
    """
    Returns `text` with Roman numerals replaced by Arabic numerals, including Roman numerals in lowercase.
    """
    return replace_roman_numerals(text, allow_lowercase=True)


def make_versions_csv():
    """
    Returns a CSV of all text versions in the DB.
    """
    output = io.BytesIO()
    writer = csv.writer(output)
    fields = [
        "title",
        "versionTitle",
        "language",
        "versionSource",
        "status",
        "priority",
        "license",
        "versionNotes",
        "digitizedBySefaria",
        "method",
    ]
    writer.writerow(fields)
    vs = VersionSet()
    for v in vs:
        writer.writerow([str(getattr(v, f, "")).encode("utf-8") for f in fields])

    return output.getvalue()


def get_core_link_stats():
    from sefaria.model.link import get_category_category_linkset
    output = io.BytesIO()
    writer = csv.writer(output)
    titles = [
        "Category 1",
        "Category 2",
        "Count"
    ]
    writer.writerow(titles)
    sets = [
        ("Tanakh", "Tanakh"),
        ("Tanakh", "Bavli"),
        ("Bavli", "Tosefta"),
        ("Tosefta", "Mishnah"),
        ("Bavli", "Yerushalmi"),
        ("Bavli", "Bavli"),
        ("Bavli", "Mishneh Torah"),
        ("Bavli", "Shulchan Arukh"),
        ("Bavli", "Midrash"),
        ("Bavli", "Mishnah")
    ]
    for set in sets:
        writer.writerow([set[0], set[1], get_category_category_linkset(set[0], set[1]).count()])

    return output.getvalue()


def get_library_stats():
    def aggregate_stats(toc_node, path):
        simple_nodes = []
        for x in toc_node:
            node_name = x.get("category", None) or x.get("title", None)
            node_path = path + [node_name]
            simple_node = {
                "name": node_name,
                "path": " ".join(node_path)
            }
            if "category" in x:
                simple_node["type"] = "category"
                simple_node["children"] = aggregate_stats(x["contents"], node_path)
                simple_node["en_version_count"] = reduce(lambda x, v: x + v["en_version_count"], simple_node["children"], 0)
                simple_node["he_version_count"] = reduce(lambda x, v: x + v["he_version_count"], simple_node["children"], 0)
                simple_node["en_index_count"] = reduce(lambda x, v: x + v["en_index_count"], simple_node["children"], 0)
                simple_node["he_index_count"] = reduce(lambda x, v: x + v["he_index_count"], simple_node["children"], 0)
                simple_node["en_word_count"] = reduce(lambda x, v: x + v["en_word_count"], simple_node["children"], 0)
                simple_node["he_word_count"] = reduce(lambda x, v: x + v["he_word_count"], simple_node["children"], 0)
                simple_node["all_index_count"] = reduce(lambda x, v: x + v["all_index_count"], simple_node["children"], 0)
                simple_node["all_word_count"] = simple_node["en_word_count"] + simple_node["he_word_count"]
                simple_node["all_version_count"] = simple_node["en_version_count"] + simple_node["he_version_count"]

            elif "title" in x:
                query = {"title": x["title"]}
                simple_node["type"] = "index"
                simple_node["children"] = [{
                       "name": "{} ({})".format(v.versionTitle, v.language),
                       "path": " ".join(node_path + ["{} ({})".format(v.versionTitle, v.language)]),
                       "size": v.word_count(),
                       "type": "version",
                       "language": v.language,
                       "en_version_count": 1 if v.language == "en" else 0,
                       "he_version_count": 1 if v.language == "he" else 0,
                       "en_word_count": v.word_count() if v.language == "en" else 0,
                       "he_word_count": v.word_count() if v.language == "he" else 0,
                   } for v in VersionSet(query)]
                simple_node["en_version_count"] = reduce(lambda x, v: x + v["en_version_count"], simple_node["children"], 0)
                simple_node["he_version_count"] = reduce(lambda x, v: x + v["he_version_count"], simple_node["children"], 0)
                simple_node["en_index_count"] = 1 if any(v["language"] == "en" for v in simple_node["children"]) else 0
                simple_node["he_index_count"] = 1 if any(v["language"] == "he" for v in simple_node["children"]) else 0
                simple_node["en_word_count"] = reduce(lambda x, v: x + v["en_word_count"], simple_node["children"], 0)
                simple_node["he_word_count"] = reduce(lambda x, v: x + v["he_word_count"], simple_node["children"], 0)
                simple_node["all_word_count"] = simple_node["en_word_count"] + simple_node["he_word_count"]
                simple_node["all_index_count"] = 1
                simple_node["all_version_count"] = simple_node["en_version_count"] + simple_node["he_version_count"]

            simple_nodes.append(simple_node)
        return simple_nodes
    tree = aggregate_stats(library.get_toc(), [])

    from operator import sub
    output = io.BytesIO()
    writer = csv.writer(output)
    titles = [
        "Category",
        "#Titles (all)",
        "#Titles (he)",
        "#Titles (en)",
        "#Versions (all)",
        "#Versions (he)",
        "#Versions (en)",
        "#Words (all)",
        "#Words (he)",
        "#Words (en)"
    ]
    writer.writerow(titles)
    fields = [
        "path",
        "all_index_count",
        "he_index_count",
        "en_index_count",
        "all_version_count",
        "he_version_count",
        "en_version_count",
        "all_word_count",
        "he_word_count",
        "en_word_count",
    ]

    with_commentary = ["Tanakh", "Mishnah", "Talmud", "Halakhah"]
    for n in tree:
        row = [n.get(field) for field in fields]
        if n["name"] in with_commentary:
            if n["name"] == "Tanakh":
                cn = next(filter(lambda x: x["name"] == "Commentary", n["children"]))
                c_row = [cn.get(field) for field in fields]
                tn = next(filter(lambda x: x["name"] == "Targum", n["children"]))
                t_row = [tn.get(field) for field in fields]
                row[1:] = list(map(sub, list(map(sub, row[1:], c_row[1:])), t_row[1:]))
                writer.writerow(row)
                writer.writerow(c_row)
                writer.writerow(t_row)
            else:
                cn = next(filter(lambda x: x["name"] == "Commentary", n["children"]))
                c_row = [cn.get(field) for field in fields]
                row[1:] = list(map(sub, row[1:], c_row[1:]))
                writer.writerow(row)
                writer.writerow(c_row)
        else:
            writer.writerow(row)

    return output.getvalue()


def dual_text_diff(seg1, seg2, edit_cb=None, css_classes=False):
    """
    Make a diff of seg1 on seg2 and return two html strings displaying the differences between each one. Takes an
    optional callback that can edit the texts before the diff is made
    :param seg1:
    :param seg2:
    :param edit_cb: callback
    :param bool css_classes: Set to True to style diffs with css classes. Classes will be "ins" and "del". If False
     will set an inline style tag.
    :return: (str, str)
    """
    def side_by_side_diff(diffs, change_from=True):
        """
        Used to render an html display of a diff from the diff_match_patch library
        :param diffs: list of tuples as produced by diff_match_patch.diff_main()
        :param change_from: diff_match_patch.diff_main() gives a diff that shows how to change from stringA to stringB. This
          flag should be true if you wish to see only the additions that need to be made to textA (first string fed to
          diff_main). If the inserts to the second are to be diplayed, set to False.
        :return: html string
        """
        diff_delete, diff_insert, diff_equal = -1, 1, 0
        html = []
        if css_classes:
            ins, dell = 'class="ins"', 'class="del"'
        else:
            ins, dell = 'style="background:#e6ffe6;"', 'style="background:#ffe6e6;"'

        for (op, data) in diffs:
            my_text = (data.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "&para;<br>"))
            if op == diff_insert:
                if change_from:
                    continue
                else:
                    html.append("<span {}>{}</span>".format(ins, my_text))
            elif op == diff_delete:
                if change_from:
                    html.append("<span {}>{}</span>".format(dell, my_text))
                else:
                    continue
            elif op == diff_equal:
                html.append("<span>%s</span>" % my_text)
        return "".join(html)

    if edit_cb is not None:
        seg1, seg2 = edit_cb(seg1), edit_cb(seg2)
    diff = diff_match_patch().diff_main(seg1, seg2)
    return side_by_side_diff(diff), side_by_side_diff(diff, False)


def word_frequency_for_text(title, lang="en"):
    """
    Returns an ordered list of word/count tuples for occurences of words inside the 
    text `title`.
    """
    import string
    from collections import defaultdict
    from sefaria.export import make_text, prepare_merged_text_for_export
    from sefaria.utils.util import strip_tags 
    text = make_text(prepare_merged_text_for_export(title, lang=lang))

    text = strip_tags(text)
    text = text.lower()
    text = re.sub(r'[^a-z ]', " ", text)
    text = re.sub(r' +', " ", text)
    text = text.translate(str.maketrans(dict.fromkeys(string.punctuation)))

    count = defaultdict(int)
    words = text.split(" ")
    for word in words:
        count[word] += 1

    counts = sorted(iter(count.items()), key=lambda x: -x[1])

    return counts


class WorkflowyParser(object):

    title_lang_delim = r"/"
    alt_title_delim = r"|"
    comment_delim = r'#'
    categories_delim = "%"

    def __init__(self, schema_file, uid, term_scheme=None, c_index=False, c_version=False, delims=None):
        self._schema_outline_file = schema_file
        self._uid = uid
        self._term_scheme = term_scheme
        self._c_index = c_index
        self._c_version = c_version
        tree = ET.parse(self._schema_outline_file)
        self.outline = tree.getroot().find("./body/outline/outline")
        self.comment_strip_re = re.compile(r"</b>|<b>|" + self.comment_delim + ".*" + self.comment_delim,
                                           re.UNICODE)
        self.parsed_schema = None
        self.version_info = None
        self.categories = None
        if delims:
            delims = delims.split()
            self.title_lang_delim = delims[0] if len(delims) >= 1 else self.title_lang_delim
            self.alt_title_delim = delims[1] if len(delims) >= 2 else self.alt_title_delim
            self.categories_delim = delims[2] if len(delims) >= 3 else self.categories_delim

    def parse(self):
        # tree = tree.getroot()[1][0]
        # for element in tree.iter('outline'):
        #     print parse_titles(element)["enPrim"]
        self.categories = self.extract_categories_from_title()
        self.version_info = {'info': self.extract_version_info(), 'text': []}
        self.parsed_schema = self.build_index_schema(self.outline)
        self.parsed_schema.validate()
        idx = self.create_index_from_schema()
        if self._c_index:
            idx_obj = Index(idx).save()
            res = "Index record [{}] created.".format(self.parsed_schema.primary_title())
            if self._c_version:
                self.save_version_from_outline_notes()
                res += " Version record created."
            else:
                self.save_version_default(idx_obj)
                res += " No text, Default empty Version record created."
        else:
            res = "Returning index outline without saving."
        return {"message": res, "index": idx}

    # object tree of each with jagged array nodes at the lowest level (recursive)
    def build_index_schema(self, element):
        if self._term_scheme and isinstance(self._term_scheme, str):
            self.create_term_scheme()
        # either type of node:
        ja_sections = self.parse_implied_depth(element)
        titles = self.parse_titles(element)  # an array of titles
        if len(element) == 0:  # length of child nodes
            n = JaggedArrayNode()
            n.depth = len(ja_sections['section_names']) if ja_sections else 1
            n.sectionNames = ja_sections['section_names'] if ja_sections else ['Paragraph']
            n.addressTypes = ja_sections['address_types'] if ja_sections else ['Integer']
            if titles:
                n.key = titles["enPrim"]
                n = self.add_titles_to_node(n, titles)
            else:
                n.key = 'default'
                n.default = True
        else:  # yes child nodes >> schema node
            n = SchemaNode()
            n.key = titles["enPrim"]
            n = self.add_titles_to_node(n, titles)
            for child in element:
                n.append(self.build_index_schema(child))

        if self._term_scheme and element != self.outline:  # add the node to a term scheme
            self.create_shared_term_for_scheme(n.title_group)

        if self._c_version and element != self.outline:  # get the text in the notes and store it with the proper Ref
            text = self.parse_text(element)
            if text:
                self.version_info['text'].append({'node': n, 'text': text})
        return n

    # en & he titles for each element > dict
    def parse_titles(self, element):
        title = element.get("text")
        if '**default**' in title:
            return None
        # print title
        # title = re.sub(ur"</b>|<b>|#.*#|'", u"", title)
        title = self.comment_strip_re.sub("", title)
        spl_title = title.split(self.title_lang_delim)
        titles = {}
        if len(spl_title) == 2:
            he_pos = 1 if has_tibetan(spl_title[1]) else 0
            he = spl_title[he_pos].split(self.alt_title_delim)
            titles["hePrim"] = he[0].strip()
            titles["heAltList"] = [t.strip() for t in he[1:]]
            del spl_title[he_pos]
        en = spl_title[0].split(self.alt_title_delim)
        titles["enPrim"] = en[0].strip()
        titles["enAltList"] = [t.strip() for t in en[1:]]
        # print node.attrib
        return titles

    # appends primary, alternate, hebrew, english titles to node.
    def add_titles_to_node(self, n, titles):
        term = Term()
        # check if the primary title is a "shared term"
        if term.load({"name": titles["enPrim"]}):
            n.add_shared_term(titles["enPrim"])

        else:  # manual add if not a shared term
            n.add_title(titles["enPrim"], 'en', primary=True)
            # print titles["enPrim"]
            if "hePrim" in titles:
                n.add_title(titles["hePrim"], 'he', primary=True)
                # print titles["hePrim"]
            if "enAltList" in titles:
                for title in titles["enAltList"]:
                    n.add_title(title, 'en')
            if "heAltList" in titles:
                for title in titles["heAltList"]:
                    n.add_title(title, 'he')
        return n

    def extract_categories_from_title(self):
        category_pattern = self.categories_delim + r"(.*)" + self.categories_delim
        title = self.outline.get("text")
        category_str = re.search(category_pattern, title)
        if category_str:
            categories = [s.strip() for s in category_str.group(1).split(",")]
            self.outline.set('text', re.sub(category_pattern, "", title))
            return categories
        raise InputError("Categories must be supplied on the Workflowy outline according to specifications")

    def parse_implied_depth(self, element):
        ja_depth_pattern = r"\[(\d)\]$"
        ja_sections_pattern = r"\[(.*)\]$"
        title_str = element.get('text').strip()

        depth_match = re.search(ja_depth_pattern, title_str)
        if depth_match:
            depth = int(depth_match.group(1))
            placeholder_sections = ['Volume', 'Chapter', 'Section', 'Paragraph']
            element.set('text', re.sub(ja_depth_pattern, "", title_str))
            return {'section_names': placeholder_sections[(-1 * depth):], 'address_types': ['Integer'] * depth}

        sections_match = re.search(ja_sections_pattern, title_str)
        if sections_match:
            sections = [s.strip() for s in sections_match.group(1).split(",")]
            element.set('text', re.sub(ja_sections_pattern, "", title_str))
            section_names = []
            address_types = []
            for s in sections:
                tpl = s.split(":")
                section_names.append(tpl[0])
                address_types.append(tpl[1] if len(tpl) > 1 else 'Integer')

            return {'section_names': section_names, 'address_types': address_types}
        else:
            return None

    def extract_version_info(self):
        vinfo_str = self.outline.get("_note")
        if vinfo_str:
            vinfo_dict = {elem.split(":", 1)[0].strip(): elem.split(":", 1)[1].strip() for elem in
                          vinfo_str.split(",")}
        else:
            vinfo_dict = {'language': 'he',
                          'versionSource': 'not available',
                          'versionTitle': 'pending'
                          }
        return vinfo_dict

    def create_index_from_schema(self):
        return {
            "title": self.parsed_schema.primary_title(),
            "categories": self.categories,
            "schema": self.parsed_schema.serialize()
        }

    def create_term_scheme(self):
        if not TermScheme().load({"name": self._term_scheme}):
            print("Creating Term Scheme object")
            ts = TermScheme()
            ts.name = self._term_scheme
            ts.save()
            self._term_scheme = ts

    def create_shared_term_for_scheme(self, title_group):
        # TODO: This might be a silly method, since for most cases we do not want to blindly create terms from ALL thre nodes of a schema
        if not Term().load({"name": title_group.primary_title()}):
            print("Creating Shared Term for Scheme from outline")
            term = Term()
            term.name = title_group.primary_title()
            term.scheme = self._term_scheme.name
            term.title_group = title_group
            term.save()

    # divides text into paragraphs and sentences > list
    def parse_text(self, element):
        if "_note" in element.attrib:
            n = (element.attrib["_note"])
            n = re.sub(r'[/]', '<br>', n)
            n = re.sub(r'[(]', '<em><small>', n)
            n = re.sub(r'[)]', '</small></em>', n)
            text = n.strip().splitlines()
            return text
        return None

    # builds and posts text to api
    def save_version_from_outline_notes(self):
        from sefaria.tracker import modify_text
        for text_ref in self.version_info['text']:
            node = text_ref['node']
            ref = Ref(node.full_title(force_update=True))
            text = text_ref['text']
            user = self._uid
            vtitle = self.version_info['info']['versionTitle']
            lang = self.version_info['info']['language']
            vsource = self.version_info['info']['versionSource']
            modify_text(user, ref, vtitle, lang, text, vsource)

    def save_version_default(self, idx):
        Version(
            {
                "chapter": idx.nodes.create_skeleton(),
                "versionTitle": self.version_info['info']['versionTitle'],
                "versionSource": self.version_info['info']['versionSource'],
                "language": self.version_info['info']['language'],
                "title": idx.title
            }
        ).save()

