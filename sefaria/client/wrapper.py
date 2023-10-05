# -*- coding: utf-8 -*-
import re

import structlog
logger = structlog.get_logger(__name__)

from sefaria.model import *
from sefaria.datatype.jagged_array import JaggedTextArray
from sefaria.system.exceptions import InputError, NoVersionFoundError
from sefaria.model.user_profile import user_link, public_user_data
from sefaria.sheets import get_sheets_for_ref
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
    anchorRef  = Ref(anchorTref)
    anchorTrefExpanded = getattr(link, "expandedRefs{}".format(pos))

    # The link we found to anchorRef
    linkPos   = (pos + 1) % 2
    linkTref  = link.refs[linkPos]
    linkRef   = Ref(linkTref)
    langs     = getattr(link, "availableLangs", [[],[]])
    linkLangs = langs[linkPos]

    com["_id"]               = str(link._id)
    com['index_title']       = linkRef.index.title
    com["category"]          = linkRef.primary_category #usually the index's categories[0] or "Commentary".
    com["type"]              = link.type
    com["ref"]               = linkTref
    com["anchorRef"]         = anchorTref
    com["anchorRefExpanded"] = anchorTrefExpanded
    com["sourceRef"]         = linkTref
    com["sourceHeRef"]       = linkRef.he_normal()
    com["anchorVerse"]       = anchorRef.sections[-1] if len(anchorRef.sections) else 0
    com["sourceHasEn"]       = "en" in linkLangs
    # com["anchorText"]        = getattr(link, "anchorText", "") # not currently used
    if getattr(link, "inline_reference", None):
        com["inline_reference"]  = getattr(link, "inline_reference", None)
    if getattr(link, "highlightedWords", None):
        com["highlightedWords"] = getattr(link, "highlightedWords", None)
    if getattr(link, "versions", None) and link.type == "essay" and getattr(link, "displayedText", None):
        com["anchorVersion"] = {"title": link.versions[pos]["title"], "language": link.versions[pos].get("language", None)}
        com["sourceVersion"] = {"title": link.versions[linkPos]["title"], "language": link.versions[linkPos].get("language", None)}
        com["displayedText"] = link.displayedText[linkPos]  # we only want source displayedText

    compDate = getattr(linkRef.index, "compDate", None)  # default comp date to in the future
    if compDate:
        com["compDate"] = compDate

    # Pad out the sections list, so that comparison between comment numbers are apples-to-apples
    lsections = linkRef.sections[:] + [0] * (linkRef.index_node.depth - len(linkRef.sections))
    # Build a decimal comment number based on the last two digits of the section array
    com["commentaryNum"] = lsections[-1] if len(lsections) == 1 \
            else float('{0}.{1:04d}'.format(*lsections[-2:])) if len(lsections) > 1 else 0

    if with_text:
        text             = TextFamily(linkRef, context=0, commentary=False)
        com["text"]      = text.text if isinstance(text.text, str) else JaggedTextArray(text.text).flatten_to_array()
        com["he"]        = text.he if isinstance(text.he, str) else JaggedTextArray(text.he).flatten_to_array()

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


def format_sheet_as_link(sheet):
    sheet["category"]        = sheet["collectionTOC"].get("dependence", sheet["collectionTOC"]["categories"][0])
    sheet["collectiveTitle"] = sheet["collectionTOC"]["collectiveTitle"] if "collectiveTitle" in sheet["collectionTOC"] else {"en": sheet["collectionTOC"]["title"], "he": sheet["collectionTOC"]["heTitle"]}
    sheet["index_title"]     = sheet["collectiveTitle"]["en"]
    sheet["sourceRef"]       = sheet["title"]
    sheet["sourceHeRef"]     = sheet["title"]
    sheet["isSheet"]         = True
    return sheet


def get_notes(oref, public=True, uid=None, context=1):
    """
    Returns a list of notes related to ref.
    If public, include any public note.
    If uid is set, return private notes of uid.
    """
    noteset = oref.noteset(public, uid)
    notes = [format_object_for_client(n) for n in noteset]

    return notes


def get_links(tref, with_text=True, with_sheet_links=False):
    """
    Return a list of links tied to 'ref' in client format.
    If `with_text`, retrieve texts for each link.
    If `with_sheet_links` include sheet results for sheets in collections which are listed in the TOC.
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
            pos = 0 if any(re.match(reRef, tref) for tref in link.expandedRefs0) else 1
        else:
            pos = 0 if any(nRef == tref[:lenRef] for tref in link.expandedRefs0) else 1
        try:
            # Skip any anchor refs that aren't segment level.  Unrolling the call to is_segment_level() here, just to save the N function calls.
            anchor_ref = Ref(link.refs[pos])
            node_depth = getattr(anchor_ref.index_node, "depth", None)
            if node_depth is None or len(anchor_ref.sections) != node_depth:
                continue

            # Skip any related refs that are super section level
            source_ref = Ref(link.refs[0 if pos == 1 else 1])
            node_depth = getattr(source_ref.index_node, "depth", None)
            if node_depth is None or len(source_ref.sections) + 1 < node_depth:
                continue

            com = format_link_object_for_client(link, False, nRef, pos)
        except InputError:
            logger.warning("Bad link: {} - {}".format(link.refs[0], link.refs[1]))
            continue
        except AttributeError as e:
            logger.error("AttributeError in presenting link: {} - {} : {}".format(link.refs[0], link.refs[1], e))
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
                        for lang in ("en", "he"):
                            top_nref_tc = TextChunk(top_oref, lang)
                            versionInfoMap = None if not top_nref_tc._versions else {
                                v.versionTitle: {
                                    'license': getattr(v, 'license', ''),
                                    'versionTitleInHebrew': getattr(v, 'versionTitleInHebrew', '')
                                } for v in top_nref_tc._versions
                            }
                            if top_nref_tc.is_merged:
                                version = top_nref_tc.sources
                                license = [versionInfoMap[vtitle]['license'] for vtitle in version]
                                versionTitleInHebrew = [versionInfoMap[vtitle]['versionTitleInHebrew'] for vtitle in version]
                            elif top_nref_tc._versions:
                                version_obj = top_nref_tc.version()
                                version = version_obj.versionTitle
                                license = versionInfoMap[version]['license']
                                versionTitleInHebrew = versionInfoMap[version]['versionTitleInHebrew']
                            else:
                                # version doesn't exist in this language
                                version = None
                                license = None
                                versionTitleInHebrew = None
                            version = top_nref_tc.sources if top_nref_tc.is_merged else (top_nref_tc.version().versionTitle if top_nref_tc._versions else None)
                            if top_nref not in texts:
                                texts[top_nref] = {}
                            texts[top_nref][lang] = {
                                'ja': top_nref_tc.ja(),
                                'version': version,
                                'license': license,
                                'versionTitleInHebrew': versionTitleInHebrew
                            }
                    com_sections = [i - 1 for i in com_oref.sections]
                    com_toSections = [i - 1 for i in com_oref.toSections]
                    for lang, (attr, versionAttr, licenseAttr, vtitleInHeAttr) in (
                            ("he", ("he","heVersionTitle","heLicense","heVersionTitleInHebrew")),
                            ("en", ("text", "versionTitle","license","versionTitleInHebrew"))):
                        temp_nref_data = texts[top_nref][lang]
                        # Because of how the jagged arrays work, res may be either a single line or a list of lines
                        res = temp_nref_data['ja'].subarray(com_sections[1:], com_toSections[1:]).array()
                        if attr not in com: # If this is the first com_oref, and so the object doesn't contain any data in this field,
                            com[attr] = res  # Set the text directly in the object
                        else:  # This is not the first oref (this was a spanning ref, e.g. "Ketubot 110b:25-111a:1".
                            # We'll want to connect the texts from all pages together. As mentioned, each can be either a string or a list.
                            if isinstance(com[attr], str):
                                com[attr] = [com[attr]]
                            if isinstance(res, str):
                                res = [res]
                            com[attr] += res  # Once they're both definitely lists, merge the lists together.
                        temp_version = temp_nref_data['version']
                        if isinstance(temp_version, str) or temp_version is None:
                            com[versionAttr] = temp_version
                            com[licenseAttr] = temp_nref_data['license']
                            com[vtitleInHeAttr] = temp_nref_data['versionTitleInHebrew']
                        else:
                            # merged. find exact version titles for each segment
                            start_sources = temp_nref_data['ja'].distance([], com_sections[1:])
                            if com_sections == com_toSections:
                                # simplify for the common case
                                versions = temp_version[start_sources] if start_sources < len(temp_version) - 1 else None
                                licenses = temp_nref_data['license'][start_sources] if start_sources < len(temp_nref_data['license']) - 1 else None
                                versionTitlesInHebrew = temp_nref_data['versionTitleInHebrew'][start_sources] if start_sources < len(temp_nref_data['versionTitleInHebrew']) - 1 else None
                            else:
                                end_sources = temp_nref_data['ja'].distance([], com_toSections[1:])
                                versions = temp_version[start_sources:end_sources + 1]
                                licenses = temp_nref_data['license'][start_sources:end_sources + 1]
                                versionTitlesInHebrew = temp_nref_data['versionTitleInHebrew'][start_sources:end_sources + 1]
                            com[versionAttr] = versions
                            com[licenseAttr] = licenses
                            com[vtitleInHeAttr] = versionTitlesInHebrew
            links.append(com)
        except NoVersionFoundError as e:
            logger.warning("Trying to get non existent text for ref '{}'. Link refs were: {}".format(top_nref, link.refs))
            continue

    # Hard-coding automatic display of links to an underlying text. bound_texts = ("Rashba on ",)
    # E.g., when requesting "Steinsaltz on X" also include links to "X" as though they were connected directly to Steinsaltz.
    bound_texts = ("Steinsaltz on ",)
    for prefix in bound_texts:
        if nRef.startswith(prefix):
            base_ref = nRef[len(prefix):]
            base_links = get_links(base_ref)
            def add_prefix(link):
                link["anchorRef"] = prefix + link["anchorRef"]
                link["anchorRefExpanded"] = [prefix + l for l in link["anchorRefExpanded"]]
                return link
            base_links = [add_prefix(link) for link in base_links]
            orig_links_refs = [(origlink['sourceRef'], origlink['anchorRef']) for origlink in links]
            base_links = [x for x in base_links if ((x['sourceRef'], x['anchorRef']) not in orig_links_refs) and (x["sourceRef"] != x["anchorRef"])]
            links += base_links

    collections = library.get_collections_in_library()
    if with_sheet_links and len(collections):
        sheet_links = get_sheets_for_ref(tref, in_collection=collections)
        formatted_sheet_links = [format_sheet_as_link(sheet) for sheet in sheet_links]
        links += formatted_sheet_links

    return links
