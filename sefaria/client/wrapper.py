# -*- coding: utf-8 -*-
import re

import logging
logger = logging.getLogger(__name__)

from sefaria.model import *
from sefaria.datatype.jagged_array import JaggedTextArray
from sefaria.system.exceptions import InputError, NoVersionFoundError
from sefaria.model.user_profile import user_link, public_user_data
from sefaria.utils.hebrew import hebrew_term


def format_link_object_for_client(link, with_text, ref, pos=None):
    """
    :param link: Link object
    :param ref: Ref object of the source of the link
    :param pos: Position of the Ref in the Link.  If not passed, it will be derived from the first two arguments.
    :return: Dict
    """
    com = {}

    # The text we're asked to get links to
    anchorTref = link.refs[pos]
    anchorRef = Ref(anchorTref)

    # The link we found to anchorRef
    linkTref = link.refs[(pos + 1) % 2]
    linkRef = Ref(linkTref)

    com["_id"]           = str(link._id)
    com['index_title']   = linkRef.index.title
    com["category"]      = linkRef.primary_category #usually the index's categories[0] or "Commentary".
    com["type"]          = link.type
    com["ref"]           = linkTref
    com["anchorRef"]     = anchorTref
    com["sourceRef"]     = linkTref
    com["sourceHeRef"]   = linkRef.he_normal()
    com["anchorVerse"]   = anchorRef.sections[-1] if len(anchorRef.sections) else 0
    com["anchorText"]    = getattr(link, "anchorText", "")
    com["inline_reference"] = getattr(link, "inline_reference", None)

    # Pad out the sections list, so that comparison between comment numbers are apples-to-apples
    lsections = linkRef.sections[:] + [0] * (linkRef.index_node.depth - len(linkRef.sections))
    # Build a decimal comment number based on the last two digits of the section array
    com["commentaryNum"] = lsections[-1] if len(lsections) == 1 \
            else float('{0}.{1:04d}'.format(*lsections[-2:])) if len(lsections) > 1 else 0

    if with_text:
        text             = TextFamily(linkRef, context=0, commentary=False)
        com["text"]      = text.text if isinstance(text.text, basestring) else JaggedTextArray(text.text).flatten_to_array()
        com["he"]        = text.he if isinstance(text.he, basestring) else JaggedTextArray(text.he).flatten_to_array()

    # if the the link is commentary, strip redundant info (e.g. "Rashi on Genesis 4:2" -> "Rashi")
    # this is now simpler, and there is explicit data on the index record for it.
    if com["type"] == "commentary":
        com["collectiveTitle"] = {
            'en': getattr(linkRef.index, 'collective_title', linkRef.index.title),
            'he': hebrew_term(getattr(linkRef.index, 'collective_title', linkRef.index.get_title("he")))
        }
    else:
        com["collectiveTitle"] = {'en': linkRef.index.title, 'he': linkRef.index.get_title("he")}

    if com["type"] != "commentary" and com["category"] == "Commentary":
            com["category"] = "Quoting Commentary"

    if com["category"] == "Modern Works" and getattr(linkRef.index, "dependence", None) == "Commentary":
        # print "Transforming " + linkRef.normal()
        com["category"] = "Modern Commentary"
        com["collectiveTitle"] = {
            'en': getattr(linkRef.index, 'collective_title', linkRef.index.title),
            'he': hebrew_term(getattr(linkRef.index, 'collective_title', linkRef.index.get_title("he")))
        }

    if linkRef.index_node.primary_title("he"):
        com["heTitle"] = linkRef.index_node.primary_title("he")

    return com


def format_object_for_client(obj, with_text=True, ref=None, pos=None):
    """
    Assumption here is that if obj is a Link, and ref and pos are not specified, then position 0 is the root ref.
    :param obj:
    :param ref:
    :param pos:
    :return:
    """
    if isinstance(obj, Note):
        return format_note_object_for_client(obj)
    elif isinstance(obj, Link):
        if not ref and not pos:
            ref = obj.refs[0]
            pos = 0
        return format_link_object_for_client(obj, with_text, ref, pos)
    else:
        raise InputError("{} not valid for format_object_for_client".format(obj.__class__.__name__))


def format_note_object_for_client(note):
    """
    Returns an object that represents note in the format expected by the reader client,
    matching the format of links, which are currently handled together.
    """
    anchor_oref = Ref(note.ref).padded_ref()
    ownerData   = public_user_data(note.owner)

    com = {
        "category":        "Notes",
        "type":            "note",
        "owner":           note.owner,
        "_id":             str(note._id),
        "anchorRef":       note.ref,
        "anchorVerse":     anchor_oref.sections[-1],
        "anchorText":      getattr(note, "anchorText", ""),
        "public":          getattr(note, "public", False),
        "commentator":     user_link(note.owner),
        "text":            note.text,
        "title":           getattr(note, "title", ""),
        "ownerName":       ownerData["name"],
        "ownerProfileUrl": ownerData["profileUrl"],
        "ownerImageUrl":   ownerData["imageUrl"],
    }
    return com


def get_notes(oref, public=True, uid=None, context=1):
    """
    Returns a list of notes related to ref.
    If public, include any public note.
    If uid is set, return private notes of uid.
    """
    noteset = oref.noteset(public, uid)
    notes = [format_object_for_client(n) for n in noteset]

    return notes


def get_links(tref, with_text=True):
    """
    Return a list of links tied to 'ref' in client format.
    If with_text, retrieve texts for each link.
    """
    links = []
    oref = Ref(tref)
    nRef = oref.normal()
    lenRef = len(nRef)
    reRef = oref.regex() if oref.is_range() else None

    # for storing all the section level texts that need to be looked up
    texts = {}

    linkset = LinkSet(oref)
    # For all links that mention ref (in any position)
    for link in linkset:
        # each link contains 2 refs in a list
        # find the position (0 or 1) of "anchor", the one we're getting links for
        # If both sides of the ref are in the same section of a text, only one direction will be used.  bug? maybe not.
        if reRef:
            pos = 0 if re.match(reRef, link.refs[0]) else 1
        else:
            pos = 0 if nRef == link.refs[0][:lenRef] else 1
        try:
            com = format_link_object_for_client(link, False, nRef, pos)
        except InputError:
            # logger.warning("Bad link: {} - {}".format(link.refs[0], link.refs[1]))
            continue
        except AttributeError as e:
            logger.error(u"AttributeError in presenting link: {} - {} : {}".format(link.refs[0], link.refs[1], e))
            continue

        # Rather than getting text with each link, walk through all links here,
        # caching text so that redundant DB calls can be minimized
        # If link is spanning, split into section refs and rejoin
        try:
            if with_text:
                original_com_oref = Ref(com["ref"])
                com_orefs = original_com_oref.split_spanning_ref()
                for com_oref in com_orefs:
                    top_oref = com_oref.top_section_ref()
                    # Lookup and save top level text, only if we haven't already
                    top_nref = top_oref.normal()
                    if top_nref not in texts:
                        texts[top_nref] = {lang: TextChunk(top_oref, lang).ja() for lang in ["he", "en"]}
                    sections = [i - 1 for i in com_oref.sections[1:]]
                    toSections = [i - 1 for i in com_oref.toSections[1:]]
                    for lang, attr in [("he", "he"), ("en", "text")]:
                        res = texts[top_nref][lang].subarray(sections, toSections).array()
                        if attr not in com:
                            com[attr] = res
                        else:
                            if isinstance(com[attr], basestring):
                                com[attr] = [com[attr]]
                            com[attr] += res
            links.append(com)
        except NoVersionFoundError as e:
            logger.warning("Trying to get non existent text for ref '{}'. Link refs were: {}".format(top_nref, link.refs))
            continue

    # Harded-coding automatic display of links to an underlying text. bound_texts = ("Rashba on ",)
    # E.g., when requesting "Steinsaltz on X" also include links "X" as though they were connected directly to Steinsaltz.
    bound_texts = ("Steinsaltz on ",)
    for prefix in bound_texts:
        if nRef.startswith(prefix):
            base_ref = nRef[len(prefix):]
            base_links = get_links(base_ref)
            def add_prefix(link):
                link["anchorRef"] = prefix + link["anchorRef"]
                return link
            base_links = [add_prefix(link) for link in base_links]
            orig_links_refs = [(origlink['sourceRef'], origlink['anchorRef']) for origlink in links]
            base_links = filter(lambda x: ((x['sourceRef'], x['anchorRef']) not in orig_links_refs) and (x["sourceRef"] != x["anchorRef"]), base_links)
            links += base_links

    links = [l for l in links if not Ref(l["anchorRef"]).is_section_level()]
    return links
