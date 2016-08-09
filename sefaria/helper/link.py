# -*- coding: utf-8 -*-

import logging
logger = logging.getLogger(__name__)

from sefaria.model import *
from sefaria.system.exceptions import DuplicateRecordError, InputError
from sefaria.utils.talmud import section_to_daf
import sefaria.tracker as tracker
try:
    from sefaria.settings import USE_VARNISH
except ImportError:
    USE_VARNISH = False
if USE_VARNISH:
    from sefaria.system.sf_varnish import invalidate_ref

#TODO: should all the functions here be decoupled from the need to enter a userid?


def add_and_delete_invalid_commentary_links(oref, user, **kwargs):
    """
    This functino both adds links and deletes pre existing ones that are no longer valid,
    by virtue of the fact that they were not detected as commentary links while iterating over the text.
    :param tref:
    :param user:
    :param kwargs:
    :return:
    """
    assert oref.is_commentary()
    tref = oref.normal()
    commentary_book_name = oref.index.title

    ref_regex = oref.regex()
    existing_links = LinkSet({"refs": {"$regex": ref_regex}, "generated_by": "add_commentary_links"})
    found_links = add_commentary_links(oref, user, **kwargs)
    for exLink in existing_links:
        for r in exLink.refs:
            if commentary_book_name not in r:  #current base ref
                continue
            if USE_VARNISH:
                invalidate_ref(Ref(r))
            if r not in found_links:
                tracker.delete(user, Link, exLink._id)
            break


def add_commentary_links(oref, user, text=None, **kwargs):
    #//TODO: commentary refactor, also many other lines can be made better
    """
    Automatically add links for each comment in the commentary text denoted by 'tref'.
    E.g., for the ref 'Sforno on Kohelet 3:2', automatically set links for
    Kohelet 3:2 <-> Sforno on Kohelet 3:2:1, Kohelet 3:2 <-> Sforno on Kohelet 3:2:2, etc.
    for each segment of text (comment) that is in 'Sforno on Kohelet 3:2'.
    """

    assert oref.is_commentary()
    tref = oref.normal()
    base_tref = tref[tref.find(" on ") + 4:]
    base_oref = Ref(base_tref)
    found_links = []

    # This is a special case, where the sections length is 0 and that means this is
    # a whole text or complex text node that has been posted. So we get each leaf node
    if not oref.sections:
        vs = StateNode(tref).versionState
        if not vs.is_new_state:
            vs.refresh()  # Needed when saving multiple nodes in a complex text.  This may be moderately inefficient.
        content_nodes = oref.index_node.get_leaf_nodes()
        for r in content_nodes:
            cn_oref = r.ref()
            text = TextFamily(cn_oref, commentary=0, context=0, pad=False).contents()
            length = cn_oref.get_state_ja().length()
            for i, sr in enumerate(cn_oref.subrefs(length)):
                stext = {"sections": sr.sections,
                        "sectionNames": text['sectionNames'],
                        "text": text["text"][i] if i < len(text["text"]) else "",
                        "he": text["he"][i] if i < len(text["he"]) else ""
                        }
                found_links += add_commentary_links(sr, user, stext, **kwargs)

    else:
        if not text:
            try:
                text = TextFamily(oref, commentary=0, context=0, pad=False).contents()
            except AssertionError:
                logger.warning(u"Structure node passed to add_commentary_links: {}".format(oref.normal()))
                return

        if len(text["sectionNames"]) > len(text["sections"]) > 0:
            # any other case where the posted ref sections do not match the length of the parent texts sections
            # this is a larger group of comments meaning it needs to be further broken down
            # in order to be able to match the commentary to the basic parent text units,
            # recur on each section
            length = max(len(text["text"]), len(text["he"]))
            for i,r in enumerate(oref.subrefs(length)):
                stext = {"sections": r.sections,
                        "sectionNames": text['sectionNames'],
                        "text": text["text"][i] if i < len(text["text"]) else "",
                        "he": text["he"][i] if i < len(text["he"]) else ""
                        }
                found_links += add_commentary_links(r, user, stext, **kwargs)

        # this is a single comment, trim the last section number (comment) from ref
        elif len(text["sections"]) == len(text["sectionNames"]):
            if len(text['he']) or len(text['text']): #only if there is actually text
                base_tref = base_tref[0:base_tref.rfind(":")]
                link = {
                    "refs": [base_tref, tref],
                    "type": "commentary",
                    "anchorText": "",
                    "auto": True,
                    "generated_by": "add_commentary_links"
                }
                found_links += [tref]
                try:
                    tracker.add(user, Link, link, **kwargs)
                except DuplicateRecordError as e:
                    pass
    return found_links


def delete_commentary_links(title, user):
    """
    Deletes all of the citation generated links from text 'title'
    """
    regex = Ref(title).regex()
    links = LinkSet({"refs": {"$regex": regex}, "generated_by": "add_commentary_links"})
    for link in links:
        if USE_VARNISH:
            invalidate_ref(Ref(link.refs[0]))
            invalidate_ref(Ref(link.refs[1]))
        tracker.delete(user, Link, link._id)


def rebuild_commentary_links(title, user):
    """
    Deletes all of the citation generated links from text 'title'
    then rebuilds them.
    """
    try:
        oref = Ref(title)
    except InputError:
        # Allow commentators alone, rebuild for each text we have
        i = library.get_index(title)
        for c in library.get_commentary_version_titles(i.title):
            rebuild_commentary_links(Ref(c), user)
        return
    delete_commentary_links(title, user)
    add_commentary_links(Ref(title), user)


def add_links_from_text(oref, lang, text, text_id, user, **kwargs):
    """
    Scan a text for explicit references to other texts and automatically add new links between
    ref and the mentioned text.

    text["text"] may be a list of segments, an individual segment, or None.

    The set of no longer supported links (`existingLinks` - `found`) is deleted.
    If Varnish is used, all linked refs, old and new, are refreshed

    Returns `links` - the list of links added.
    """
    if not text:
        return []
    elif isinstance(text, list):
        subrefs = oref.subrefs(len(text))
        links   = []
        for i in range(len(text)):
            single = add_links_from_text(subrefs[i], lang, text[i], text_id, user, **kwargs)
            links += single
        return links
    elif isinstance(text, basestring):
        """
            Keeps three lists:
            * existingLinks - The links that existed before the text was rescanned
            * found - The links found in this scan of the text
            * links - The new links added in this scan of the text

            The set of no longer supported links (`existingLinks` - `found`) is deleted.
            The set of all links (`existingLinks` + `Links`) is refreshed in Varnish.
        """
        existingLinks = LinkSet({
            "refs": oref.normal(),
            "auto": True,
            "generated_by": "add_links_from_text",
            "source_text_oid": text_id
        }).array()  # Added the array here to force population, so that new links don't end up in this set

        found = []  # The normal refs of the links found in this text
        links = []  # New link objects created by this processes

        refs = library.get_refs_in_string(text, lang)

        for linked_oref in refs:
            link = {
                # Note -- ref of the citing text is in the first position
                "refs": [oref.normal(), linked_oref.normal()],
                "type": "",
                "auto": True,
                "generated_by": "add_links_from_text",
                "source_text_oid": text_id
            }
            found += [linked_oref.normal()]  # Keep this here, since tracker.add will throw an error if the link exists
            try:
                tracker.add(user, Link, link, **kwargs)
                links += [link]
                if USE_VARNISH:
                    invalidate_ref(linked_oref)
            except InputError as e:
                pass

        # Remove existing links that are no longer supported by the text
        for exLink in existingLinks:
            for r in exLink.refs:
                if r == oref.normal():  # current base ref
                    continue
                if USE_VARNISH:
                    invalidate_ref(Ref(r))
                if r not in found:
                    tracker.delete(user, Link, exLink._id)
                break

        return links


def delete_links_from_text(title, user):
    """
    Deletes all of the citation generated links from text 'title'
    """
    regex    = Ref(title).regex()
    links    = LinkSet({"refs.0": {"$regex": regex}, "generated_by": "add_links_from_text"})
    for link in links:
        if USE_VARNISH:
            invalidate_ref(Ref(link.refs[0]))
            invalidate_ref(Ref(link.refs[1]))
        tracker.delete(user, Link, link._id)


def rebuild_links_from_text(title, user):
    """
    Deletes all of the citation generated links from text 'title'
    then rebuilds them. 
    """
    delete_links_from_text(title, user)
    title    = Ref(title).normal()
    versions = VersionSet({"title": title})

    for version in versions:
        add_links_from_text(Ref(title), version.language, version.chapter, version._id, user)


def create_link_cluster(refs, user, link_type="", attrs=None, exception_pairs=None):
    total = 0
    for i, ref in enumerate(refs):
        for j in range(i + 1, len(refs)):
            ref_strings = [refs[i].normal(), refs[j].normal()]

            # If this link matches an exception pair, skip it.
            if all([any([r.startswith(name) for r in ref_strings]) for pair in exception_pairs for name in pair]):
                continue

            d = {
                "refs": ref_strings,
                "type": link_type
                }
            if attrs:
                d.update(attrs)
            try:
                tracker.add(user, Link, d)
                print u"Created {} - {}".format(d["refs"][0], d["refs"][1])
                total += 1
            except Exception as e:
                print u"Exception: {}".format(e)
    return total