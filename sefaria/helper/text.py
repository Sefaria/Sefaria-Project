# coding=utf-8
import re

import sefaria.summaries as summaries
from sefaria.model import *
from sefaria.system import cache as scache
from sefaria.system.database import db
from sefaria.datatype.jagged_array import JaggedTextArray


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


def create_commentator_and_commentary_version(commentator_name, existing_book, lang, vtitle, vsource, he_commentator_name):
    existing_index = Index().load({'title':existing_book})
    if existing_index is None:
        raise ValueError('{} is not a name of an existing text!'.format(existing_book))

    commentator_index = Index().load({'title':commentator_name})
    if commentator_index is None:
        if not he_commentator_name:
            raise ValueError("New index record needs Hebrew Title")
        index_json = {
            "title":commentator_name,
            "titleVariants":[],
            "heTitle" : he_commentator_name,
            "heTitleVariants":[],
            "categories":["Commentary"]
        }
        commentator_index = Index(index_json)
        commentator_index.save()

    new_version = Version(
                {
                    "chapter": existing_index.nodes.create_skeleton(),
                    "versionTitle": vtitle,
                    "versionSource": vsource,
                    "language": lang,
                    "title": "{} on {}".format(commentator_name, existing_book)
                }
    ).save()

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

    library.refresh_index_record(index)

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


def modify_text_by_function(title, vtitle, lang, func, uid, **kwargs):
    """
    Walks ever segment contained in title, calls func on the text and saves the result.
    """
    from sefaria.tracker import modify_text
    section_refs = VersionStateSet({"title": title}).all_refs()
    for section_ref in section_refs:
        section = section_ref.text(vtitle=vtitle, lang=lang)
        segment_refs = section_ref.subrefs(len(section.text) if section.text else 0)
        if segment_refs:
            for i in range(len(section.text)):
                if section.text[i] and len(section.text[i]):
                    text = func(section.text[i])
                    modify_text(uid, segment_refs[i], vtitle, lang, text, **kwargs)


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
    flag  = re.I if allow_lowercase else 0
    regex = re.compile("([( ])(M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3}))([.,] ?)(\d)", flag)
    def replace_roman_numerals_in_match(m):
        s = m.group(2)
        s = s.upper()
        try:
            if s:
                return "%s%s:%s" % (m.group(1), roman.fromRoman(s), m.group(7))
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



