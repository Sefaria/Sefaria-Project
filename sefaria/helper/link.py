# -*- coding: utf-8 -*-
from sefaria.model import *
from sefaria.system.exceptions import DuplicateRecordError, InputError
from sefaria.utils.talmud import section_to_daf
import sefaria.tracker as tracker

#TODO: should all the functions here be decoupled from the need to enter a userid?
def add_commentary_links(tref, user, **kwargs):
    """
    Automatically add links for each comment in the commentary text denoted by 'tref'.
    E.g., for the ref 'Sforno on Kohelet 3:2', automatically set links for
    Kohelet 3:2 <-> Sforno on Kohelet 3:2:1, Kohelet 3:2 <-> Sforno on Kohelet 3:2:2, etc.
    for each segment of text (comment) that is in 'Sforno on Kohelet 3:2'.
    """
    oref = Ref(tref)
    text = TextFamily(oref, commentary=0, context=0, pad=False).contents()
    tref = oref.normal()

    book = tref[tref.find(" on ") + 4:]

    if len(text["sections"]) == len(text["sectionNames"]):
        # this is a single comment, trim the last section number (comment) from ref
        book = book[0:book.rfind(":")]
        link = {
            "refs": [book, tref],
            "type": "commentary",
            "anchorText": "",
            "auto": True,
            "generated_by": "add_commentary_links"
        }
        try:
            tracker.add(user, Link, link, **kwargs)
        except DuplicateRecordError as e:
            pass

    elif len(text["sections"]) == (len(text["sectionNames"]) - 1):
        # This means that the text (and it's corresponding ref) being posted has the amount of sections like the parent text
        # (the text being commented on) so this is single group of comments on the lowest unit of the parent text.
        # and we simply iterate and create a link for each existing one to point to the same unit of parent text
        length = max(len(text["text"]), len(text["he"]))
        for i in range(length):
                link = {
                    "refs": [book, tref + ":" + str(i + 1)],
                    "type": "commentary",
                    "anchorText": "",
                    "auto": True,
                    "generated_by": "add_commentary_links"
                }
                try:
                    tracker.add(user, Link, link, **kwargs)
                except DuplicateRecordError as e:
                    pass

    elif len(text["sections"]) > 0:
        # any other case where the posted ref sections do not match the length of the parent texts sections
        # this is a larger group of comments meaning it needs to be further broken down
        # in order to be able to match the commentary to the basic parent text units,
        # recur on each section
        length = max(len(text["text"]), len(text["he"]))
        for i in range(length):
            add_commentary_links("%s:%d" % (tref, i + 1), user)
    else:
        #This is a special case of the above, where the sections length is 0 and that means this is
        # a whole text that has been posted. For  this we need a better way than get_text() to get the correct length of
        # highest order section counts.
        # We use the counts document for that.
        #text_counts = counts.count_texts(tref)
        #length = len(text_counts["counts"])
        sn = StateNode(tref)
        length = sn.ja('all').length()
        for i in range(length):
            section = section_to_daf(i+1) if oref.is_talmud() else str(i+1)
            add_commentary_links("%s:%s" % (tref, section), user)


def rebuild_commentary_links(tref, user, **kwargs):
    """
    Deletes any commentary links for which there is no content (in any ref),
    then adds all commentary links again.
    """
    try:
        oref = Ref(tref)
    except InputError:
        # Allow commentators alone, rebuild for each text we have
        i = get_index(tref)
        for c in library.get_commentary_version_titles(i.title):
            rebuild_commentary_links(c, user, **kwargs)
        return

    links = LinkSet(oref)
    for link in links:
        try:
            oref1, oref2 = Ref(link.refs[0]), Ref(link.refs[1])
        except InputError:
            continue
        t1, t2 = TextFamily(oref1, commentary=0, context=0), TextFamily(oref2, commentary=0, context=0)
        if not (t1.text + t1.he) or not (t2.text + t2.he):
            # Delete any link that doesn't have some textual content on one side or the other
            link.delete()
    add_commentary_links(tref, user, **kwargs)

# todo: Currently supports only
def add_links_from_text(ref, lang, text, text_id, user, **kwargs):
    """
    Scan a text for explicit references to other texts and automatically add new links between
    ref and the mentioned text.

    text["text"] may be a list of segments, an individual segment, or None.

    Lev - added return on 13 July 2014
    """
    if not text:
        return []
    elif isinstance(text, list):
        links = []
        for i in range(len(text)):
            subtext = text[i]
            single = add_links_from_text("%s:%d" % (ref, i + 1), lang, subtext, text_id, user, **kwargs)
            links += single
        return links
    elif isinstance(text, basestring):
        existingLinks = LinkSet({
            "refs": ref,
            "auto": True,
            "generated_by": "add_links_from_text",
            "source_text_oid": text_id
        }).array()  # Added the array here to force population, so that new links don't end up in this set

        found = []  # The normal refs of the links found in this text
        links = []  # New link objects created by this processes

        refs = library.get_refs_in_string(text, lang)

        for oref in refs:
            link = {
                "refs": [ref, oref.normal()],
                "type": "",
                "auto": True,
                "generated_by": "add_links_from_text",
                "source_text_oid": text_id
            }
            found += [oref.normal()]  # Keep this here, since tracker.add will throw an error if the link exists
            try:
                tracker.add(user, Link, link, **kwargs)
                links += [link]
            except InputError as e:
                pass

        # Remove existing links that are no longer supported by the text
        for exLink in existingLinks:
            for r in exLink.refs:
                if r == ref:  # current base ref
                    continue
                if r not in found:
                    tracker.delete(user, Link, exLink._id)
                break

        return links


def rebuild_links_from_text(title, user):
    """
    Deletes all of the citatation generated links from 'title'
    then rebuilds them. 
    """
    title = Ref(title).normal()
    versions = VersionSet({"title": title})
    links = LinkSet({"title": title, "generated_by": "add_links_from_text"})
    links.delete()

    for version in versions:
        add_links_from_text(title, version.language, version.chapter, version._id, user)
