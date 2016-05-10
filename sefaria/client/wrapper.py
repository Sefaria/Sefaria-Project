# -*- coding: utf-8 -*-
import re

import logging
logger = logging.getLogger(__name__)

from sefaria.model import *
from sefaria.datatype.jagged_array import JaggedTextArray
from sefaria.summaries import REORDER_RULES
from sefaria.system.exceptions import InputError, NoVersionFoundError
from sefaria.model.user_profile import user_link, public_user_data


def format_link_object_for_client(link, with_text, ref, pos=None):
    #//todo: mark for comemntary refactor
    """
    :param link: Link object
    :param ref: Ref object of the source of the link
    :param pos: Optional position of the Ref in the Link.  If not passed, it will be derived from the first two arguments.
    :return: Dict
    """
    com = {}

    # The text we're asked to get links to
    anchorRef = Ref(link.refs[pos])

    # The link we found to anchorRef
    linkRef = Ref(link.refs[(pos + 1) % 2])

    com["_id"]           = str(link._id)
    com['index_title']   = linkRef.index.title
    com["category"]      = linkRef.type
    com["type"]          = link.type
    com["ref"]           = linkRef.tref
    com["anchorRef"]     = anchorRef.normal()
    com["sourceRef"]     = linkRef.normal()
    com["sourceHeRef"]   = linkRef.he_normal()
    com["anchorVerse"]   = anchorRef.sections[-1] if len(anchorRef.sections) else 0
    com["commentaryNum"] = linkRef.sections[-1] if linkRef.type == "Commentary" else 0
    com["anchorText"]    = getattr(link, "anchorText", "")

    if com["category"] in REORDER_RULES:
        com["category"] = REORDER_RULES[com["category"]][0]

    if with_text:
        text             = TextFamily(linkRef, context=0, commentary=False)
        com["text"]      = JaggedTextArray(text.text).flatten_to_array()
        com["he"]        = JaggedTextArray(text.he).flatten_to_array()

    # if the the link is commentary, strip redundant info (e.g. "Rashi on Genesis 4:2" -> "Rashi")
    if com["type"] == "commentary":
        com["commentator"]   = linkRef.book.split(" on ")[0]
        com["heCommentator"] = linkRef.he_book().split(u" על ")[0]
    else:
        if com["category"] == "Commentary":
            com["category"] = "Quoting Commentary"
        com["commentator"] = linkRef.index.title
        com["heCommentator"] = linkRef.index.get_title("he") if linkRef.index.get_title("he") else com["commentator"]

    if link.type == "targum":
        com["category"] = "Targum"

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
        "title":           note.title,
        "ownerName":       ownerData["name"],
        "ownerProfileUrl": ownerData["profileUrl"],
        "ownerImageUrl":   ownerData["imageUrl"],
    }
    return com


#this previously had signature: get_notes(tref, public=True, uid=None, pad=True, context=0)
#but all usages used: get_notes(tref, uid=request.user.id, context=1)
def get_notes(oref, public=True, uid=None, context=1):
    """
    Returns a list of notes related to ref.
    If public, include any public note.
    If uid is set, return private notes of uid.
    """
    if public:
        # S2 sets pulblic=False for fetching private notes.
        # Only maintain legacy behavior of return for context in old case
        oref = oref.padded_ref().context_ref()
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
                        texts[top_nref] = TextFamily(top_oref, context=0, commentary=False, pad=False).contents()
                        for t in ["text", "he"]:
                            texts[top_nref][t] = JaggedTextArray(texts[top_nref][t])
                    sections, toSections = com_oref.sections[1:], com_oref.toSections[1:]
                    for t in ["text", "he"]:
                        res = texts[top_nref][t].subarray(
                            [i - 1 for i in sections],
                            [i - 1 for i in toSections]
                        ).array()
                        if t not in com:
                            com[t] = res
                        else:
                            if isinstance(com[t], basestring):
                                com[t] = [com[t]]
                            com[t] += res
                        '''
                        next_section = grab_section_from_text(sections, texts[top_nref][t], toSections)
                        if t not in com:
                            com[t] = next_section
                        elif isinstance(com[t], list):
                            if isinstance(next_section, list):
                                com[t] += next_section
                            else:
                                com[t] += [next_section]
                        else: #com[t] is string
                            if isinstance(next_section, list):
                                com[t] = [com[t]] + next_section
                            else:
                                com[t] += u" " + next_section
                        '''
            links.append(com)
        except NoVersionFoundError as e:
            logger.warning("Trying to get non existent text for ref '{}'. Link refs were: {}".format(top_nref, link.refs))
            continue
    return links