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

#AbstractTextToBaseTextLinker
class AbstractAutoLinker(object):
    """
    This abstract class defines the interface/contract for autolinking objects.
    There are four main methods:
    1. build_links creates the links from scratch
    2. refresh_links will update a link set by intelligently (and performace oriented) adding and deleting relevant links
    3. delete_links will delete all the links in the set
    4. rebuild_links will delete and then build the links from scratch
    """
    def __init__(self, oref, generated_by_string, auto, type_string, **kwargs):
        self._requested_oref = oref
        self._generated_by_string = generated_by_string
        self._auto = auto
        self._link_type = type_string
        self._user = kwargs.get('user', None)
        self._title = self._requested_oref.index.title

    def build_links(self):
        raise NotImplementedError

    def refresh_links(self):
        """
        :return: Meant for adding links while intelligently removing stale links
        """
        raise NotImplementedError

    def delete_links(self):
        raise NotImplementedError

    def rebuild_links(self):
        """
        Inrended to clean out all existing links and build them anew
        :return:
        """
        raise NotImplementedError

    def _save_link(self, tref, base_tref, **kwargs):
        link = {
            "refs": [base_tref, tref],
            "type": self._link_type,
            "anchorText": "",
            "auto": self._auto,
            "generated_by": self._generated_by_string
        }
        try:
            if not self._user:
                link.save()
            else:
                tracker.add(self._user, Link, link, **kwargs)
        except DuplicateRecordError as e:
            pass
        return tref

#link any two texts by structure
#TODO: as error checking there should probs be a validate that checks the structures match.
class AbstractStructureAutoLinker(AbstractAutoLinker):
    """
    This class is for general linking according to two structurally identical texts.
    """
    def __init__(self, oref, generated_by_string, auto, type_string, linked_oref, depth_up=1, **kwargs):
        self._linked_nref = linked_oref.normal()
        self._linked_title = linked_oref.index.title
        self._depth_up = depth_up
        super(AbstractStructureAutoLinker, self).__init__(oref, generated_by_string, auto, type_string, **kwargs)

    def _generate_specific_base_tref(self, orig_ref):
        context_ref = orig_ref.context_ref(self._depth_up)
        return context_ref.normal().replace(self._title, self._linked_title)


    def _build_links_internal(self, oref, text=None):
        tref = oref.normal()
        #base_tref = tref[tref.find(" on ") + 4:]
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
                    found_links += self._build_links_internal(sr, stext)

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
                    found_links += self._build_links_internal(r, stext)

            # this is a single comment, trim the last section number (comment) from ref
            elif len(text["sections"]) == len(text["sectionNames"]):
                if len(text['he']) or len(text['text']): #only if there is actually text
                    #base_tref = base_tref[0:base_tref.rfind(":")]
                    base_tref = self._generate_specific_base_tref(oref)
                    found_links += [tref]
                    self._save_link(tref, base_tref)
        return found_links

    def build_links(self, **kwargs):
        return self._build_links_internal(self._requested_oref)



class BaseStructureAutoLinker(AbstractStructureAutoLinker):
    """
    This linker will only allow a text to be linked to it's specified base text (currently assumes one base text)
    """
    def __init__(self, oref, generated_by_string='add_commentary_links', auto=True, type_string="commentary", depth_up=1, **kwargs):
        if not oref.is_dependant():
            raise Exception("Text must have a base text to link to")
        try:
            base_oref = Ref(self._requested_oref.index.base_text_titles[0])
            super(BaseStructureAutoLinker, self).__init__(oref, generated_by_string, auto, type_string, base_oref, depth_up, **kwargs)
        except Exception as e:
            raise Exception('Text must have a base text to link to')



class IncrementBaseDepthAutoLinker(BaseStructureAutoLinker):
    """
    The classic linker, takes a n-dpeth text and
    links each group of terminal segments to the same n-1 depth terminal segment of the base text
    Used primarily for old style commentaries that are shaped like the base text

    Automatically add links for each comment in the commentary text denoted by 'tref'.
    E.g., for the ref 'Sforno on Kohelet 3:2', automatically set links for
    Kohelet 3:2 <-> Sforno on Kohelet 3:2:1, Kohelet 3:2 <-> Sforno on Kohelet 3:2:2, etc.
    for each segment of text (comment) that is in 'Sforno on Kohelet 3:2'.
    """
    def __init__(self, oref, **kwargs):
        super(IncrementBaseDepthAutoLinker, self).__init__(oref, depth_up=1, **kwargs)


class SameBaseDepthAutoLinker(BaseStructureAutoLinker):
    def __init__(self, oref, **kwargs):
        super(SameBaseDepthAutoLinker, self).__init__(oref, depth_up=0, **kwargs)


# TODO: refactor with lexicon class map into abstract
class AutoLinkerFactory(object):
    _class_map = {
        'increment_base_text_depth' : IncrementBaseDepthAutoLinker,
        'match_base_text_depth' : SameBaseDepthAutoLinker
    }
    _key_attr = 'mapping_scheme'
    _default_class = IncrementBaseDepthAutoLinker

    @classmethod
    def class_factory(cls, name):
        if name in cls._class_map:
            return cls._class_map[name]
        else:
            return cls._default_class

    @classmethod
    def instance_factory(cls, name, attrs=None):
        return cls.class_factory(name)(attrs)

    @classmethod
    def instance_from_record_factory(cls, record):
        return cls.instance_factory(record[cls._key_attr], record)


def add_and_delete_invalid_commentary_links(oref, user, **kwargs):
    #// mark for commentary refactor
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





def delete_commentary_links(title, user):
    #// mark for commentary refactor
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
    #// mark for commentary refactor
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


def create_link_cluster(refs, user, link_type="", attrs=None):
    for i, ref in enumerate(refs):
        for j in range(i + 1, len(refs)):
            d = {
                "refs": [refs[i].normal(), refs[j].normal()],
                "type": link_type
                }
            if attrs:
                d.update(attrs)
            try:
                tracker.add(user, Link, d)
                print u"Created {} - {}".format(d["refs"][0], d["refs"][1])
            except Exception as e:
                print u"Exception: {}".format(e)
