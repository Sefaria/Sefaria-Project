# encoding=utf-8
import re

import sefaria.summaries as summaries
from sefaria.model import *
from sefaria.system import cache as scache
from sefaria.system.database import db
from sefaria.datatype.jagged_array import JaggedTextArray
from diff_match_patch import diff_match_patch


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
        print
        assert isinstance(i, Index)
        schema = i.nodes
        assert isinstance(schema, JaggedArrayNode)
        for title in schema.all_node_titles(lang):
            if old in title:
                new_title = title.replace(old, new)
                print new_title
                schema.add_title(new_title, lang)
                i.save()


def rename_category(old, new):
    """
    Walk through all index records, replacing every category instance
    called 'old' with 'new'.
    """
    indices = IndexSet({"categories": old})

    assert indices.count(), "No categories named {}".format(old)

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
    # TODO Rewrite any existing History items

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
            print "WARNING - %s & %s have overlapping content. Aborting." % (version1, version2)

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
    Walks ever segment contained in title, calls func on the text and saves the result.
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
    def replacer(text):
        return text.replace(find_string, replace_string)

    modify_text_by_function(title, vtitle, lang, replacer, uid)


def replace_roman_numerals(text, allow_lowercase=False):
    """
    Replaces any roman numerals in 'text' with digits.
    Currently only looks for a roman numeral followed by a comma or period, then a space, then a digit.
    e.g. (Isa. Iv. 10) --> (Isa. 4:10)

    WARNING: we've seen e.g., "(v. 15)" used to mean "Verse 15". If run with allow_lowercase=True, this will
    be rewritten as "(5:15)". 
    """
    import roman
    flag = re.I if allow_lowercase else 0
    regex = re.compile(u"((^|[{\[( ])[{\[( ]*)(M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3}))($|[.,;\])}: ]+)(\d)?", flag)


    def replace_roman_numerals_in_match(m):
        s = m.group(3)
        s = s.upper()
        try:
            if s:
                if m.group(8):    
                    return u"{}{}:{}".format(m.group(1), roman.fromRoman(s), m.group(8))
                else:
                    return u"{}{}{}".format(m.group(1), roman.fromRoman(s), m.group(7))
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
    import csv
    import io
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
        "licenseVetted",
        "versionNotes",
        "digitizedBySefaria",
        "method",
    ]
    writer.writerow(fields)
    vs = VersionSet()
    for v in vs:
        writer.writerow([unicode(getattr(v, f, "")).encode("utf-8") for f in fields])

    return output.getvalue()


def get_core_link_stats():
    import csv
    import io
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
    #//todo: mark for commentary refactor?
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
                       "name": u"{} ({})".format(v.versionTitle, v.language),
                       "path": " ".join(node_path + [u"{} ({})".format(v.versionTitle, v.language)]),
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

    import csv
    import io
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
                cn = filter(lambda x: x["name"] == "Commentary", n["children"])[0]
                c_row = [cn.get(field) for field in fields]
                tn = filter(lambda x: x["name"] == "Targum", n["children"])[0]
                t_row = [tn.get(field) for field in fields]
                row[1:] = map(sub, map(sub, row[1:], c_row[1:]), t_row[1:])
                writer.writerow(row)
                writer.writerow(c_row)
                writer.writerow(t_row)
            else:
                cn = filter(lambda x: x["name"] == "Commentary", n["children"])[0]
                c_row = [cn.get(field) for field in fields]
                row[1:] = map(sub, row[1:], c_row[1:])
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
          diff_main). If the inserts to the second are to be displayed, set to False.
        :return: html string
        """
        diff_delete, diff_insert, diff_equal = -1, 1, 0
        html = []
        if css_classes:
            ins, dell = u'class="ins"', u'class="del"'
        else:
            ins, dell = u'style="background:#e6ffe6;"', u'style="background:#ffe6e6;"'

        for (op, data) in diffs:
            my_text = (data.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "&para;<br>"))
            if op == diff_insert:
                if change_from:
                    continue
                else:
                    html.append(u"<span {}>{}</span>".format(ins, my_text))
            elif op == diff_delete:
                if change_from:
                    html.append(u"<span {}>{}</span>".format(dell, my_text))
                else:
                    continue
            elif op == diff_equal:
                html.append(u"<span>%s</span>" % my_text)
        return u"".join(html)

    if edit_cb is not None:
        seg1, seg2 = edit_cb(seg1), edit_cb(seg2)
    diff = diff_match_patch().diff_main(seg1, seg2)
    return side_by_side_diff(diff), side_by_side_diff(diff, False)




