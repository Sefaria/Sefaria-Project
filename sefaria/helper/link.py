# -*- coding: utf-8 -*-

import logging
logger = logging.getLogger(__name__)

from sefaria.model import *
from sefaria.system.exceptions import DuplicateRecordError, InputError
import sefaria.tracker as tracker
try:
    from sefaria.settings import USE_VARNISH
except ImportError:
    USE_VARNISH = False
if USE_VARNISH:
    from sefaria.system.sf_varnish import invalidate_ref

#TODO: should all the functions here be decoupled from the need to enter a userid?


class AbstractAutoLinker(object):
    """
    This abstract class defines the interface/contract for autolinking objects.
    There are four main methods:
    1. build_links creates the links from scratch
    2. refresh_links will update a link set by intelligently (and performace oriented) adding and deleting relevant links
    3. delete_links will delete all the links in the set
    4. rebuild_links will delete and then build the links from scratch
    """
    def __init__(self, oref, auto=True, generated_by_string=None, link_type=None, **kwargs):
        self._requested_oref = oref
        if not getattr(self, '_generated_by_string', None):
            self._generated_by_string = generated_by_string if generated_by_string else self.__class__.__name__
        if not getattr(self, '_auto', None):
            self._auto = auto
        if not getattr(self,'_link_type', None):
            self._link_type = link_type if link_type else getattr(oref.index, 'dependence', 'Commentary').lower()
        self._user = kwargs.get('user', None)
        self._title = self._requested_oref.index.title
        self._links = None

    def build_links(self, **kwargs):
        raise NotImplementedError

    def refresh_links(self, **kwargs):
        """
        :return: Meant for adding links while intelligently removing stale links
        """
        raise NotImplementedError

    def delete_links(self, **kwargs):
        """
        Deletes all of the citation generated links from text 'title'
        """
        links = self._load_links()
        for link in links:
            if USE_VARNISH:
                try:
                    invalidate_ref(Ref(link.refs[0]))
                except InputError:
                    pass
                try:
                    invalidate_ref(Ref(link.refs[1]))
                except InputError:
                    pass
            self._delete_link(link)

    def rebuild_links(self, **kwargs):
        """
        Intended to clean out all existing links and build them anew
        :return:
        """
        self.delete_links()
        return self.build_links()

    def _load_links(self):
        if not self._links:
            ref_regex_list = self._requested_oref.regex(as_list=True)
            queries = [{"refs": {"$regex": ref_regex},
                                   "generated_by": self._generated_by_string,
                                   "auto": self._auto,
                                   "type": self._link_type
                                   } for ref_regex in ref_regex_list]
            self._links = LinkSet({"$or": queries})
        return self._links

    def linkset(self):
        return self._load_links()

    def _save_link(self, tref, base_tref, **kwargs):
        nlink = {
            "refs": [base_tref, tref],
            "type": self._link_type,
            "anchorText": "",
            "auto": self._auto,
            "generated_by": self._generated_by_string
        }
        try:
            if not self._user:
                Link(nlink).save()
            else:
                tracker.add(self._user, Link, nlink, **kwargs)
        except DuplicateRecordError as e:
            pass
        return tref

    def _delete_link(self, link):
        if not self._user:
            link.delete()
        else:
            tracker.delete(self._user, Link, link._id)


class AbstractStructureAutoLinker(AbstractAutoLinker):
    """
    This class is for general linking according to two structurally identical texts.
    """
    # TODO: as error checking there should probs be a validate that checks the structures match.
    def __init__(self, oref, depth_up, linked_oref, **kwargs):
        self._linked_title = linked_oref.index.title
        self._depth_up = depth_up
        super(AbstractStructureAutoLinker, self).__init__(oref, **kwargs)

    def _generate_specific_base_tref(self, orig_ref):
        context_ref = orig_ref.context_ref(self._depth_up)
        return context_ref.normal().replace(self._title, self._linked_title)

    def _build_links_internal(self, oref, text=None, **kwargs):
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
                    found_links += self._build_links_internal(sr, stext, **kwargs)

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
                    found_links += self._build_links_internal(r, stext, **kwargs)

            # this is a single comment, trim the last section number (comment) from ref
            elif len(text["sections"]) == len(text["sectionNames"]):
                if len(text['he']) or len(text['text']): #only if there is actually text
                    #base_tref = base_tref[0:base_tref.rfind(":")]
                    base_tref = self._generate_specific_base_tref(oref)
                    found_links += [tref]
                    self._save_link(tref, base_tref, **kwargs)
        return found_links

    def build_links(self, **kwargs):
        return self._build_links_internal(self._requested_oref)

    def refresh_links(self, **kwargs):
        """
        This functino both adds links and deletes pre existing ones that are no longer valid,
        by virtue of the fact that they were not detected as commentary links while iterating over the text.
        :param tref:
        :param user:
        :param kwargs:
        :return:
        """
        existing_links = self._load_links()
        found_links = self._build_links_internal(self._requested_oref)
        for exLink in existing_links:
            for r in exLink.refs:
                if self._title not in r:  #current base ref
                    continue
                if USE_VARNISH:
                    try:
                        invalidate_ref(Ref(r))
                    except InputError:
                        pass
                if r not in found_links:
                    self._delete_link(exLink)
                break


class BaseStructureAutoLinker(AbstractStructureAutoLinker):
    """
    This linker will only allow a text to be linked to it's specified base text (currently assumes one base text)
    """
    def __init__(self, oref, depth_up, **kwargs):
        if not oref.is_dependant():
            raise Exception("Text must have a base text to link to")
        """try:"""
        base_oref = Ref(oref.index.base_text_titles[0])
        super(BaseStructureAutoLinker, self).__init__(oref, depth_up, base_oref, **kwargs)
        """except Exception as e:
            raise Exception('Text must have a base text to link to')"""


class IncrementBaseTextDepthAutoLinker(BaseStructureAutoLinker):
    def __init__(self, oref, **kwargs):
        super(IncrementBaseTextDepthAutoLinker, self).__init__(oref, 1, **kwargs)


class CommentaryAutoLinker(IncrementBaseTextDepthAutoLinker):
    """
    The classic linker, takes a n-dpeth text and
    links each group of terminal segments to the same n-1 depth terminal segment of the base text
    Used primarily for old style commentaries that are shaped like the base text

    Automatically add links for each comment in the commentary text denoted by 'tref'.
    E.g., for the ref 'Sforno on Kohelet 3:2', automatically set links for
    Kohelet 3:2 <-> Sforno on Kohelet 3:2:1, Kohelet 3:2 <-> Sforno on Kohelet 3:2:2, etc.
    for each segment of text (comment) that is in 'Sforno on Kohelet 3:2'.
    """
    class_key = 'many_to_one'
    _generated_by_string = 'add_commentary_links'


class MatchBaseTextDepthAutoLinker(BaseStructureAutoLinker):
    class_key = 'one_to_one'
    def __init__(self, oref, **kwargs):
        super(MatchBaseTextDepthAutoLinker, self).__init__(oref, 0, **kwargs)


def rebuild_links_for_title(tref, user=None):
    """
    Utility function, can be called from a view or cli. Takes a ref or a more general title to rebuild auto links
    :param tref:
    :param user:
    :return:
    """
    try:
        oref = Ref(tref)
    except InputError:
        # If not a valid ref, maybe a title of an entire corpus.
        # Allow group work names, eg. Rashi alone, rebuild for each text we have
        #TODO: there might need to be some error checking done on this
        title_indices = library.get_indices_by_collective_title(tref)
        for c in title_indices:
            rebuild_links_for_title(c, user)
        return
    linker = oref.autolinker(user=user)
    if linker:
        linker.rebuild_links()


# TODO: refactor with lexicon class map into abstract
class AutoLinkerFactory(object):
    _class_map = {
        CommentaryAutoLinker.class_key           : CommentaryAutoLinker,
        MatchBaseTextDepthAutoLinker.class_key   : MatchBaseTextDepthAutoLinker
    }
    _key_attr = 'base_text_mapping'
    _default_class = CommentaryAutoLinker

    @classmethod
    def class_factory(cls, name):
        if name in cls._class_map:
            return cls._class_map[name]
        else:
            return cls._default_class

    @classmethod
    def instance_factory(cls, name, *args, **kwargs):
        return cls.class_factory(name)(*args, **kwargs)

    @classmethod
    def instance_from_record_factory(cls, oref):
        try:
            return cls.instance_factory(oref.index[cls._key_attr], oref)
        except KeyError:
            return None


# ------------------------------------------------------------------------------------------ #

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

        if kwargs.get('citing_only') is not None:
            citing_only = kwargs['citing_only']
        else:
            citing_only = True

        refs = library.get_refs_in_string(text, lang, citing_only=citing_only)

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
                    try:
                        invalidate_ref(Ref(r))
                    except InputError:
                        pass
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
            try:
                invalidate_ref(Ref(link.refs[0]))
            except InputError:
                pass
            try:
                invalidate_ref(Ref(link.refs[1]))
            except InputError:
                pass
        tracker.delete(user, Link, link._id)


def rebuild_links_from_text(title, user):
    """
    Deletes all of the citation generated links from text 'title'
    then rebuilds them. 
    """
    delete_links_from_text(title, user)
    index = library.get_index(title)
    title = index.nodes.primary_title("en")
    versions = index.versionSet()

    def add_links_callback(snode, *contents, **kwargs):
        """
        :param snode: SchemaContentNode
        :param contents: Array of one jagged array - the contents of `snode` in one version
        :param kwargs:
        :return:
        """
        assert len(contents) == 1
        version = kwargs.get("version")
        add_links_from_text(snode.ref(), version.language, contents[0], version._id, user)

    for version in versions:
        index.nodes.visit_content(add_links_callback, version.chapter, version=version)
        # add_links_from_text(Ref(title), version.language, version.chapter, version._id, user)

# --------------------------------------------------------------------------------- #


def create_link_cluster(refs, user, link_type="", attrs=None, exception_pairs=None, exception_range = None):
    total = 0
    for i, ref in enumerate(refs):
        for j in range(i + 1, len(refs)):
            ref_strings = [refs[i].normal(), refs[j].normal()]

            # If this link matches an exception pair, skip it.
            if all([any([r.startswith(name) for r in ref_strings]) for pair in exception_pairs for name in pair]):
                continue
            # If this link matches an exception range, skip it.
            if refs[i].section_ref() == refs[j].section_ref():
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
