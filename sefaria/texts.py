# -*- coding: utf-8 -*-
"""
texts.py -- backend core for manipulating texts, refs (citations), links, notes and text index records.

MongoDB collections handled in this file: index, texts, links, notes, history
"""
import re
import copy

import bleach

from helper.link import add_commentary_links, add_links_from_text
from sefaria.model.text import merge_texts
import sefaria.model as model
import summaries
from sefaria.utils.util import list_depth
from sefaria.utils.users import is_user_staff
from sefaria.utils.talmud import section_to_daf
from sefaria.system.database import db
import sefaria.system.cache as scache
from sefaria.system.exceptions import InputError



# HTML Tag whitelist for sanitizing user submitted text
# Can be removed once sanitize_text is moved
ALLOWED_TAGS = ("i", "b", "br", "u", "strong", "em", "big", "small")


import logging
logging.basicConfig()
logger = logging.getLogger("texts")
#logger.setLevel(logging.DEBUG)
logger.setLevel(logging.WARNING)


# used in get_text()
def text_from_cur(ref, textCur, context):
    """
    Take a parsed ref and DB cursor of texts and construct a text to return out of what's available.
    Merges text fragments when necessary so that the final version has maximum text.
    """
    versions         = []
    versionTitles    = []
    versionSources   = []
    versionStatuses  = []
    versionLicenses  = []
    versionNotes     = []
    versionBySefaria = []
    # does this ref refer to a range of text
    is_range = ref["sections"] != ref["toSections"]

    for t in textCur:
        try:
            text = t['chapter'][0] if len(ref["sectionNames"]) > 1 else t['chapter']
            if text == "" or text == []:
                continue
            if len(ref['sections']) < len(ref['sectionNames']) or context == 0 and not is_range:
                sections = ref['sections'][1:]
                if len(ref["sectionNames"]) == 1 and context == 0:
                    sections = ref["sections"]
            else:
                # include surrounding text
                sections = ref['sections'][1:-1]
            # dive down into text until the requested segment is found
            for i in sections:
                text = text[int(i) - 1]
            if is_range and context == 0:
                start = ref["sections"][-1] - 1
                end = ref["toSections"][-1]
                text = text[start:end]
            versions.append(text)
            versionTitles.append(t.get("versionTitle", ""))
            versionSources.append(t.get("versionSource", ""))
            versionStatuses.append(t.get("status", "none"))
            license = t.get("license", "unknown") if t.get("licenseVetted", False) else "unknown"
            versionLicenses.append(license)
            versionNotes.append(t.get("versionNotes", ""))
            versionBySefaria.append(t.get("digitizedBySefaria", False))

        except IndexError:
            # this happens when t doesn't have the text we're looking for
            pass

    if list_depth(versions) == 1:
        while '' in versions:
            versions.remove('')

    if len(versions) == 0:
        ref['text'] = "" if context == 0 else []

    elif len(versions) == 1:
        ref['text']               = versions[0]
        ref['versionTitle']       = versionTitles[0]
        ref['versionSource']      = versionSources[0]
        ref['versionStatus']      = versionStatuses[0]
        ref['license']            = versionLicenses[0]
        if versionNotes[0]:
            ref['versionNotes']       = versionNotes[0]
        if versionBySefaria[0]:
            ref['digitizedBySefaria'] = versionBySefaria[0]

    elif len(versions) > 1:
        ref['text'], ref['sources'] = merge_texts(versions, versionTitles)
        if len([x for x in set(ref['sources'])]) == 1:
            # if sources only lists one title, no merge acually happened
            ref['versionTitle']       = ref['sources'][0]
            i                         = versionTitles.index(ref['sources'][0])
            ref['versionSource']      = versionSources[i]
            ref['versionStatus']      = versionStatuses[i]
            ref['license']            = versionLicenses[i]
            if versionNotes[i]:
                ref['versionNotes']       = versionNotes[i]
            if versionBySefaria[i]:
                ref['digitizedBySefaria'] = versionBySefaria[i]

            del ref['sources']

    return ref

#todo: fix root-content node assumption
def get_text(tref, context=1, commentary=True, version=None, lang=None, pad=True):
    """
    Take a string reference to a segment of text and return a dictionary including
    the text and other info.
        * 'context': how many levels of depth above the request ref should be returned.
            e.g., with context=1, ask for a verse and receive its surrounding chapter as well.
            context=0 gives just what is asked for.
        * 'commentary': whether or not to search for and return connected texts as well.
        * 'version' + 'lang': use to specify a particular version of a text to return.
    """
    oref = model.Ref(tref)
    if pad:
        oref = oref.padded_ref()

    if oref.is_spanning():
        # If ref spans sections, call get_text for each section
        return get_spanning_text(oref)

    if len(oref.sections):
        skip = oref.sections[0] - 1
        limit = 1
        chapter_slice = {"_id": 0} if len(oref.index_node.sectionNames) == 1 else {"_id": 0, "chapter": {"$slice": [skip, limit]}}
    else:
        chapter_slice = {"_id": 0}

    textCur = heCur = None
    # pull a specific version of text
    if version and lang == "en":
        textCur = db.texts.find({"title": oref.book, "language": lang, "versionTitle": version}, chapter_slice)

    elif version and lang == "he":
        heCur = db.texts.find({"title": oref.book, "language": lang, "versionTitle": version}, chapter_slice)

    # If no criteria set above, pull all versions,
    # Prioritize first according to "priority" field (if present), then by oldest text first
    # Order here will determine which versions are used in case of a merge
    textCur = textCur or db.texts.find({"title": oref.book, "language": "en"}, chapter_slice).sort([["priority", -1], ["_id", 1]])
    heCur   = heCur   or db.texts.find({"title": oref.book, "language": "he"}, chapter_slice).sort([["priority", -1], ["_id", 1]])

    # Conversion to Ref bogged down here, and resorted to old_dict_format(). todo: Push through to the end
    # Extract / merge relevant text. Pull Hebrew from a copy of ref first, since text_from_cur alters ref
    heRef = text_from_cur(copy.copy(oref.old_dict_format()), heCur, context)
    r = text_from_cur(oref.old_dict_format(), textCur, context)

    # Add fields pertaining the the Hebrew text under different field names
    r["he"]              = heRef.get("text", [])
    r["heVersionTitle"]  = heRef.get("versionTitle", "")
    r["heVersionSource"] = heRef.get("versionSource", "")
    r["heVersionStatus"] = heRef.get("versionStatus", "")
    r["heLicense"]       = heRef.get("license", "unknown")
    if heRef.get("versionNotes", ""):
        r["heVersionNotes"]       = heRef.get("versionNotes", "")
    if heRef.get("digitizedBySefaria", False):
        r["heDigitizedBySefaria"] = heRef.get("digitizedBySefaria", False)
    if "sources" in heRef:
        r["heSources"]            = heRef.get("sources")

    # find commentary on this text if requested
    if commentary:
        from sefaria.client.wrapper import get_links
        searchRef = model.Ref(tref).padded_ref().context_ref(context).normal()
        links = get_links(searchRef)
        r["commentary"] = links if "error" not in links else []

        # get list of available versions of this text
        # but only if you care enough to get commentary also (hack)
        r["versions"] = get_version_list(tref)

    # use shorthand if present, masking higher level sections
    if "shorthand" in r:
        r["book"] = r["shorthand"]
        d = r["shorthandDepth"]
        for key in ("sections", "toSections", "sectionNames"):
            r[key] = r[key][d:]

    # replace ints with daf strings (3->"2a") if text is Talmud or commentary on Talmud
    if r["type"] == "Talmud" or r["type"] == "Commentary" and r["commentaryCategories"][0] == "Talmud":
        daf = r["sections"][0]
        r["sections"] = [section_to_daf(daf)] + r["sections"][1:]
        r["title"] = r["book"] + " " + r["sections"][0]
        if "heTitle" in r:
            r["heBook"] = r["heTitle"]
            r["heTitle"] = r["heTitle"] + " " + section_to_daf(daf, lang="he")
        if r["type"] == "Commentary" and len(r["sections"]) > 1:
            r["title"] = "%s Line %d" % (r["title"], r["sections"][1])
        if "toSections" in r:
            r["toSections"] = [r["sections"][0]] + r["toSections"][1:]

    elif r["type"] == "Commentary":
        d = len(r["sections"]) if len(r["sections"]) < 2 else 2
        r["title"] = r["book"] + " " + ":".join(["%s" % s for s in r["sections"][:d]])

    return r


# Used in get_text()
# Deprecated
def get_spanning_text(oref):
    """
    Gets text for a ref that spans across text sections.

    TODO refactor to handle commentary on spanning refs
    TODO properly track version names and lists which may differ across sections
    """
    refs = oref.split_spanning_ref()
    result, text, he = {}, [], []
    for oref in refs:
        result = get_text(oref.normal(), context=0, commentary=False)
        text.append(result["text"])
        he.append(result["he"])

    result["sections"] = refs[0].sections
    result["toSections"] = refs[-1].toSections
    result["text"] = text
    result["he"] = he
    result["spanning"] = True
    #result.update(pRef)
    return result

#Move to Ref.version_list()
def get_version_list(tref):
    """
    Returns a list of available text versions matching 'ref'
    """
    try:
        oref = model.Ref(tref).padded_ref()
    except InputError:
        return []
    #pRef = parse_ref(tref)
    #if "error" in pRef:
    #	return []

    skip = oref.sections[0] - 1 if len(oref.sections) else 0
    limit = 1
    versions = db.texts.find({"title": oref.book}, {"chapter": {"$slice": [skip, limit]}})

    vlist = []
    for v in versions:
        text = v['chapter']
        for i in [0] + oref.sections[1:]:
            try:
                text = text[i]
            except (IndexError, TypeError):
                text = None
                continue
        if text:
            vlist.append({"versionTitle": v["versionTitle"], "language": v["language"]})

    return vlist


def get_book_link_collection(book, cat):

    if cat == "Tanach" or cat == "Torah" or cat == "Prophets" or cat == "Writings":
        query = {"$and": [{"categories": cat}, {"categories": {"$ne": "Commentary"}}, {"categories": {"$ne": "Targum"}}]}
    else:
        query = {"categories": cat}

    titles = model.IndexSet(query).distinct("title")
    if len(titles) == 0:
        return {"error": "No results for {}".format(query)}

    book_re = r'^{} \d'.format(book)
    cat_re = r'^({}) \d'.format('|'.join(titles))

    link_re = r'^(?P<title>.+) (?P<loc>\d.*)$'
    ret = []

    links = model.LinkSet({"$and": [{"refs": {"$regex": book_re}}, {"refs": {"$regex": cat_re}}]})
    for link in links:
        l1 = re.match(link_re, link.refs[0])
        l2 = re.match(link_re, link.refs[1])
        ret.append({
            "r1": {"title": l1.group("title").replace(" ", "-"), "loc": l1.group("loc")},
            "r2": {"title": l2.group("title").replace(" ", "-"), "loc": l2.group("loc")}
        })
    return ret


# used in views.texts_api and views.revert_api
def save_text(tref, text, user, **kwargs):
    """
    Save a version of a text named by ref.

    text is a dict which must include attributes to be stored on the version doc,
    as well as the text itself,

    Returns indication of success of failure.
    """
    from history import record_text_change
    oref = model.Ref(tref)

    # Validate Posted Text
    validated = validate_text(text, tref)
    if "error" in validated:
        return validated

    text["text"] = sanitize_text(text["text"])

    chapter  = oref.sections[0] if len(oref.sections) > 0 else None
    verse    = oref.sections[1] if len(oref.sections) > 1 else None
    subVerse = oref.sections[2] if len(oref.sections) > 2 else None

    # Check if we already have this	text
    existing = db.texts.find_one({"title": oref.book, "versionTitle": text["versionTitle"], "language": text["language"]})

    if existing:
        # Have this (book / version / language)

        # Only allow staff to edit locked texts
        if existing.get("status", "") == "locked" and not is_user_staff(user):
            return {"error": "This text has been locked against further edits."}

        # Pad existing version if it has fewer chapters
        if len(existing["chapter"]) < chapter:
            for i in range(len(existing["chapter"]), chapter):
                existing["chapter"].append([])

        # Save at depth 2 (e.g. verse: Genesis 4.5, Mishna Avot 2.4, array of comentary eg. Rashi on Genesis 1.3)
        if len(oref.sections) == 2:
            if isinstance(existing["chapter"][chapter-1], basestring):
                existing["chapter"][chapter-1] = [existing["chapter"][chapter-1]]

            # Pad chapter if it doesn't have as many verses as the new text
            for i in range(len(existing["chapter"][chapter-1]), verse):
                existing["chapter"][chapter-1].append("")

            existing["chapter"][chapter-1][verse-1] = text["text"]


        # Save at depth 3 (e.g., a single Rashi Commentary: Rashi on Genesis 1.3.2)
        elif len(oref.sections) == 3:

            # if chapter is a str, make it an array
            if isinstance(existing["chapter"][chapter-1], basestring):
                existing["chapter"][chapter-1] = [existing["chapter"][chapter-1]]
            # pad chapters with empty arrays if needed
            for i in range(len(existing["chapter"][chapter-1]), verse):
                existing["chapter"][chapter-1].append([])

            # if verse is a str, make it an array
            if isinstance(existing["chapter"][chapter-1][verse-1], basestring):
                existing["chapter"][chapter-1][verse-1] = [existing["chapter"][chapter-1][verse-1]]
            # pad verse with empty arrays if needed
            for i in range(len(existing["chapter"][chapter-1][verse-1]), subVerse):
                existing["chapter"][chapter-1][verse-1].append([])

            existing["chapter"][chapter-1][verse-1][subVerse-1] = text["text"]

        # Save at depth 1 (e.g, a whole chapter posted to Genesis.4)
        elif len(oref.sections) == 1:
            existing["chapter"][chapter-1] = text["text"]

        # Save as an entire named text
        elif len(oref.sections) == 0:
            existing["chapter"] = text["text"]

        # Update version source
        existing["versionSource"] = text["versionSource"]

        record_text_change(tref, text["versionTitle"], text["language"], text["text"], user, **kwargs)
        db.texts.save(existing)

        text_id = existing["_id"]
        del existing["_id"]
        if 'revisionDate' in existing:
            del existing['revisionDate']

        response = existing

    # New (book / version / language)
    else:
        text["title"] = oref.book

        # add placeholders for preceding chapters
        if len(oref.sections) > 0:
            text["chapter"] = []
            for i in range(chapter):
                text["chapter"].append([])

        # Save at depth 2 (e.g. verse: Genesis 4.5, Mishan Avot 2.4, array of comentary eg. Rashi on Genesis 1.3)
        if len(oref.sections) == 2:
            chapterText = []
            for i in range(1, verse):
                chapterText.append("")
            chapterText.append(text["text"])
            text["chapter"][chapter-1] = chapterText

        # Save at depth 3 (e.g., a single Rashi Commentary: Rashi on Genesis 1.3.2)
        elif len(oref.sections) == 3:
            for i in range(verse):
                text["chapter"][chapter-1].append([])
            subChapter = []
            for i in range(1, subVerse):
                subChapter.append([])
            subChapter.append(text["text"])
            text["chapter"][chapter-1][verse-1] = subChapter

        # Save at depth 1 (e.g, a whole chapter posted to Genesis.4)
        elif len(oref.sections) == 1:
            text["chapter"][chapter-1] = text["text"]

        # Save an entire named text
        elif len(oref.sections) == 0:
            text["chapter"] = text["text"]

        record_text_change(tref, text["versionTitle"], text["language"], text["text"], user, **kwargs)

        saved_text = text["text"]
        del text["text"]
        text_id = db.texts.insert(text)
        text["text"] = saved_text

        response = text

    # Finish up for both existing and new texts

    # count available segments of text
    if kwargs.get("count_after", True):
        summaries.update_summaries_on_change(oref.book)

    # Commentaries generate links to their base text automatically
    if oref.type == "Commentary":
        add_commentary_links(tref, user, **kwargs)

    # scan text for links to auto add
    add_links_from_text(tref, text, text_id, user, **kwargs)

    # Add this text to a queue to be indexed for search
    from sefaria.settings import SEARCH_INDEX_ON_SAVE
    if SEARCH_INDEX_ON_SAVE and kwargs.get("index_after", True):
        model.IndexQueue({
            "ref": tref,
            "lang": response["language"],
            "version": response["versionTitle"],
            "type": "ref",
        }).save()

    return {"status": "ok"}


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


# used in save_text
# deprecated
# validation of api data, not of record
#todo: fix root-content node assumption
def validate_text(text, tref):
    """
    validate a dictionary representing a text to be written to db.texts
    """
    # Required Keys
    for key in ("versionTitle", "versionSource", "language", "text"):
        if not key in text:
            return {"error": "Field '%s' missing from posted JSON."  % key}
    oref = model.Ref(tref)

    # Validate depth of posted text matches expectation
    posted_depth = 0 if isinstance(text["text"], basestring) else list_depth(text["text"])
    implied_depth = len(oref.sections) + posted_depth
    if implied_depth != oref.index_node.depth:
        raise InputError(
            u"Text Structure Mismatch. The stored depth of {} is {}, but the text posted to {} implies a depth of {}."
            .format(oref.book, oref.index_node.depth, tref, implied_depth))

    return {"status": "ok"}


# views.lock_text_api
def set_text_version_status(title, lang, version, status=None):
    """
    Sets the status field of an existing text version.
    """
    title   = title.replace("_", " ")
    version = version.replace("_", " ")
    text = db.texts.find_one({"title": title, "language": lang, "versionTitle": version})
    if not text:
        return {"error": "Text not found: %s, %s, %s" % (title, lang, version)}

    text["status"] = status
    db.texts.save(text)
    return {"status": "ok"}

# used in save_text
#Todo:  move to Version._sanitize or lower.
def sanitize_text(text):
    """
    Clean html entites of text, remove all tags but those allowed in ALLOWED_TAGS.
    text may be a string or an array of strings.
    """
    if isinstance(text, list):
        for i, v in enumerate(text):
            text[i] = sanitize_text(v)
    elif isinstance(text, basestring):
        text = bleach.clean(text, tags=ALLOWED_TAGS)
    else:
        return False
    return text

#only used in a script
def update_version_title(old, new, text_title, language):
    """
    Rename a text version title, including versions in history
    'old' and 'new' are the version title names.
    """
    query = {
        "title": text_title,
        "versionTitle": old,
        "language": language
    }
    db.texts.update(query, {"$set": {"versionTitle": new}}, upsert=False, multi=True)

    update_version_title_in_history(old, new, text_title, language)


def update_version_title_in_history(old, new, text_title, language):
    """
    Rename a text version title in history records
    'old' and 'new' are the version title names.
    """
    query = {
        "ref": {"$regex": r'^%s(?= \d)' % text_title},
        "version": old,
        "language": language,
    }
    db.history.update(query, {"$set": {"version": new}}, upsert=False, multi=True)


#only used in a script
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
    v1 = model.Version().load({"title": text_title, "versionTitle": version1, "language": language})
    if not v1:
        return {"error": "Version not found: %s" % version1 }
    v2 = model.Version().load({"title": text_title, "versionTitle": version2, "language": language})
    if not v2:
        return {"error": "Version not found: %s" % version2 }

    if warn and versions_overlap(v1.chapter, v2.chapter):
        print "WARNING - %s & %s have overlapping content. Aborting." % (version1, version2)


    merged_text, sources = merge_texts([v1.chapter, v2.chapter], [version1, version2])

    v1.chapter = merged_text
    v1.save()

    update_version_title_in_history(version2, version1, text_title, language)

    v2.delete()

    return {"status": "ok"}


def merge_multiple_text_versions(versions, text_title, language, warn=False):
    """
    Merges contents of multiple text versions listed in 'versions'
    Versions listed first in 'versions' will receive priority if there is overlap.
    """
    v1 = versions.pop(0)
    for v2 in versions:
        merge_text_versions(v1, v2, text_title, language)


def merge_text_versions_by_source(text_title, language, warn=False):
    """
    Merges all texts of text_title in langauge that share the same value for versionSource.
    """
    v = model.VersionSet({"title": text_title, "language": language})

    for s in v.distinct("versionSource"):
        versions = model.VersionSet({"title": text_title, "versionSource": s, "language": language}).distinct("versionTitle")
        merge_multiple_text_versions(versions, text_title, language)


def merge_text_versions_by_language(text_title, language, warn=False):
    """
    Merges all texts of text_title in langauge.
    """
    versions = model.VersionSet({"title": text_title, "language": language}).distinct("versionTitle")
    merge_multiple_text_versions(versions, text_title, language)


def versions_overlap(v1, v2):
    """
    Returns True if jagged text arrrays v1 & v2 contain one or more positions where both are non empty.
    Runs recursively.
    """
    if isinstance(v1, list) and isinstance(v2, list):
        for i in range(min(len(v1), len(v2))):
            if versions_overlap(v1[i], v2[i]):
                return True
    if isinstance(v1, basestring) and isinstance(v2, basestring):
        if v1 and v2:
            return True
    return False


def rename_category(old, new):
    """
    Walk through all index records, replacing every category instance
    called 'old' with 'new'.
    """
    indices = model.IndexSet({"categories": old})

    assert indices.count(), "No categories named {}".format(old)

    for i in indices:
        i.categories = [new if cat == old else cat for cat in i.categories]
        i.save()

    summaries.update_summaries()


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
            resized = resize_jagged_array(text["chapter"], delta)

        text["chapter"] = resized
        db.texts.save(text)

    # TODO Rewrite any existing Links
    # TODO Rewrite any exisitng History items

    summaries.update_summaries_on_change(title)
    scache.reset_texts_cache()

    return True


def resize_jagged_array(text, factor):
    """
    Return a resized jagged array for 'text' either up or down by int 'factor'.
    Size up if factor is positive, down if negative.
    Size up or down the number of times per factor's size.
    E.g., up twice for '2', down twice for '-2'.
    """
    new_text = text
    if factor > 0:
        for i in range(factor):
            new_text = upsize_jagged_array(new_text)
    elif factor < 0:
        for i in range(abs(factor)):
            new_text = downsize_jagged_array(new_text)

    return new_text


def upsize_jagged_array(text):
    """
    Returns a jagged array for text which restructures the content of text
    to include one additional level of structure.
    ["One", "Two", "Three"] -> [["One"], ["Two"], ["Three"]]
    """
    new_text = []
    for segment in text:
        if isinstance(segment, basestring):
            new_text.append([segment])
        elif isinstance(segment, list):
            new_text.append(upsize_jagged_array(segment))

    return new_text


def downsize_jagged_array(text):
    """
    Returns a jagged array for text which restructures the content of text
    to include one less level of structure.
    Existing segments are concatenated with " "
    [["One1", "One2"], ["Two1", "Two2"], ["Three1", "Three2"]] - >["One1 One2", "Two1 Two2", "Three1 Three2"]
    """
    new_text = []
    for segment in text:
        # Assumes segments are of uniform type, either all strings or all lists
        if isinstance(segment, basestring):
            return " ".join(text)
        elif isinstance(segment, list):
            new_text.append(downsize_jagged_array(segment))

    # Return which was filled in, defaulted to [] if both are empty
    return new_text


# move to JaggedArray?
def grab_section_from_text(sections, text, toSections=None):
    """
    Returns a section of text from within the jagged array 'text'
    that is denoted by sections and toSections.
    """
    if len(sections) == 0:
        return text
    if not text:
        return ""

    toSections = toSections or sections
    try:
        if sections[0] == toSections[0]:
            if len(sections) == 1:
                return text[sections[0]-1]
            else:
                return grab_section_from_text(sections[1:], text[sections[0]-1], toSections[1:])
        else:
            return text[ sections[0]-1 : toSections[0]-1 ]

    except IndexError:
        # Index out of bounds, we don't have this text
        return ""
    except TypeError:
        return ""
