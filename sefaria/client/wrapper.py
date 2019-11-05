# -*- coding: utf-8 -*-
import re

import logging
logger = logging.getLogger(__name__)

import json

from sefaria.model import *
from sefaria.datatype.jagged_array import JaggedTextArray
from sefaria.system.exceptions import InputError, NoVersionFoundError
from sefaria.system.database import db
from sefaria.model.text import library
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

    compDate = getattr(linkRef.index, "compDate", None)
    if compDate:
        com["compDate"] = int(compDate)
        try:
            com["errorMargin"] = int(getattr(linkRef.index, "errorMargin", 0))
        except ValueError:
            com["errorMargin"] = 0

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


def format_sheet_as_link(sheet):
    sheet["category"]        = "Commentary" if "Commentary" in sheet["groupTOC"]["categories"] else sheet["groupTOC"]["categories"][0]
    sheet["collectiveTitle"] = sheet["groupTOC"]["collectiveTitle"] if "collectiveTitle" in sheet["groupTOC"] else {"en": sheet["groupTOC"]["title"], "he": sheet["groupTOC"]["heTitle"]}
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
    If `with_sheet_links` include sheet results for sheets in groups which are listed in the TOC.
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
            com = format_link_object_for_client(link, False, nRef, pos)
        except InputError:
            logger.warning(u"Bad link: {} - {}".format(link.refs[0], link.refs[1]))
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
                        for lang in ("en", "he"):
                            top_nref_tc = TextChunk(top_oref, lang)
                            versionInfoMap = None if not top_nref_tc._versions else {
                                v.versionTitle: {
                                    'license': getattr(v, 'license', u''),
                                    'versionTitleInHebrew': getattr(v, 'versionTitleInHebrew', u'')
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
                    for lang, (attr, versionAttr, licenseAttr, vtitleInHeAttr) in (("he", ("he","heVersionTitle","heLicense","heVersionTitleInHebrew")), ("en", ("text", "versionTitle","license","versionTitleInHebrew"))):
                        temp_nref_data = texts[top_nref][lang]
                        res = temp_nref_data['ja'].subarray(com_sections[1:], com_toSections[1:]).array()
                        if attr not in com:
                            com[attr] = res
                        else:
                            if isinstance(com[attr], basestring):
                                com[attr] = [com[attr]]
                            com[attr] += res
                        temp_version = temp_nref_data['version']
                        if isinstance(temp_version, basestring) or temp_version is None:
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
            logger.warning(u"Trying to get non existent text for ref '{}'. Link refs were: {}".format(top_nref, link.refs))
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
            base_links = filter(lambda x: ((x['sourceRef'], x['anchorRef']) not in orig_links_refs) and (x["sourceRef"] != x["anchorRef"]), base_links)
            links += base_links

    links = [l for l in links if not Ref(l["anchorRef"]).is_section_level()]


    groups = library.get_groups_in_library()
    if with_sheet_links and len(groups):
        sheet_links = get_sheets_for_ref(tref, in_group=groups)
        formatted_sheet_links = [format_sheet_as_link(sheet) for sheet in sheet_links]
        links += formatted_sheet_links

    return links


class LinkNetwork(object):
    def __init__(self, base_tref):
        self.base_oref = expand_passage(Ref(base_tref))
        self.base_trefs = [r.normal() for r in self.base_oref.all_segment_refs()]
        self.indexNodes = {}
        self.indexLinks = {}
        self.coveredRefs = {r: 1 for r in self.base_trefs}

        # record root node
        rootkey = self.indexKey(self.base_oref)
        self.indexNodes[rootkey] = self.make_index_record(
            self.base_oref,
            rootkey,
            int(self.base_oref.index.compDate) - int(getattr(self.base_oref.index, "errorMargin", 0)),
            self.base_oref.index.categories[0],
            root = True
        )

        future_links = db.linknet.aggregate([
            {"$match": {"early_refs": {"$in": self.base_trefs}}},
            {"$graphLookup": {
                "from": "linknet",
                "startWith": "$late_refs",
                "connectFromField": "late_refs",
                "connectToField": "early_refs",
                "as": "future",
                "depthField": "depth"
            }},
            {"$project": {"early_index":0, "early_category":0, "late_index":0, "late_category":0}}
        ])
        past_links = db.linknet.aggregate([
            {"$match": {"late_refs": {"$in": self.base_trefs}}},
            {"$graphLookup": {
                "from": "linknet",
                "startWith": "$early_refs",
                "connectFromField": "early_refs",
                "connectToField": "late_refs",
                "as": "past",
                "depthField": "depth"
            }},
            {"$project": {"early_index": 0, "early_category": 0, "late_index": 0, "late_category": 0}}
        ])

        # Assemble all covered refs and indexes
        for g1 in future_links:
            self.record_ref(g1, "late")
            for g2 in g1["future"]:
                self.record_ref(g2, "late")

        for g1 in past_links:
            self.record_ref(g1, "early")
            for g2 in g1["past"]:
                self.record_ref(g2, "early")

        for k, n in self.indexNodes.iteritems():
            n["refs"] = sorted(list(n["refs"]))

        # Search for any connections between covered refs
        # This will include the original tree
        covered_refs = self.coveredRefs.keys()
        all_connections = db.linknet.find({
            "early_refs": {"$in": covered_refs},
            "late_refs": {"$in": covered_refs}
        })

        # Turn each link into an Index-Index edge
        for connection in all_connections:
            self.record_link(connection)

        self.cluster_refs()

    def contents(self):
        return {
            "compDate": self.base_oref.index.compDate,
            "errorMargin": self.base_oref.index.errorMargin,
            "category": self.base_oref.index.categories[0],
            "ref": self.base_oref.normal(),
            "indexNodes": self.indexNodes,
            "indexLinks": self.indexLinks.keys(),
        }

    def indexKey(self, oref):
        index = oref.index
        key = getattr(index, "collective_title", index.title)
        if "Mishneh Torah" in key:
            return "Mishneh Torah"
        if "Shulchan Arukh" in key:
            return "Shulchan Arukh"
        return key

    def record_link(self, node):
        linkkey = self.indexKey(Ref(node["early_orig_ref"])), self.indexKey(Ref(node["late_orig_ref"]))
        self.indexLinks[linkkey] = 1

    def record_ref(self, node, side):
        tref, year, trefs = (node["late_orig_ref"], node["late_year"], node["late_refs"]) if side == "late" else (node["early_orig_ref"],node["early_year"],node["early_refs"])
        oref = Ref(tref)
        cat = oref.index.categories[0]
        key = self.indexKey(oref)
        self.coveredRefs.update({r: 1 for r in trefs})

        if key in self.indexNodes:
            self.indexNodes[key]["refs"].add(oref.normal())
        else:
            self.indexNodes[key] = self.make_index_record(oref, key, year, cat)

    def cluster_refs(self):
        from sefaria.recommendation_engine import RecommendationEngine

        for k, v in self.indexNodes.iteritems():
            clusters = RecommendationEngine.cluster_close_refs([Ref(r) for r in v["refs"]], v["refs"], 1, fast=True)
            results = []
            for cluster in clusters:
                if len(cluster) == 1:
                    results += [cluster[0]["data"]]
                else:
                    results += [cluster[0]["ref"].to(cluster[-1]["ref"]).normal()]
            v["refs"] = results

    def make_index_record(self, oref, key, year, cat, root=False):
        d = {
                "title": key,
                "heTitle": hebrew_term(key),
                "compDate": year,  # get rid of
                "errorMargin": 0,  # this
                "year": year,
                "category": cat,
                "refs": {oref.normal()},
            }
        if root:
            d["root"] = True
        return d


def expand_passage(oref):
        p = Passage().load({"ref_list": oref.normal()})
        return Ref(p.full_ref) if p else oref



