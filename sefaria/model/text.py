# -*- coding: utf-8 -*-
"""
text.py
"""

import logging
logger = logging.getLogger(__name__)

import sys
import regex
import copy
import bleach
import json
import itertools

try:
    import re2 as re
    re.set_fallback_notification(re.FALLBACK_WARNING)
except ImportError:
    logging.warning("Failed to load 're2'.  Falling back to 're' for regular expression parsing. See https://github.com/blockspeiser/Sefaria-Project/wiki/Regular-Expression-Engines")
    import re

from . import abstract as abst
from schema import deserialize_tree, SchemaNode, JaggedArrayNode, TitledTreeNode, AddressTalmud, TermSet, TitleGroup

import sefaria.system.cache as scache
from sefaria.system.exceptions import InputError, BookNameError, PartialRefInputError, IndexSchemaError, NoVersionFoundError
from sefaria.utils.talmud import daf_to_section
from sefaria.utils.hebrew import is_hebrew, hebrew_term
from sefaria.utils.util import list_depth
from sefaria.datatype.jagged_array import JaggedTextArray, JaggedArray
from sefaria.settings import DISABLE_INDEX_SAVE, USE_VARNISH

"""
                ----------------------------------
                 Index, IndexSet, CommentaryIndex
                ----------------------------------
"""


class AbstractIndex(object):
    def contents(self, v2=False, raw=False, **kwargs):
        pass

    def versionSet(self):
        return VersionSet({"title": self.title})

    def versionState(self):
        from . import version_state
        return version_state.VersionState(self.title)

    def is_new_style(self):
        return bool(getattr(self, "nodes", None))

    def get_title(self, lang="en"):
        if lang == "en":
            return self._title

        if self.is_new_style():
            return self.nodes.primary_title(lang)
        else:
            return getattr(self, "heTitle", None)

    def set_title(self, title, lang="en"):
        if lang == "en":
            self._title = title #we need to store the title attr in a physical storage, not that .title is a virtual property
        if self.is_new_style():
            if lang == "en":
                self.nodes.key = title

            old_primary = self.nodes.primary_title(lang)
            self.nodes.add_title(title, lang, True, True)
            if old_primary != title: #then remove the old title, we don't want it.
                self.nodes.remove_title(old_primary, lang)

    title = property(get_title, set_title)

    def all_section_refs(self):
        refs = []
        vs = self.versionState()
        content_nodes = self.nodes.get_leaf_nodes()
        for c in content_nodes:
            try:
                state_ja = vs.state_node(c).ja("all")
                for indxs in state_ja.non_empty_sections():
                    sections = [a + 1 for a in indxs]
                    refs += [Ref(
                        _obj={
                            "index": vs.index,
                            "book": vs.index.nodes.full_title("en"),
                            "type": vs.index.categories[0],
                            "index_node": c,
                            "sections": sections,
                            "toSections": sections
                        }
                    )]
            except Exception as e:
                logger.warning(u"Failed to generate references for {}, section {}. {}".format(c.full_title("en"), ".".join([str(s) for s in sections]) if sections else "-", e.message))
        return refs

    def all_segment_refs(self):
        seg_refs = []
        for sec_ref in self.all_section_refs():
            seg_refs += sec_ref.all_subrefs()
        return seg_refs

    def all_top_section_refs(self):
        """Returns a list of refs one step below root"""
        section_refs = self.all_section_refs()
        tally = {}
        refs = []
        for oref in section_refs:
            top_ref = oref.top_section_ref()
            if not top_ref.normal() in tally:
                tally[top_ref.normal()] = 1
                refs.append(top_ref)
        return refs

    def author_objects(self):
        from . import person
        return [person.Person().load({"key": k}) for k in getattr(self, "authors", []) if person.Person().load({"key": k})]

    def composition_time_period(self):
        return None

    def composition_place(self):
        return None

    def publication_place(self):
        return None

    def publication_time_period(self):
        return None

    def contents_with_content_counts(self):
        """
        Returns the `contents` dictionary with each node annotated with section lengths info
        from version_state.
        """
        contents = self.contents(v2=True)
        vstate   = self.versionState()

        def simplify_version_state(vstate_node):
            return aggregate_available_texts(vstate_node["_all"]["availableTexts"])

        def aggregate_available_texts(available):
            """Returns a jagged arrary of ints that counts the number of segments in each section,
            (by throwing out the number of versions of each segment)""" 
            if len(available) == 0 or type(available[0]) is int:
                return len(available)
            else:
                return [aggregate_available_texts(x) for x in available]

        def annotate_schema(schema, vstate):
            if "nodes" in schema:
                for node in schema["nodes"]:
                    annotate_schema(node, vstate[node["key"]])
            else:
                schema["content_counts"] = simplify_version_state(vstate)

        annotate_schema(contents["schema"], vstate.content)
        return contents


class Index(abst.AbstractMongoRecord, AbstractIndex):
    """
    Index objects define the names and structure of texts stored in the system.

    There is an Index object for every simple text and for every commentator (e.g. "Rashi").

    Commentaries (like "Rashi on Exodus") are instantiated with :class:`CommentaryIndex` objects.
    """
    collection = 'index'
    history_noun = 'index'
    criteria_field = 'title'
    criteria_override_field = 'oldTitle'  # used when primary attribute changes. field that holds old value.
    track_pkeys = True
    pkeys = ["title"]

    required_attrs = [
        "title",
        "categories"
    ]
    optional_attrs = [
        "titleVariants",      # required for old style
        "schema",             # required for new style
        "sectionNames",       # required for old style simple texts, sometimes erroneously present for commnetary
        "heTitle",            # optional for old style
        "heTitleVariants",    # optional for old style
        "maps",               # deprecated
        "alt_structs",        # optional for new style
        "default_struct",     # optional for new style
        "order",              # optional for old style and new
        "length",             # optional for old style
        "lengths",            # optional for old style
        "transliteratedTitle",# optional for old style
        "authors",
        "enDesc",
        "heDesc",
        "pubDate",
        "compDate",
        "compPlace",
        "pubPlace",
        "errorMargin",
        "era",
    ]

    def __unicode__(self):
        return u"Index: {}".format(self.title)

    def __str__(self):
        return unicode(self).encode('utf-8')

    def __repr__(self):  # Wanted to use orig_tref, but repr can not include Unicode
        return u"{}().load({{'title': '{}'}})".format(self.__class__.__name__, self.title)

    def save(self, override_dependencies=False):
        if DISABLE_INDEX_SAVE:
            raise InputError("Index saving has been disabled on this system.")
        return super(Index, self).save(override_dependencies=override_dependencies)

    def _set_derived_attributes(self):
        if getattr(self, "schema", None):
            self.nodes = deserialize_tree(self.schema, index=self)
            self.nodes.validate()
        else:
            self.nodes = None

        self.struct_objs = {}
        if getattr(self, "alt_structs", None) and self.nodes:
            for name, struct in self.alt_structs.items():
                self.struct_objs[name] = deserialize_tree(struct, index=self, struct_class=TitledTreeNode)
                self.struct_objs[name].title_group = self.nodes.title_group
                self.struct_objs[name].validate()

    def is_complex(self):
        return getattr(self, "nodes", None) and self.nodes.has_children()

    def contents(self, v2=False, raw=False, force_complex=False, **kwargs):
        if not getattr(self, "nodes", None) or raw:  # Commentator
            return super(Index, self).contents()
        elif v2:
            return self.nodes.as_index_contents()
        return self.legacy_form(force_complex=force_complex)

    def legacy_form(self, force_complex=False):
        """
        :param force_complex: Forces a complex Index record into legacy form
        :return: Returns an Index object as a flat dictionary, in version one form.
        :raise: Exception if the Index cannot be expressed in the old form
        """
        if not self.nodes.is_flat() and not force_complex:
            raise InputError("Index record {} can not be converted to legacy API form".format(self.title))

        d = {
            "title": self.title,
            "categories": self.categories[:],
            "titleVariants": self.nodes.all_node_titles("en"),
        }

        if self.nodes.is_flat():
            d["sectionNames"] = self.nodes.sectionNames[:]
            d["heSectionNames"] = map(hebrew_term, self.nodes.sectionNames)
            d["addressTypes"] = self.nodes.addressTypes[:]  # This isn't legacy, but it was needed for checkRef
            d["textDepth"] = len(self.nodes.sectionNames)
        if getattr(self, "order", None):
            d["order"] = self.order[:]
        if getattr(self.nodes, "lengths", None):
            d["lengths"] = self.nodes.lengths[:]
            d["length"] = self.nodes.lengths[0]
        if self.nodes.primary_title("he"):
            d["heTitle"] = self.nodes.primary_title("he")
        if self.nodes.all_node_titles("he"):
            d["heTitleVariants"] = self.nodes.all_node_titles("he")
        else:
            d["heTitleVariants"] = []

        return d

    def _saveable_attrs(self):
        d = {k: getattr(self, k) for k in self._saveable_attr_keys() if hasattr(self, k)}
        if getattr(self, "nodes", None):
            d["schema"] = self.nodes.serialize()
        if getattr(self, "struct_objs", None):
            d["alt_structs"] = {}
            for name, obj in self.struct_objs.items():
                c = obj.serialize()
                del c["titles"]
                d["alt_structs"][name] = c
        return d

    def is_commentary(self):
        return self.categories[0] == "Commentary"

    def get_commentary_indexes(self):
        if not self.is_commentary():
            return [self]
        return list({v.get_index() for v in library.get_commentary_versions(self.title)})

    def all_titles(self, lang):
        if self.nodes:
            return self.nodes.all_tree_titles(lang)
        else:
            return None  # Handle commentary case differently?

    '''         Alternate Title Structures          '''
    def set_alt_structure(self, name, struct_obj):
        """
        :param name: String
        :param struct_obj:  :py.class:`TitledTreeNode`
        :return:
        """
        self.struct_objs[name] = struct_obj

    def get_alt_structure(self, name):
        """
        :returns: :py.class:`TitledTreeNode`
        """
        return self.struct_objs.get(name)

    def get_alt_structures(self):
        return self.struct_objs

    def has_alt_structures(self):
        return bool(self.struct_objs)

    #These next 3 functions parallel functions on Library, but are simpler.  Refactor?
    def alt_titles_dict(self, lang):
        title_dict = {}
        for key, tree in self.get_alt_structures().items():
            title_dict.update(tree.title_dict(lang))
        return title_dict

    def alt_titles_regex(self, lang):
        full_title_list = self.alt_titles_dict(lang).keys()
        alt_titles = map(re.escape, full_title_list)
        reg = u'(?P<title>' + u'|'.join(sorted(alt_titles, key=len, reverse=True)) + ur')($|[:., ]+)'
        try:
            reg = re.compile(reg, max_mem= 256 * 1024 * 1024)
        except TypeError:
            reg = re.compile(reg)

        return reg

    def get_alt_struct_node(self, title, lang=None):
        if not lang:
            lang = "he" if is_hebrew(title) else "en"
        return self.alt_titles_dict(lang).get(title)

    def composition_place(self):
        from . import place
        if getattr(self, "compPlace", None) is None:
            return None
        return place.Place().load({"key": self.compPlace})

    def publication_place(self):
        from . import place
        if getattr(self, "pubPlace", None) is None:
            return None
        return place.Place().load({"key": self.pubPlace})

    # This is similar to logic on GardenStop
    def composition_time_period(self):
        return self._get_time_period("compDate", "errorMargin")

    def publication_time_period(self):
        return self._get_time_period("pubDate")

    def _get_time_period(self, date_field, margin_field=None):
        from . import time
        if not getattr(self, date_field, None):
            return None

        errorMargin = int(getattr(self, margin_field, 0)) if margin_field else 0
        startIsApprox = endIsApprox = errorMargin > 0

        try:
            year = int(getattr(self, date_field))
            start = year - errorMargin
            end = year + errorMargin
        except ValueError as e:
            years = getattr(self, date_field).split("-")
            if years[0] == "" and len(years) == 3:  #Fix for first value being negative
                years[0] = -int(years[1])
                years[1] = int(years[2])
            start = int(years[0]) - errorMargin
            end = int(years[1]) + errorMargin
        return time.TimePeriod({
            "start": start,
            "startIsApprox": startIsApprox,
            "end": end,
            "endIsApprox": endIsApprox
        })

    # Index changes behavior of load_from_dict, so this circumvents that changed behavior to call load_from_dict on the abstract superclass
    def update_from_dict(self, d):
        return super(Index, self).load_from_dict(d, is_init=False)

    def load_from_dict(self, d, is_init=False):
        if d:
            if not d.get("categories"):
                raise InputError(u"Please provide category for Index record: {}.".format(d.get("title")))

            # Data is being loaded from dict in old format, rewrite to new format
            # Assumption is that d has a complete title collection
            if "schema" not in d and d["categories"][0] != "Commentary":
                node = getattr(self, "nodes", None)
                if node:
                    node._init_titles()
                else:
                    node = JaggedArrayNode()

                node.key = d.get("title")

                if node.is_flat():
                    sn = d.pop("sectionNames", None)
                    if sn:
                        node.sectionNames = sn
                        node.depth = len(node.sectionNames)
                    else:
                        raise InputError(u"Please specify section names for Index record.")

                    if d["categories"][0] == "Talmud":
                        node.addressTypes = ["Talmud", "Integer"]
                        if d["categories"][1] == "Bavli" and d.get("heTitle"):
                            node.checkFirst = {
                                "he": u"משנה" + " " + d.get("heTitle"),
                                "en": "Mishnah " + d.get("title")
                            }
                    elif d["categories"][0] == "Mishnah":
                        node.addressTypes = ["Perek", "Mishnah"]
                    else:
                        if getattr(node, "addressTypes", None) is None:
                            node.addressTypes = ["Integer" for _ in range(node.depth)]

                    l = d.pop("length", None)
                    if l:
                        node.lengths = [l]

                    ls = d.pop("lengths", None)
                    if ls:
                        node.lengths = ls  #overwrite if index.length is already there

                #Build titles
                node.add_title(d["title"], "en", True)

                tv = d.pop("titleVariants", None)
                if tv:
                    for t in tv:
                        lang = "he" if is_hebrew(t) else "en"
                        node.add_title(t, lang)

                ht = d.pop("heTitle", None)
                if ht:
                    node.add_title(ht, "he", True)

                htv = d.pop("heTitleVariants", None)
                if htv:
                    for t in htv:
                        node.add_title(t, "he")

                d["schema"] = node.serialize()

            # todo: should this functionality be on load()?
            if "oldTitle" in d and "title" in d and d["oldTitle"] != d["title"]:
                self.load({"title": d["oldTitle"]})
                # self.titleVariants.remove(d["oldTitle"])  # let this be determined by user
        return super(Index, self).load_from_dict(d, is_init)

    def _normalize(self):
        self.title = self.title.strip()
        self.title = self.title[0].upper() + self.title[1:]

        if isinstance(getattr(self, "authors", None), basestring):
            self.authors = [self.authors]

        if not self.is_commentary():
            if not self.is_new():
                for t in [self.title, self.nodes.primary_title("en"), self.nodes.key]:  # This sets a precedence order
                    if t != self.pkeys_orig_values["title"]:  # One title changed, update all of them.
                        self.title = t
                        self.nodes.key = t
                        self.nodes.add_title(t, "en", True, True)
                        break

        if getattr(self, "nodes", None) is None:
            if not getattr(self, "titleVariants", None):
                self.titleVariants = []

            self.titleVariants = [v[0].upper() + v[1:] for v in self.titleVariants]
            # Ensure primary title is listed among title variants
            if self.title not in self.titleVariants:
                self.titleVariants.append(self.title)
            self.titleVariants = list(set([v for v in self.titleVariants if v]))

        # Not sure how these string values are sneaking in here...
        if getattr(self, "heTitleVariants", None) is not None and isinstance(self.heTitleVariants, basestring):
            self.heTitleVariants = [self.heTitleVariants]

        if getattr(self, "heTitle", None) is not None:
            if getattr(self, "heTitleVariants", None) is None:
                self.heTitleVariants = [self.heTitle]
            elif self.heTitle not in self.heTitleVariants:
                self.heTitleVariants.append(self.heTitle)
            self.heTitleVariants = list(set([v for v in getattr(self, "heTitleVariants", []) if v]))

    def _validate(self):
        assert super(Index, self)._validate()

        # Keys that should be non empty lists
        non_empty = ["categories"]

        ''' No longer required for new format
        if not self.is_commentary():
            non_empty.append("sectionNames")
        '''
        for key in non_empty:
            if not isinstance(getattr(self, key, None), list) or len(getattr(self, key, [])) == 0:
                raise InputError(u"{} field must be a non empty list of strings.".format(key))

        #allow only ASCII in text titles
        try:
            self.title.decode('ascii')
        except (UnicodeDecodeError, UnicodeEncodeError):
            raise InputError("Text title may contain only simple English characters.")

        # Disallow special characters in text titles
        if any((c in ':.-\\/') for c in self.title):
            raise InputError("Text title may not contain periods, hyphens or slashes.")

        # Disallow special character in categories
        for cat in self.categories:
            if any((c in '.-') for c in cat):
                raise InputError("Categories may not contain periods or hyphens.")

        # Disallow special character in sectionNames
        if getattr(self, "sectionNames", None):
            for sec in self.sectionNames:
                if any((c in '.-\\/') for c in sec):
                    raise InputError("Text Structure names may not contain periods, hyphens or slashes.")

        #New style records
        if self.nodes:
            # Make sure that all primary titles match
            if self.title != self.nodes.primary_title("en") or self.title != self.nodes.key:
                raise InputError(u"Primary titles mismatched in Index Record: {}, {}, {}"
                                 .format(self.title, self.nodes.primary_title("en"), self.nodes.key))

            # Make sure all titles are unique
            for lang in ["en", "he"]:
                all_titles = self.all_titles(lang)
                """
                # Note: Because these titles come from the keys of TitledTreeNode.titleDict(), there's no possibility for name collision.
                # todo: actually test for name collision
                if len(all_titles) != len(set(all_titles)):
                    for title in all_titles:
                        if all_titles.count(title) > 1:
                            raise InputError(u'The title {} occurs twice in this Index record'.format(title))
                """
                for title in all_titles:
                    existing = library.get_schema_node(title, lang)
                    existing_index = existing.index if existing else Index().load({"title": title})
                    if existing_index and not self.same_record(existing_index) and existing_index.title != self.pkeys_orig_values.get("title"):
                        raise InputError(u'A text called "{}" already exists.'.format(title))

            self.nodes.validate()
            for key, tree in self.get_alt_structures().items():
                tree.validate()

        else:  # old style commentator record
            assert self.is_commentary(), "Saw old style index record that's not a commentary.  Panic!"
            assert getattr(self, "titleVariants", None)
            if not getattr(self, "heTitle", None):
                raise InputError(u'Missing Hebrew title on {}.'.format(self.title))
            if not getattr(self, "heTitleVariants", None):
                raise InputError(u'Missing Hebrew title variants on {}.'.format(self.title))

        # Make sure all title variants are unique
        if getattr(self, "titleVariants", None):
            for variant in self.titleVariants:
                existing = Index().load({"$or": [{"titleVariants": variant}, {"title": variant}]})
                if existing and not self.same_record(existing) and existing.title != self.pkeys_orig_values.get("title"):
                    #if not getattr(self, "oldTitle", None) or existing.title != self.oldTitle:
                    raise InputError(u'A text called "{}" already exists.'.format(variant))

        if getattr(self, "authors", None) and not isinstance(self.authors, list):
            raise InputError(u'{} authors must be a list.'.format(self.title))

        return True


    def toc_contents(self):
        """Returns to a dictionary used to represent this text in the library wide Table of Contents"""
        firstSection = Ref(self.title).first_available_section_ref()
        toc_contents_dict = {
            "title": self.get_title(),
            "heTitle": self.get_title("he"),
            "categories": self.categories[:],
            "firstSection": firstSection.normal() if firstSection else None
        }
        if hasattr(self,"order"):
            toc_contents_dict["order"] = self.order[:]
        if self.categories[0] == u"Commentary2":
            toc_contents_dict["commentator"]   = self.categories[2]
            toc_contents_dict["heCommentator"] = hebrew_term(self.categories[2])
            on_split = self.get_title().split(" on ")
            if len(on_split) == 2:
                try:
                    i = library.get_index(on_split[1])
                    if getattr(i, "order", None):
                        toc_contents_dict["order"] = i.order
                except BookNameError:
                    pass

        return toc_contents_dict


class IndexSet(abst.AbstractMongoSet):
    """
    A set of :class:`Index` objects.
    """
    recordClass = Index

    # Index changes behavior of load_from_dict, so this circumvents that changed behavior to call load_from_dict on the abstract superclass
    def update(self, attrs):
        for rec in self:
            rec.update_from_dict(attrs).save()


class CommentaryIndex(AbstractIndex):
    """
    A virtual Index for commentary records.

    :param commentator_name: A title variant of a commentator :class:`Index` record
    :param book_name:  A title variant of a book :class:`Index` record
    """
    def __init__(self, commentator_name, book_name):
        """
        :param commentator_name: A title variant of a commentator :class:Index record
        :param book_name:  A title variant of a book :class:Index record
        :return:
        """
        self.c_index = Index().load({
            "titleVariants": commentator_name,
            "categories.0": "Commentary"
        })
        if not self.c_index:
            raise BookNameError(u"No commentator named '{}'.".format(commentator_name))

        self.b_index = Index().load({
            "title": book_name
        })
        if not self.b_index:
            try:
                self.b_index = library.get_index(book_name)
            except NameError as e:
                raise InputError(u"Failed in library instanciation.  No book named '{}'.".format(book_name))

        if not self.b_index:
            raise BookNameError(u"No book named '{}'.".format(book_name))

        if self.b_index.is_commentary():
            raise BookNameError(u"We don't yet support nested commentaries '{} on {}'.".format(commentator_name, book_name))

        # This whole dance is a bit of a mess.
        # Todo: see if we can clean it up a bit
        # could expose the b_index and c_index records to consumers of this object, and forget the renaming
        self.__dict__.update(self.c_index.contents())
        self.commentaryBook = self.b_index.get_title()
        self.commentaryCategories = self.b_index.categories
        self.categories = ["Commentary"] + [self.b_index.categories[0], commentator_name]
        self.commentator = commentator_name
        if getattr(self.b_index, "order", None):
            self.order = self.b_index.order
        if getattr(self, "heTitle", None):
            self.heCommentator = self.heBook = self.heTitle # why both?

        # todo: this assumes flat structure
        # self.nodes = JaggedArrayCommentatorNode(self.b_index.nodes, index=self)
        def extend_leaf_nodes(node):
            node.index = self

            try:
                del node.checkFirst
            except AttributeError:
                pass

            if node.has_children():
                return node
            #return JaggedArrayCommentatorNode(node, index=self)
            node.addressTypes += ["Integer"]
            node.sectionNames += ["Comment"]
            node.depth += 1
            return node

        '''
        commentor_index = kwargs.get("index", None)
        assert commentor_index.is_commentary(), "Non-commentator index {} passed to JaggedArrayCommentatorNode".format(commentor_index.title)
        self.basenode = basenode
        parameters = {
            "addressTypes": basenode.addressTypes + ["Integer"],
            "sectionNames": basenode.sectionNames + ["Comment"],
            "depth": basenode.depth + 1
        }
        if getattr(basenode, "lengths", None):
            parameters["lengths"] = basenode.lengths
        super(JaggedArrayCommentatorNode, self).__init__({}, parameters, **kwargs)

        self.key = basenode.key
        self.title_group = basenode.title_group.copy()
        '''

        self.nodes = self.b_index.nodes.copy(extend_leaf_nodes)

        self.nodes.title_group = TitleGroup()  # Reset all titles

        en_cross_product = [c + " on " + b for c in self.c_index.titleVariants for b in self.b_index.nodes.all_node_titles("en")]
        self.title = self.c_index.title + " on " + self.b_index.get_title()  # Calls AbstractIndex.setTitle - will set nodes.key and nodes.primary_title
        for title in en_cross_product:
            self.nodes.add_title(title, "en")

        cnames = getattr(self.c_index, "heTitleVariants", None)
        cprimary = getattr(self.c_index, "heTitle", None)
        if cnames and cprimary:
            he_cross_product = [c + u" על " + b for c in cnames for b in self.b_index.nodes.all_node_titles("he")]
            self.set_title(cprimary + u" על " + self.b_index.get_title("he"), "he")
            for title in he_cross_product:
                self.nodes.add_title(title, "he")
        else:
            logger.warning("No Hebrew title for {}".format(self.title))

        # todo: handle 'alone' titles in b_index - add "commentator on" to them

        self.schema = self.nodes.serialize()
        self.nodes = deserialize_tree(self.schema, index=self)  # reinit nodes so that derived attributes are instanciated

        self.titleVariants = self.nodes.all_node_titles("en")
        self.heTitle = self.nodes.primary_title("he")
        self.heTitleVariants = self.nodes.all_node_titles("he")
        if getattr(self.nodes, "lengths", None):   #seems superfluous w/ nodes above
            self.length = self.nodes.lengths[0]


    def __unicode__(self):
        return u"{}: {} on {}".format(self.__class__.__name__, self.c_index.title, self.b_index.title)

    def __str__(self):
        return unicode(self).encode('utf-8')

    def __repr__(self):  # Wanted to use orig_tref, but repr can not include Unicode
        return u"{}({}, {})".format(self.__class__.__name__, self.c_index.title, self.b_index.title)


    def is_commentary(self):
        return True

    def is_complex(self):
        return self.b_index.is_complex()

    #  todo: integrate alt structure on commentary?
    def has_alt_structures(self):
        return False

    def get_alt_structures(self):
        return {}

    def copy(self):
        #todo: this doesn't seem to be used.
        #todo: make this quicker, by utilizing copy methods of the composed objects
        return copy.deepcopy(self)

    def toc_contents(self):
        firstSection = Ref(self.title).first_available_section_ref()

        toc_contents_dict = {
            "title": self.title,
            "heTitle": getattr(self, "heTitle", None),
            "commentator": self.commentator,
            "heCommentator": self.heCommentator,
            "categories": self.categories,
            "firstSection": firstSection.normal() if firstSection else None
        }
        if hasattr(self,"order"):
            toc_contents_dict["order"] = self.order
        return toc_contents_dict

    #todo: this needs help
    def contents(self, v2=False, raw=False, **kwargs):
        if v2:
            return self.nodes.as_index_contents()

        attrs = copy.copy(vars(self))
        del attrs["c_index"]
        del attrs["b_index"]
        del attrs["nodes"]

        attrs['schema'] = self.nodes.serialize(expand_shared=True, expand_titles=True, translate_sections=True)

        if not self.nodes.children:
            attrs["sectionNames"]   = self.nodes.sectionNames
            attrs["heSectionNames"] = map(hebrew_term, self.nodes.sectionNames)
            attrs["textDepth"]      = len(self.nodes.sectionNames)

        return attrs

"""
                    -------------------
                     Versions & Chunks
                    -------------------
"""

class AbstractSchemaContent(object):
    content_attr = "content"

    def get_content(self):
        return getattr(self, self.content_attr, None)

    def content_node(self, snode):
        """
        :param snode:
        :type snode SchemaContentNode:
        :return:
        """
        return self.sub_content(snode.version_address())

    def sub_content_with_ref(self, ref=None, value=None):
        assert isinstance(ref, Ref)
        assert not ref.is_range()
        return self.sub_content(ref.index_node.version_address(), [i - 1 for i in ref.sections], value)

    #TODO: test me
    def sub_content(self, key_list=None, indx_list=None, value=None):
        """
        Get's or sets values deep within the content of this version.
        This returns the result by reference, NOT by value.
        http://stackoverflow.com/questions/27339165/slice-nested-list-at-variable-depth
        :param key_list: The node keys to traverse to get to the content node
        :param indx_list: The indexes of the subsection to get/set
        :param value: The value to set.  If present, the method acts as a setter.  If None, it acts as a getter.
        """
        # todo check that the shape of value matches the shape of the piece being set

        if not key_list:
            key_list = []
        if not indx_list:
            indx_list = []
        ja = reduce(lambda d, k: d[k], key_list, self.get_content())
        if indx_list:
            sa = reduce(lambda a, i: a[i], indx_list[:-1], ja)
            #
            # todo: If the existing array has smaller dimension than the value being set, then it needs to be padded.
            if value is not None:
                # only works at lowest level
                # if indx_list[-1] >= len(sa):
                #     sa += [""] * (indx_list[-1] - len(sa) + 1)
                sa[indx_list[-1]] = value
            return sa[indx_list[-1]]
        else:
            if value is not None:
                ja[:] = value
            return ja


class AbstractTextRecord(object):
    """
    """
    text_attr = "chapter"
    ALLOWED_TAGS    = ("i", "b", "br", "u", "strong", "em", "big", "small", "img", "sup")
    ALLOWED_ATTRS   = {'i': ['data-commentator', 'data-order'], 'img': lambda name, value: name == 'src' and value.startswith("data:image/")}

    def word_count(self):
        """ Returns the number of words in this text """
        return self.ja().word_count()

    def char_count(self):
        """ Returns the number of characters in this text """
        return self.ja().char_count()

    def verse_count(self):
        """ Returns the number of verses in this text """
        return self.ja().verse_count()

    def ja(self): #don't cache locally unless change is handled.  Pontential to cache on JA class level
        return JaggedTextArray(getattr(self, self.text_attr, None))

    def as_string(self):
        content = getattr(self, self.text_attr, None)
        if isinstance(content, basestring):
            return content
        elif isinstance(content, list):
            return self.ja().flatten_to_string()
        else:
            return ""

    @classmethod
    def sanitize_text(cls, t):
        if isinstance(t, list):
            for i, v in enumerate(t):
                t[i] = TextChunk.sanitize_text(v)
        elif isinstance(t, basestring):
            t = bleach.clean(t, tags=cls.ALLOWED_TAGS, attributes=cls.ALLOWED_ATTRS)
        else:
            return False
        return t

    # Currently assumes that text is JA
    def _sanitize(self):
        setattr(self, self.text_attr,
                self.sanitize_text(getattr(self, self.text_attr, None))
        )


class Version(abst.AbstractMongoRecord, AbstractTextRecord, AbstractSchemaContent):
    """
    A version of a text.

    Relates to a complete single record from the texts collection.
    """
    history_noun = 'text'
    collection = 'texts'
    content_attr = "chapter"
    track_pkeys = True
    pkeys = ["title", "versionTitle"]

    required_attrs = [
        "language",
        "title",    # FK to Index.title
        "versionSource",
        "versionTitle",
        "chapter"  # required.  change to "content"?
    ]
    optional_attrs = [
        "status",
        "priority",
        "license",
        "licenseVetted",
        "versionNotes",
        "digitizedBySefaria",
        "method",
        "heversionSource",  # bad data?
        "versionUrl"  # bad data?
    ]

    def __unicode__(self):
        return u"Version: {} <{}>".format(self.title, self.versionTitle)

    def __str__(self):
        return unicode(self).encode('utf-8')

    def __repr__(self):  # Wanted to use orig_tref, but repr can not include Unicode
        return u"{}().load({{'title': '{}', 'versionTitle': '{}'}})".format(self.__class__.__name__, self.title, self.versionTitle)

    def _validate(self):
        assert super(Version, self)._validate()
        """
        Old style database text record have a field called 'chapter'
        Version records in the wild have a field called 'text', and not always a field called 'chapter'
        """
        return True

    def _normalize(self):
        if getattr(self, "priority", None):
            try:
                self.priority = float(self.priority)
            except ValueError as e:
                self.priority = None

    def get_index(self):
        return library.get_index(self.title)

    def first_section_ref(self):
        """
        Returns a :class:`Ref` to the first non-empty location in this version.
        """
        i = self.get_index()
        leafnodes = i.nodes.get_leaf_nodes()
        for leaf in leafnodes:
            ja = JaggedTextArray(self.content_node(leaf))
            indx_array = ja.next_index()
            if indx_array:
                return Ref(_obj={
                    "index": i,
                    "book": leaf.full_title("en"),
                    "type": i.categories[0],
                    "index_node": leaf,
                    "sections": [i + 1 for i in indx_array],
                    "toSections": [i + 1 for i in indx_array]
                }).section_ref()
        return None

    def ja(self):
        # the quickest way to check if this is a complex text
        if isinstance(getattr(self, self.text_attr, None), dict):
            nodes = self.get_index().nodes.get_leaf_nodes()
            return JaggedTextArray([self.content_node(node) for node in nodes])
        else:
            return super(Version, self).ja()

    def is_copyrighted(self):
        return "Copyright" in getattr(self, "license", "")


class VersionSet(abst.AbstractMongoSet):
    """
    A collection of :class:`Version` objects
    """
    recordClass = Version

    def __init__(self, query={}, page=0, limit=0, sort=[["priority", -1], ["_id", 1]], proj=None):
        super(VersionSet, self).__init__(query, page, limit, sort, proj)

    def word_count(self):
        return sum([v.word_count() for v in self])

    def char_count(self):
        return sum([v.char_count() for v in self])

    def verse_count(self):
        return sum([v.verse_count() for v in self])

    def merge(self, node=None):
        """
        Returns merged result, but does not change underlying data
        """
        for v in self:
            if not getattr(v, "versionTitle", None):
                logger.error("No version title for Version: {}".format(vars(v)))
        if node is None:
            return merge_texts([getattr(v, "chapter", []) for v in self], [getattr(v, "versionTitle", None) for v in self])
        return merge_texts([v.content_node(node) for v in self], [getattr(v, "versionTitle", None) for v in self])


# used in VersionSet.merge(), merge_text_versions(), and export.export_merged()
# todo: move this to JaggedTextArray class?
# Doesn't work for complex texts
def merge_texts(text, sources):
    """
    This is a recursive function that merges the text in multiple
    translations to fill any gaps and deliver as much text as
    possible.
    e.g. [["a", ""], ["", "b", "c"]] becomes ["a", "b", "c"]
    """
    if not (len(text) and len(sources)):
        return ["", []]

    depth = list_depth(text)
    if depth > 2:
        results = []
        result_sources = []
        for x in range(max(map(len, text))):
            translations = map(None, *text)[x]
            remove_nones = lambda x: x or []
            result, source = merge_texts(map(remove_nones, translations), sources)
            results.append(result)
            # NOTE - the below flattens the sources list, so downstream code can always expect
            # a one dimensional list, but in so doing the mapping of source names to segments
            # is lost for merged texts of depth > 2 (this mapping is not currenly used in general)
            result_sources += source
        return [results, result_sources]

    if depth == 1:
        text = map(lambda x: [x], text)

    merged = map(None, *text)
    text = []
    text_sources = []
    for verses in merged:
        # Look for the first non empty version (which will be the oldest, or one with highest priority)
        index, value = 0, 0
        for i, version in enumerate(verses):
            if version:
                index = i
                value = version
                break
        text.append(value)
        text_sources.append(sources[index])

    if depth == 1:
        # strings were earlier wrapped in lists, now unwrap
        text = text[0]
    return [text, text_sources]


class TextChunk(AbstractTextRecord):
    """
    A chunk of text corresponding to the provided :class:`Ref`, language, and optionall version name.
    If it is possible to get a more complete text by merging multiple versions, a merged result will be returned.

    :param oref: :class:`Ref`
    :param lang: "he" or "en"
    :param vtitle: optional. Title of the version desired.
    """
    text_attr = "text"

    def __init__(self, oref, lang="en", vtitle=None, exclude_copyrighted=False):
        """
        :param oref:
        :type oref: Ref
        :param lang: "he" or "en"
        :param vtitle:
        :return:
        """
        if isinstance(oref.index_node, JaggedArrayNode):
            self._oref = oref
        else:
            child_ref = oref.default_child_ref()
            if child_ref == oref:
                raise InputError("Can not get TextChunk at this level, please provide a more precise reference")
            self._oref = child_ref
        self._ref_depth = len(self._oref.sections)
        self._versions = []
        self._saveable = False  # Can this TextChunk be saved?

        self.lang = lang
        self.is_merged = False
        self.sources = []
        self.text = self._original_text = self.empty_text()
        self.vtitle = vtitle

        self.full_version = None
        self.versionSource = None  # handling of source is hacky

        if lang and vtitle:
            self._saveable = True
            v = Version().load({"title": self._oref.index.title, "language": lang, "versionTitle": vtitle}, self._oref.part_projection())
            if exclude_copyrighted and v.is_copyrighted():
                raise InputError("Can not provision copyrighted text. {} ({}/{})".format(oref.normal(), vtitle, lang))
            if v:
                self._versions += [v]
                self.text = self._original_text = self.trim_text(v.content_node(self._oref.index_node))
        elif lang:
            vset = VersionSet(self._oref.condition_query(lang), proj=self._oref.part_projection())

            if vset.count() == 0:
                if VersionSet({"title": self._oref.index.title}).count() == 0:
                    raise NoVersionFoundError("No text record found for '{}'".format(self._oref.index.title))
                return
            if vset.count() == 1:
                v = vset[0]
                if exclude_copyrighted and v.is_copyrighted():
                    raise InputError("Can not provision copyrighted text. {} ({}/{})".format(oref.normal(), v.versionTitle, v.language))
                self._versions += [v]
                self.text = self.trim_text(v.content_node(self._oref.index_node))
                #todo: Should this instance, and the non-merge below, be made saveable?
            else:  # multiple versions available, merge
                if exclude_copyrighted:
                    vset.remove(Version.is_copyrighted)
                merged_text, sources = vset.merge(self._oref.index_node)  #todo: For commentaries, this merges the whole chapter.  It may show up as merged, even if our part is not merged.
                self.text = self.trim_text(merged_text)
                if len(set(sources)) == 1:
                    for v in vset:
                        if v.versionTitle == sources[0]:
                            self._versions += [v]
                            break
                else:
                    self.sources = sources
                    self.is_merged = True
                    self._versions = vset.array()
        else:
            raise Exception("TextChunk requires a language.")

    def __unicode__(self):
        args = u"{}, {}".format(self._oref, self.lang)
        if self.vtitle:
            args += u", {}".format(self.vtitle)
        return args

    def __str__(self):
        return unicode(self).encode('utf-8')

    def __repr__(self):  # Wanted to use orig_tref, but repr can not include Unicode
        args = u"{}, {}".format(self._oref, self.lang)
        if self.vtitle:
            args += u", {}".format(self.vtitle)
        return u"{}({})".format(self.__class__.__name__, args)

    def is_empty(self):
        return self.ja().is_empty()

    def ja(self):
        return JaggedTextArray(self.text)

    def save(self, force_save=False):
        """
        For editing in place (i.e. self.text[3] = "Some text"), it is necessary to set force_save to True. This is
        because by editing in place, both the self.text and the self._original_text fields will get changed,
        causing the save to abort.
        :param force_save: If set to True, will force a save even if no change was detected in the text.
        :return:
        """
        assert self._saveable, u"Tried to save a read-only text: {}".format(self._oref.normal())
        assert not self._oref.is_range(), u"Only non-range references can be saved: {}".format(self._oref.normal())
        #may support simple ranges in the future.
        #self._oref.is_range() and self._oref.range_index() == len(self._oref.sections) - 1
        if not force_save:
            if self.text == self._original_text:
                logger.warning(u"Aborted save of {}. No change in text.".format(self._oref.normal()))
                return False

        self._validate()
        self._sanitize()
        self._trim_ending_whitespace()

        if not self.version():
            self.full_version = Version(
                {
                    "chapter": self._oref.index.nodes.create_skeleton(),
                    "versionTitle": self.vtitle,
                    "versionSource": self.versionSource,
                    "language": self.lang,
                    "title": self._oref.index.title
                }
            )
        else:
            self.full_version = Version().load({"title": self._oref.index.title, "language": self.lang, "versionTitle": self.vtitle})
            assert self.full_version, u"Failed to load Version record for {}, {}".format(self._oref.normal(), self.vtitle)
            if self.versionSource:
                self.full_version.versionSource = self.versionSource  # hack

        content = self.full_version.sub_content(self._oref.index_node.version_address())
        self._pad(content)
        self.full_version.sub_content(self._oref.index_node.version_address(), [i - 1 for i in self._oref.sections], self.text)

        self.full_version.save()
        self._oref.recalibrate_next_prev_refs(len(self.text))

        return self

    def _pad(self, content):
        """
        Pads the passed content to the dimension of self._oref.
        Acts on the input variable 'content' in place
        Does not yet handle ranges
        :param content:
        :return:
        """

        for pos, val in enumerate(self._oref.sections):
            # at pos == 0, parent_content == content
            # at pos == 1, parent_content == chapter
            # at pos == 2, parent_content == verse
            # etc
            parent_content = reduce(lambda a, i: a[i - 1], self._oref.sections[:pos], content)

            # Pad out existing content to size of ref
            if len(parent_content) < val:
                for _ in range(len(parent_content), val):
                    parent_content.append("" if pos == self._oref.index_node.depth - 1 else [])

            # check for strings where arrays expected, except for last pass
            if pos < self._ref_depth - 2 and isinstance(parent_content[val - 1], basestring):
                parent_content[val - 1] = [parent_content[val - 1]]

    def _trim_ending_whitespace(self):
        """
        Trims blank segments from end of every section
        :return:
        """
        self.text = JaggedTextArray(self.text).trim_ending_whitespace().array()

    def _validate(self):
        """
        validate that depth/breadth of the TextChunk.text matches depth/breadth of the Ref
        :return:
        """
        posted_depth = 0 if isinstance(self.text, basestring) else list_depth(self.text)
        ref_depth = self._oref.range_index() if self._oref.is_range() else self._ref_depth
        implied_depth = ref_depth + posted_depth
        if implied_depth != self._oref.index_node.depth:
            raise InputError(
                u"Text Structure Mismatch. The stored depth of {} is {}, but the text posted to {} implies a depth of {}."
                .format(self._oref.index_node.full_title(), self._oref.index_node.depth, self._oref.normal(), implied_depth)
            )

        #validate that length of the array matches length of the ref
        #todo: double check for depth >= 3
        if self._oref.is_spanning():
            span_size = self._oref.span_size()
            if posted_depth == 0: #possible?
                raise InputError(
                        u"Text Structure Mismatch. {} implies a length of {} sections, but the text posted is a string."
                        .format(self._oref.normal(), span_size)
                )
            elif posted_depth == 1: #possible?
                raise InputError(
                        u"Text Structure Mismatch. {} implies a length of {} sections, but the text posted is a simple list."
                        .format(self._oref.normal(), span_size)
                )
            else:
                posted_length = len(self.text)
                if posted_length != span_size:
                    raise InputError(
                        u"Text Structure Mismatch. {} implies a length of {} sections, but the text posted has {} elements."
                        .format(self._oref.normal(), span_size, posted_length)
                    )
                #todo: validate last section size if provided

        elif self._oref.is_range():
            range_length = self._oref.range_size()
            if posted_depth == 0:
                raise InputError(
                        u"Text Structure Mismatch. {} implies a length of {}, but the text posted is a string."
                        .format(self._oref.normal(), range_length)
                )
            elif posted_depth == 1:
                posted_length = len(self.text)
                if posted_length != range_length:
                    raise InputError(
                        u"Text Structure Mismatch. {} implies a length of {}, but the text posted has {} elements."
                        .format(self._oref.normal(), range_length, posted_length)
                    )
            else:  # this should never happen.  The depth check should catch it.
                raise InputError(
                    u"Text Structure Mismatch. {} implies an simple array of length {}, but the text posted has depth {}."
                    .format(self._oref.normal(), range_length, posted_depth)
                )

    #maybe use JaggedArray.subarray()?
    def trim_text(self, txt):
        """
        Trims a text loaded from Version record with self._oref.part_projection() to the specifications of self._oref
        This works on simple Refs and range refs of unlimited depth and complexity.
        (in place?)
        :param txt:
        :return: List|String depending on depth of Ref
        """
        range_index = self._oref.range_index()
        sections = self._oref.sections
        toSections = self._oref.toSections

        if not sections:
            pass
        else:
            for i in range(0, self._ref_depth):
                if i == 0 == range_index:  # First level slice handled at DB level
                    pass
                elif range_index > i:  # Either not range, or range begins later.  Return simple value.
                    if i == 0 and len(txt):   # We already sliced the first level w/ Ref.part_projection()
                        txt = txt[0]
                    elif len(txt) >= sections[i]:
                        txt = txt[sections[i] - 1]
                    else:
                        return self.empty_text()
                elif range_index == i:  # Range begins here
                    start = sections[i] - 1
                    end = toSections[i]
                    txt = txt[start:end]
                else:  # range_index < i, range continues here
                    begin = end = txt
                    for _ in range(range_index, i - 1):
                        begin = begin[0]
                        end = end[-1]
                    begin[0] = begin[0][sections[i] - 1:]
                    end[-1] = end[-1][:toSections[i]]

        return txt

    def empty_text(self):
        """
        :return: Either empty array or empty string, depending on depth of Ref
        """
        if not self._oref.is_range() and self._ref_depth == self._oref.index_node.depth:
            return ""
        else:
            return []

    def version(self):
        """
        Returns the Version record for this chunk
        :return Version:
        :raises Exception: if the TextChunk is merged
        """
        if not self._versions:
            return None
        if len(self._versions) == 1:
            return self._versions[0]
        else:
            raise Exception("Called TextChunk.version() on merged TextChunk.")

    def text_index_map(self,tokenizer=lambda x: re.split(u'\s+',x), strict=True):
        """
        Primarily used for depth-2 texts in order to get index/ref pairs relative to the full text string
         indexes are the word index in word_list

        tokenizer: f(str)->list(str) - function to split up text
        strict: if True, throws error if len(ind_list) != len(ref_list). o/w truncates longer array to length of shorter
        :return: (list,list,list) - index_list, ref_list, word_list
        """
        #TODO there is a known error that this will fail if the text version you're using has fewer segments than the VersionState.
        ind_list = []
        r = self._oref

        if r.is_range():
            input_refs = r.range_list()
        else:
            input_refs = [r]

        ref_list = []
        for temp_ref in input_refs:
            if temp_ref.is_segment_level():
                ref_list.append(temp_ref)
            elif temp_ref.is_section_level():
                ref_list += temp_ref.all_subrefs()
            else: #you're higher than section level
                sub_ja = temp_ref.get_state_ja().subarray_with_ref(temp_ref)
                ref_list_sections = [temp_ref.subref([i + 1 for i in k ]) for k in sub_ja.non_empty_sections() ]
                ref_list += [ref_seg for ref_sec in ref_list_sections for ref_seg in ref_sec.all_subrefs()]



        total_len = 0
        text_list = self.ja().flatten_to_array()
        for i,segment in enumerate(text_list):
            ind_list.append(total_len)
            total_len += len(tokenizer(segment))

        if len(ind_list) != len(ref_list):
            if strict:
                raise ValueError("The number of refs doesn't match the number of starting words. len(refs)={} len(inds)={}".format(len(ref_list),len(ind_list)))
            else:
                print "Warning: The number of refs doesn't match the number of starting words. len(refs)={} len(inds)={}".format(len(ref_list),len(ind_list))
                if len(ind_list) > len(ref_list):
                    ind_list = ind_list[:len(ref_list)]
                else:
                    ref_list = ref_list[:len(ind_list)]

        return ind_list,ref_list



# Mirrors the construction of the old get_text() method.
# The TextFamily.contents() method will return a dictionary in the same format that was provided by get_text().
class TextFamily(object):
    """
    A text with its translations and optionally the commentary on it.

    Can be instanciated with just the first argument.

    :param oref: :class:`Ref`.  This is the only required argument.
    :param int context: Default: 1. How many context levels up to go when getting commentary.  See :func:`Ref.context_ref`
    :param bool commentary: Default: True. Include commentary?
    :param version: optional. Name of version to use when getting text.
    :param lang: None, "en" or "he".  Default: None.  If None, included both languages.
    :param bool pad: Default: True.  Pads the provided ref before processing.  See :func:`Ref.padded_ref`
    :param bool alts: Default: False.  Adds notes of where alternate structure elements begin
    """
    #Attribute maps used for generating dict format
    text_attr_map = {
        "en": "text",
        "he": "he"
    }

    attr_map = {
        "versionTitle": {
            "en": "versionTitle",
            "he": "heVersionTitle"
        },
        "versionSource": {
            "en": "versionSource",
            "he": "heVersionSource"
        },
        "status": {
            "en": "versionStatus",
            "he": "heVersionStatus"
        },
        "license": {
            "en": "license",
            "he": "heLicense",
            "condition": "licenseVetted",
            "default": "unknown"
        },
        "versionNotes": {
            "en": "versionNotes",
            "he": "heVersionNotes"
        },
        "digitizedBySefaria": {
            "en": "digitizedBySefaria",
            "he": "heDigitizedBySefaria",
            "default": False,
        }
    }
    sourceMap = {
        "en": "sources",
        "he": "heSources"
    }

    def __init__(self, oref, context=1, commentary=True, version=None, lang=None, pad=True, alts=False):
        """
        :param oref:
        :param context:
        :param commentary:
        :param version:
        :param lang:
        :param pad:
        :param alts: Adds notes of where alt elements begin
        :return:
        """
        if pad:
            oref = oref.padded_ref()
        elif oref.has_default_child():
            oref = oref.default_child_ref()

        self.ref            = oref.normal()
        self.heRef          = oref.he_normal()
        self.isComplex      = oref.index.is_complex()
        self.text           = None
        self.he             = None
        self._lang          = lang
        self._original_oref = oref
        self._context_oref  = None
        self._chunks        = {}
        self._inode         = oref.index_node
        self._alts          = []

        if not isinstance(oref.index_node, JaggedArrayNode):
            raise InputError("Can not get TextFamily at this level, please provide a more precise reference")

        for i in range(0, context):
            oref = oref.context_ref()
        self._context_oref = oref

        # processes "en" and "he" TextChunks, and puts the text in self.text and self.he, respectively.
        for language, attr in self.text_attr_map.items():
            if language == lang:
                c = TextChunk(oref, language, version)
            else:
                c = TextChunk(oref, language)
            self._chunks[language] = c
            setattr(self, self.text_attr_map[language], c.text)

        if oref.is_spanning():
            self.spanning = True

        if commentary:
            from sefaria.client.wrapper import get_links
            if not oref.is_spanning():
                links = get_links(oref.normal())  #todo - have this function accept an object
            else:
                links = [get_links(r.normal()) for r in oref.split_spanning_ref()]
            self.commentary = links if "error" not in links else []

        # get list of available versions of this text
        self.versions = oref.version_list()

        # Adds decoration for the start of each alt structure reference
        if alts:
            # Set up empty Array that mirrors text structure
            alts_ja = JaggedArray()

            for key, struct in oref.index.get_alt_structures().iteritems():
                # Assuming these are in order, continue if it is before ours, break if we see one after
                for n in struct.get_leaf_nodes():
                    wholeRef = Ref(n.wholeRef).as_ranged_segment_ref()
                    if wholeRef.ending_ref().precedes(oref):
                        continue
                    if wholeRef.starting_ref().follows(oref):
                        break

                    #It's in our territory
                    wholeRefStart = wholeRef.starting_ref()
                    if oref.contains(wholeRefStart) and not oref == wholeRefStart:
                        indxs = [k - 1 for k in wholeRefStart.in_terms_of(oref)]
                        val = {"en":[], "he":[]}

                        try:
                            val = alts_ja.get_element(indxs)
                        except IndexError:
                            pass

                        val["en"] += [n.primary_title("en")]
                        val["he"] += [n.primary_title("he")]
                        val["whole"] = True

                        alts_ja.set_element(indxs, val)

                    if getattr(n, "refs", None):
                        for i, r in enumerate(n.refs):
                            # hack to skip Rishon, skip empty refs
                            if i==0 or not r:
                                continue;
                            subRef = Ref(r)
                            subRefStart = subRef.starting_ref()
                            if oref.contains(subRefStart) and not oref == subRefStart:
                                indxs = [k - 1 for k in subRefStart.in_terms_of(oref)]
                                val = {"en":[], "he":[]}

                                try:
                                    a = alts_ja.get_element(indxs)
                                    if a:
                                        val = a
                                except IndexError:
                                    pass

                                val["en"] += [n.sectionString([i + 1], "en", title=False)]
                                val["he"] += [n.sectionString([i + 1], "he", title=False)]

                                alts_ja.set_element(indxs, val)

                            elif subRefStart.follows(oref):
                                break

            self._alts = alts_ja.array()

    def contents(self):
        """
        :return dict: Returns the contents of the text family.
        """
        d = {k: getattr(self, k) for k in vars(self).keys() if k[0] != "_"}

        d["textDepth"]       = getattr(self._inode, "depth", None)
        d["sectionNames"]    = getattr(self._inode, "sectionNames", None)
        d["addressTypes"]    = getattr(self._inode, "addressTypes", None)
        if getattr(self._inode, "lengths", None):
            d["lengths"]     = getattr(self._inode, "lengths")
            if len(d["lengths"]):
                d["length"]  = d["lengths"][0]
        elif getattr(self._inode, "length", None):
            d["length"]      = getattr(self._inode, "length")
        d["textDepth"]       = self._inode.depth
        d["heTitle"]         = self._inode.full_title("he")
        d["titleVariants"]   = self._inode.all_tree_titles("en")
        d["heTitleVariants"] = self._inode.all_tree_titles("he")

        for attr in ["categories", "order"]:
            d[attr] = getattr(self._inode.index, attr, "")
        for attr in ["book", "type"]:
            d[attr] = getattr(self._original_oref, attr)
        for attr in ["sections", "toSections"]:
            d[attr] = getattr(self._original_oref, attr)[:]
        if self._context_oref.is_commentary():
            for attr in ["commentaryBook", "commentaryCategories", "commentator", "heCommentator"]:
                d[attr] = getattr(self._inode.index, attr, "")
        d["isComplex"]    = self.isComplex
        d["indexTitle"]   = self._inode.index.title
        d["heIndexTitle"] = self._inode.index.get_title("he")
        d["sectionRef"]   = self._original_oref.section_ref().normal()
        d["isSpanning"]   = self._original_oref.is_spanning()
        if d["isSpanning"]:
            d["spanningRefs"] = [r.normal() for r in self._original_oref.split_spanning_ref()]

        for language, attr in self.text_attr_map.items():
            chunk = self._chunks.get(language)
            if chunk.is_merged:
                d[self.sourceMap[language]] = chunk.sources
            else:
                ver = chunk.version()
                if ver:
                    for key, val in self.attr_map.items():
                        if not val.get("condition") or getattr(ver, val.get("condition"), False):
                            d[val[language]] = getattr(ver, key, val.get("default", ""))
                        else:
                            d[val[language]] = val.get("default")

        # replace ints with daf strings (3->"2a") for Talmud addresses
        # this could be simpler if was done for every value - but would be slower.
        if "Talmud" in self._inode.addressTypes:
            for i in range(len(d["sections"])):
                if self._inode.addressTypes[i] == "Talmud":
                    d["sections"][i] = AddressTalmud.toStr("en", d["sections"][i])
                    if "toSections" in d:
                        d["toSections"][i] = AddressTalmud.toStr("en", d["toSections"][i])

            d["title"] = self._context_oref.normal()
            if "heTitle" in d:
                d["heBook"] = d["heTitle"]
                d["heTitle"] = self._context_oref.he_normal()

            if d["type"] == "Commentary" and self._context_oref.is_talmud() and len(d["sections"]) > 1:
                d["title"] = "%s Line %d" % (d["title"], d["sections"][1])

        elif self._context_oref.is_commentary():
            dep = len(d["sections"]) if len(d["sections"]) < 2 else 2
            d["title"] = d["book"] + " " + ":".join(["%s" % s for s in d["sections"][:dep]])

        d["alts"] = self._alts

        return d


"""
                    -------------------
                           Refs
                    -------------------

"""


class RefCacheType(type):
    """
    Metaclass for Ref class.
    Caches all Ref isntances according to the string they were instanciated with and their normal form.
    Returns cached instance on instanciation if either instanciation string or normal form are matched.
    """

    def __init__(cls, name, parents, dct):
        super(RefCacheType, cls).__init__(name, parents, dct)
        cls.__tref_oref_map = {}
        cls.__index_tref_map = {}

    def cache_size(cls):
        return len(cls.__tref_oref_map)

    def cache_dump(cls):
        return [(a, repr(b)) for (a, b) in cls.__tref_oref_map.iteritems()]

    def _raw_cache(cls):
        return cls.__tref_oref_map

    def clear_cache(cls):
        cls.__tref_oref_map = {}
        cls.__index_tref_map = {}

    def remove_index_from_cache(cls, index_title):
        """
        Removes all refs to Index with title `index_title` from the Ref cache
        :param cls:
        :param index_title:
        :return:
        """
        try:
            for tref in cls.__index_tref_map[index_title]:
                try:
                    del cls.__tref_oref_map[tref]
                except KeyError:
                    continue
        except KeyError:
            pass

    def __call__(cls, *args, **kwargs):
        if len(args) == 1:
            tref = args[0]
        else:
            tref = kwargs.get("tref")

        obj_arg = kwargs.get("_obj")

        if tref:
            if tref in cls.__tref_oref_map:
                ref = cls.__tref_oref_map[tref]
                ref.tref = tref
                return ref
            else:
                result = super(RefCacheType, cls).__call__(*args, **kwargs)
                uid = result.uid()
                title = result.index.title
                if uid in cls.__tref_oref_map:
                    #del result  #  Do we need this to keep memory clean?
                    cls.__tref_oref_map[tref] = cls.__tref_oref_map[uid]
                    try:
                        cls.__index_tref_map[title] += [tref]
                    except KeyError:
                        cls.__index_tref_map[title] = [tref]
                    return cls.__tref_oref_map[uid]
                cls.__tref_oref_map[uid] = result
                cls.__tref_oref_map[tref] = result
                try:
                    cls.__index_tref_map[title] += [tref]
                except KeyError:
                    cls.__index_tref_map[title] = [tref]
                cls.__index_tref_map[title] += [uid]

                return result
        elif obj_arg:
            result = super(RefCacheType, cls).__call__(*args, **kwargs)
            uid = result.uid()
            title = result.index.title
            if uid in cls.__tref_oref_map:
                #del result  #  Do we need this to keep memory clean?
                return cls.__tref_oref_map[uid]
            cls.__tref_oref_map[uid] = result
            try:
                cls.__index_tref_map[title] += [uid]
            except KeyError:
                cls.__index_tref_map[title] = [uid]
            return result
        else:  # Default.  Shouldn't be used.
            return super(RefCacheType, cls).__call__(*args, **kwargs)


class Ref(object):
    """
        A Ref is a reference to a location. A location could be to a *book*, to a specific *segment* (e.g. verse or mishnah), to a *section* (e.g chapter), or to a *range*.

        Instanciated with a string representation of the reference, e.g.:

        ::

            >>> Ref("Genesis 1:3")
            >>> Ref("Rashi on Genesis 1:3")
            >>> Ref("Genesis 1:3-2:4")
            >>> Ref("Shabbat 4b")
            >>> Ref("Rashi on Shabbat 4b-5a")
    """
    __metaclass__ = RefCacheType

    def __init__(self, tref=None, _obj=None):
        """
        Object is generally initialized with a textual reference - ``tref``

        Internally, the _obj argument can be used to instantiate a ref with a complete dict composing the Ref data
        """
        self.index = None
        self.book = None
        self.type = None
        self.sections = []
        self.toSections = []
        self.index_node = None

        if tref:
            self.__init_ref_pointer_vars()
            self.orig_tref = self.tref = tref
            self._lang = "he" if is_hebrew(tref) else "en"
            self.__clean_tref()
            self.__init_tref()
            self._validate()
        elif _obj:
            for key, value in _obj.items():
                setattr(self, key, value)
            self.__init_ref_pointer_vars()
            self.tref = self.normal()
            self._validate()
        else:
            self.__init_ref_pointer_vars()

    def __init_ref_pointer_vars(self):
        self._normal = None
        self._he_normal = None
        self._url = None
        self._next = None
        self._prev = None
        self._padded = None
        self._context = {}
        self._first_spanned_ref = None
        self._spanned_refs = []
        self._ranged_refs = []
        self._range_depth = None
        self._range_index = None

    def _validate(self):
        offset = 0
        if self.is_bavli():
            offset = 2
        checks = [self.sections, self.toSections]
        for check in checks:
            if 0 in check:
                raise InputError(u"{} {} must be greater than 0".format(self.book, self.index_node.sectionNames[check.index(0)]))
            if getattr(self.index_node, "lengths", None) and len(check):
                if check[0] > self.index_node.lengths[0] + offset:
                    display_size = self.index_node.address_class(0).toStr("en", self.index_node.lengths[0] + offset)
                    raise InputError(u"{} ends at {} {}.".format(self.book, self.index_node.sectionNames[0], display_size))
        for i in range(len(self.sections)):
            if self.toSections > self.sections:
                break
            if self.toSections < self.sections:
                raise InputError(u"{} is an invalid range.  Ranges must end later than they begin.".format(self.normal()))

    def __clean_tref(self):
        self.tref = self.tref.strip().replace(u"–", "-").replace("_", " ")  # don't replace : in Hebrew, where it can indicate amud
        if self._lang == "he":
            return

        try:
            self.tref = self.tref.decode('utf-8').replace(":", ".")
        except UnicodeEncodeError, e:
            return {"error": "UnicodeEncodeError: %s" % e}
        except AttributeError, e:
            return {"error": "AttributeError: %s" % e}

        try:
            # capitalize first letter (don't title case all to avoid e.g., "Song Of Songs")
            self.tref = self.tref[0].upper() + self.tref[1:]
        except IndexError:
            pass

    def __reinit_tref(self, new_tref):
        self.tref = new_tref
        self.__clean_tref()
        self._lang = "en"
        self.__init_tref()

    def __init_tref(self):
        """
        Parse self.tref
        Populate self.index, self.index_node, self.type, self.book, self.sections, self.toSections, ...
        :return:
        """
        # Split ranges based on '-' symbol, store in `parts` variable
        parts = [s.strip() for s in self.tref.split("-")]
        if len(parts) > 2:
            raise InputError(u"Couldn't understand ref '{}' (too many -'s).".format(self.tref))

        base = parts[0]
        title = None

        # Remove letter from end of base reference until TitleNode or Term name matched, set `title` variable with matched title
        tndict = library.get_title_node_dict(self._lang, with_commentary=True)
        termdict = library.get_term_dict(self._lang)
        for l in range(len(base), 0, -1):
            self.index_node = tndict.get(base[0:l])
            new_tref = termdict.get(base[0:l])

            if self.index_node:
                title = base[0:l]
                if base[l - 1] == ".":   # Take care of Refs like "Exo.14.15", where the period shouldn't get swallowed in the name.
                    title = base[0:l - 1]
                break
            if new_tref:
                # If a term is matched, reinit with the real tref
                self.__reinit_tref(new_tref)
                return

        # At this `title` is something like "Exodus" or "Rashi on Exodus" or "Pesach Haggadah, Magid, Four Sons"
        if title:
            assert isinstance(self.index_node, SchemaNode)
            self.index = self.index_node.index
            self.book = self.index_node.full_title("en")

            # checkFirst is used on Bavli records to check for a Mishnah pattern match first
            if getattr(self.index_node, "checkFirst", None) and self.index_node.checkFirst.get(self._lang):
                try:
                    check_node = library.get_schema_node(self.index_node.checkFirst[self._lang], self._lang)
                    assert isinstance(check_node, JaggedArrayNode)  # Initially used with Mishnah records.  Assumes JaggedArray.
                    reg = check_node.full_regex(title, self._lang, strict=True)
                    self.sections = self.__get_sections(reg, base, use_node=check_node)
                except InputError:  # Regex doesn't work
                    pass
                except AttributeError:  # Can't find node for check_node
                    pass
                else:
                    old_index_node = self.index_node

                    self.index_node = check_node
                    self.index = self.index_node.index
                    self.book = self.index_node.full_title("en")
                    self.toSections = self.sections[:]

                    try:
                        self._validate()
                    except InputError:  # created Ref doesn't validate, back it out
                        self.index_node = old_index_node
                        self.sections = []

            # Don't accept references like "Rashi" (Can delete in commentary refactor)
            elif self.index.is_commentary() and self._lang == "en":
                if not getattr(self.index, "commentaryBook", None):
                    raise InputError(u"Please specify a text that {} comments on.".format(self.index.title))

        else:  # This may be a new version, try to build a schema node.
            match = library.all_titles_regex(self._lang, commentary=True).match(base)
            if match:
                title = match.group('title')
                on_node = library.get_schema_node(match.group('commentee'))  # May be SchemaNode or JaggedArrayNode
                self.index = library.get_index(match.group('commentor') + " on " + on_node.index.title)
                self.index_node = self.index.nodes.title_dict(self._lang).get(title)
                self.book = self.index_node.full_title("en")
                if not self.index_node:
                    raise BookNameError(u"Can not find index record for {}".format(title))
            else:
                raise InputError(u"Unrecognized Index record: {}".format(base))

        if title is None:
            raise InputError(u"Could not find title in reference: {}".format(self.tref))

        self.type = self.index_node.index.categories[0]

        if title == base:  # Bare book, like "Genesis" or "Rashi on Genesis".
            if self.index_node.is_default():  # Without any further specification, match the parent of the fall-through node
                self.index_node = self.index_node.parent
                self.book = self.index_node.full_title("en")
            return

        try:
            reg = self.index_node.full_regex(title, self._lang)  # Try to treat this as a JaggedArray
        except AttributeError:
            # We matched a schema node followed by an illegal number. (Are there other cases here?)
            matched = self.index_node.full_title(self._lang)
            msg = u"Partial reference match for '{}' - failed to find continuation for '{}'.\nValid continuations are:\n".format(self.tref, matched)
            continuations = []
            for child in self.index_node.children:
                continuations += child.all_node_titles(self._lang)
            msg += u",\n".join(continuations)
            raise PartialRefInputError(msg, matched, continuations)

        # Numbered Structure node - try numbered structure parsing
        if self.index_node.children and getattr(self.index_node, "_addressTypes", None):
            try:
                struct_indexes = self.__get_sections(reg, base)
                self.index_node = reduce(lambda a, i: a.children[i], [s - 1 for s in struct_indexes], self.index_node)
                title = self.book = self.index_node.full_title("en")
                base = regex.sub(reg, title, base)
                reg = self.index_node.full_regex(title, self._lang)
            except InputError:
                pass
            #todo: ranges that cross structures

        # Numbered Structure node parsed - return. (Verify this comment.  Should this be indented?)
        if title == base:
            return

        # Content node -  Match primary structure address (may be stage two of numbered structure parsing)
        if not self.index_node.children and getattr(self.index_node, "_addressTypes", None):
            try:
                self.sections = self.__get_sections(reg, base)
            except InputError:
                pass

        # Look for alternate structure
        # todo: handle commentator on alt structure
        if not self.sections and not self.index.is_commentary():
            alt_struct_regex = self.index.alt_titles_regex(self._lang)
            if alt_struct_regex:
                match = alt_struct_regex.match(base)
                if match:
                    title = match.group('title')
                    alt_struct_node = self.index.get_alt_struct_node(title, self._lang)

                    # Exact match alt structure node
                    if title == base:
                        new_tref = alt_struct_node.get_ref_from_sections([])
                        if new_tref:
                            self.__reinit_tref(new_tref)
                            return

                    try:  # Some structure nodes don't have .regex() methods.
                        reg = alt_struct_node.full_regex(title, self._lang)
                    except AttributeError:
                        pass
                    else:
                        # Alternate numbered structure
                        if alt_struct_node.children and getattr(alt_struct_node, "_addressTypes", None):
                            try:
                                struct_indexes = self.__get_sections(reg, base)
                                alt_struct_node = reduce(lambda a, i: a.children[i], [s - 1 for s in struct_indexes], alt_struct_node)
                                title = alt_struct_node.full_title("en")
                                base = regex.sub(reg, title, base)
                                reg = alt_struct_node.full_regex(title, self._lang)
                            except InputError:
                                pass

                        # Alt struct map node -  (may be stage two of numbered structure parsing)
                        if title == base:  #not a repetition of similar test above - title may have changed in numbered structure parsing
                            alt_struct_indexes = []
                        else:
                            alt_struct_indexes = self.__get_sections(reg, base)
                        new_tref = alt_struct_node.get_ref_from_sections(alt_struct_indexes)
                        if new_tref:
                            self.__reinit_tref(new_tref)
                            return

        if not self.sections:
            raise InputError(u"Failed to parse sections for ref {}".format(self.orig_tref))

        self.toSections = self.sections[:]

        # Parse range end portion, if it exists
        if len(parts) == 2:
            self.__init_ref_pointer_vars()  # clear out any mistaken partial representations
            if self._lang == "he" or any([a != "Integer" for a in self.index_node.addressTypes[1:]]):     # in process. developing logic that should work for all languages / texts
                # todo: handle sections names in "to" part.  Handle talmud יד א - ב kind of cases.
                range_parts = re.split("[., ]+", parts[1])
                delta = len(self.sections) - len(range_parts)
                for i in range(delta, len(self.sections)):
                    try:
                        self.toSections[i] = self.index_node._addressTypes[i].toNumber(self._lang, range_parts[i - delta])
                    except (ValueError, IndexError):
                        raise InputError(u"Couldn't understand text sections: '{}'.".format(self.tref))
            elif self._lang == "en":
                if self.index_node.addressTypes[0] == "Talmud":
                    self.__parse_talmud_range(parts[1])
                else:
                    range_parts = re.split("[.:, ]+", parts[1])
                    delta = len(self.sections) - len(range_parts)
                    for i in range(delta, len(self.sections)):
                        try:
                            self.toSections[i] = int(range_parts[i - delta])
                        except (ValueError, IndexError):
                            raise InputError(u"Couldn't understand text sections: '{}'.".format(self.tref))

    def __get_sections(self, reg, tref, use_node=None):
        use_node = use_node or self.index_node
        sections = []
        ref_match = reg.match(tref)
        if not ref_match:
            raise InputError(u"Can not parse sections from ref: {}".format(tref))

        gs = ref_match.groupdict()
        for i in range(0, use_node.depth):
            gname = u"a{}".format(i)
            if gs.get(gname) is not None:
                sections.append(use_node._addressTypes[i].toNumber(self._lang, gs.get(gname)))
        return sections

    def __parse_talmud_range(self, range_part):
        #todo: make sure to-daf isn't out of range
        self.toSections = range_part.split(".")  # this was converting space to '.', for some reason.

        # 'Shabbat 23a-b'
        if self.toSections[0] == 'b':
            self.toSections[0] = self.sections[0] + 1

        # 'Shabbat 24b-25a'
        elif regex.match("\d+[ab]", self.toSections[0]):
            self.toSections[0] = daf_to_section(self.toSections[0])

        # 'Shabbat 24b.12-24'
        else:
            delta = len(self.sections) - len(self.toSections)
            for i in range(delta -1, -1, -1):
                self.toSections.insert(0, self.sections[i])

        self.toSections = [int(x) for x in self.toSections]

    def __eq__(self, other):
        return isinstance(other, Ref) and self.uid() == other.uid()

    def __ne__(self, other):
        return not self.__eq__(other)

    @staticmethod
    def is_ref(tref):
        """
        Static method for testing if a string is valid for instanciating a Ref object.

        :param string tref: the string to test
        :return bool:
        """
        try:
            Ref(tref)
            return True
        except InputError:
            return False

    def is_talmud(self):
        """
        Is this a Talmud reference?

        :return bool:
        """
        return getattr(self.index_node, "addressTypes", None) and len(self.index_node.addressTypes) and self.index_node.addressTypes[0] == "Talmud"

    def is_tanach(self):
        return u"Tanakh" in self.index.b_index.categories if self.is_commentary() else u"Tanakh" in self.index.categories

    def is_bavli(self):
        """
        Is this a Talmud Bavli reference?

        :return bool:
        """
        if self.is_commentary():
            return u"Bavli" in self.index.b_index.categories
        else:
            return u"Bavli" in self.index.categories

    def is_commentary(self):
        """
        Is this a commentary reference?

        :return bool:
        """
        return self.type == "Commentary"

    def is_range(self):
        """
        Is this reference a range?

        A Ref is range if it's starting point and ending point are different, i.e. it has a dash in its text form.
        References can cover large areas of text without being a range - in the case where they are references to chapters.

        ::

            >>> Ref("Genesis 3").is_range()
            False
            >>> Ref("Genesis 3-5").is_range()
            True

        :return bool:
        """
        return self.sections != self.toSections

    def range_size(self):
        """
        How large is the range?

        :return int:
        """
        #todo: rewrite with range_index to handle ranges across higher level sections
        return self.toSections[-1] - self.sections[-1] + 1

    def range_index(self):
        """
        At what section index does the range begin?

        ::

            >>> Ref("Leviticus 15:3 - 17:12").range_index()
            0
            >>> Ref("Leviticus 15-17").range_index()
            0
            >>> Ref("Leviticus 15:17-21").range_index()
            1
            >>> Ref("Leviticus 15:17").range_index()
            2

        :return int:
        """
        if not self._range_index:
            self._set_range_data()
        return self._range_index

    def range_depth(self):
        """
        How deep is the range?

        ::

            >>> Ref("Leviticus 15:3 - 17:12").range_depth()
            2
            >>> Ref("Leviticus 15-17").range_depth()
            2
            >>> Ref("Leviticus 15:17-21").range_depth()
            1
            >>> Ref("Leviticus 15:17").range_depth()
            0

        :return int:
        """
        if not self._range_depth:
            self._set_range_data()
        return self._range_depth

    def _set_range_data(self):
        if not self.is_range():
            self._range_depth = 0
            self._range_index = self.index_node.depth

        else:
            for i in range(0, self.index_node.depth):
                if self.sections[i] != self.toSections[i]:
                    self._range_depth = self.index_node.depth - i
                    self._range_index = i
                    break

    def is_spanning(self):
        """
        :return bool: True if the Ref spans across text sections.

        ::

            >>> Ref("Shabbat 13a-b").is_spanning()
            True
            >>> Ref("Shabbat 13a:3-14").is_spanning()
            False
            >>> Ref("Job 4:3-5:3").is_spanning()
            True
            >>> Ref("Job 4:5-18").is_spanning()
            False

        """
        return self.span_size() > 1

    def span_size(self):
        """
        How many sections does the span cover?

        ::

            >>> Ref("Leviticus 15:3 - 17:12").span_size()
            3
            >>> Ref("Leviticus 15-17").span_size()
            3
            >>> Ref("Leviticus 15:17-21").span_size()
            1
            >>> Ref("Leviticus 15:17").span_size()
            1

        :return int:
        """
        if not getattr(self.index_node, "depth", None) or self.index_node.depth == 1:
            # text with no depth or depth 1 can't be spanning
            return 0

        if len(self.sections) == 0:
            # can't be spanning if no sections set
            return 0

        if len(self.sections) <= self.index_node.depth - 2:
            point = len(self.sections) - 1
        else:
            point = self.index_node.depth - 2

        for i in range(0, point + 1):
            size = self.toSections[i] - self.sections[i] + 1
            if size > 1:
                return size

        return 1

    def is_book_level(self):
        """
        Is this a Ref to the whole book level?

        ::

            >>> Ref("Leviticus").is_book_level()
            True
            >>> Ref("Leviticus 15").is_book_level()
            False
            >>> Ref("Rashi on Leviticus").is_book_level()
            True
            >>> Ref("Rashi on Leviticus 15").is_book_level()
            False

        :return bool:
        """
        return len(self.sections) == 0 and not self.index_node.parent

    def is_section_level(self):
        """
        Is this Ref section (e.g. Chapter) level?

        ::

            >>> Ref("Leviticus 15:3").is_section_level()
            False
            >>> Ref("Leviticus 15").is_section_level()
            True
            >>> Ref("Rashi on Leviticus 15:3").is_section_level()
            True
            >>> Ref("Rashi on Leviticus 15:3:1").is_section_level()
            False
            >>> Ref("Leviticus 15-17").is_section_level()
            True


        :return bool:
        """
        #TODO: errors on complex refs
        return len(self.sections) == self.index_node.depth - 1

    def is_segment_level(self):
        """
        Is this Ref segment (e.g. Verse) level?
        ::
            >>> Ref("Leviticus 15:3").is_segment_level()
            True
            >>> Ref("Leviticus 15").is_segment_level()
            False
            >>> Ref("Rashi on Leviticus 15:3").is_segment_level()
            False
            >>> Ref("Rashi on Leviticus 15:3:1").is_segment_level()
            True

        :return bool:
        """
        #TODO: errors on complex refs
        return len(self.sections) == self.index_node.depth

    """ Methods to generate new Refs based on this Ref """
    def _core_dict(self):
        return {
            "index": self.index,
            "book": self.book,
            "type": self.type,
            "index_node": self.index_node,
            "sections": self.sections[:],
            "toSections": self.toSections[:]
        }

    def has_default_child(self):
        return self.index_node.has_default_child()

    def default_child_ref(self):
        """
        Return ref to the default node underneath this node
        :return:
        """
        if not self.has_default_child():
            return self
        d = self._core_dict()
        d["index_node"] = self.index_node.get_default_child()
        return Ref(_obj=d)

    def surrounding_ref(self, size=1):
        """
        Return a reference with 'size' additional segments added to each side.

        Currently does not extend to sections beyond the original ref's span.

        :param int size:
        :return: :class:`Ref`
        """

        if self.starting_ref().sections[-1] > size:
            start = self.starting_ref().sections[-1] - size
        else:
            start = 1

        ending_sections = self.ending_ref().sections
        ending_section_length = self.get_state_ja().sub_array_length([s - 1 for s in ending_sections[:-1]])

        if ending_sections[-1] + size < ending_section_length:
            end = ending_sections[-1] + size
        else:
            end = ending_section_length

        d = self._core_dict()
        d["sections"] = d["sections"][:-1] + [start]
        d["toSections"] = d["toSections"][:-1] + [end]
        return Ref(_obj=d)

    def as_ranged_segment_ref(self):
        """
        Expresses a section level (or higher) Ref as a ranged ref at segment level.

        :param depth: Desired depth of the range. If not specified will drop to segment level
        :return: Ref
        """
        # Only for section level or higher.
        # If segment level, return self
        # Only works for text that span a single jaggedArray

        if self.is_segment_level():
            return self

        d = self._core_dict()

        # create a temporary helper ref for finding the end of the range
        if self.is_range():
            current_ending_ref = self.ending_ref()
        else:
            current_ending_ref = self

        # calculate the number of "paddings" required to get down to segment level
        max_depth = self.index_node.depth - len(self.sections)

        sec_padding = to_sec_padding = max_depth

        while sec_padding > 0:
            d['sections'].append(1)
            sec_padding -= 1

        state_ja = current_ending_ref.get_state_ja()

        while to_sec_padding > 0:
            size = state_ja.sub_array_length([i - 1 for i in current_ending_ref.sections])
            if size > 0:
                d['toSections'].append(size)
            else:
                d['toSections'].append(1)

            # get the next level ending ref
            temp_d = current_ending_ref._core_dict()
            temp_d['sections'] = temp_d['toSections'][:] = d['toSections'][:]
            current_ending_ref = Ref(_obj=temp_d)

            to_sec_padding -= 1

        return Ref(_obj=d)

    def starting_ref(self):
        """
        For ranged Refs, return the starting Ref

        :return: :class:`Ref`
        """
        if not self.is_range():
            return self
        d = self._core_dict()
        d["toSections"] = self.sections[:]
        return Ref(_obj=d)

    def ending_ref(self):
        """
        For ranged Refs, return the ending Ref

        :return: :class:`Ref`
        """
        if not self.is_range():
            return self
        d = self._core_dict()
        d["sections"] = self.toSections[:]
        return Ref(_obj=d)

    def section_ref(self):
        """
        Return the section level Ref

        For texts of depth 2, this has the same behavior as :meth:`top_section_ref`

        ::

            >>> Ref("Rashi on Genesis 2:3:1").section_ref()
            Ref("Rashi on Genesis 2:3")
            >>> Ref("Genesis 2:3").section_ref()
            Ref("Genesis 2")

        :return: :class:`Ref`
        """
        if not self.is_segment_level():
            return self
        return self.padded_ref().context_ref()

    def top_section_ref(self):
        """
        Return the highest level section Ref.

        For texts of depth 2, this has the same behavior as :meth:`section_ref`

        ::

            >>> Ref("Rashi on Genesis 2:3:1").top_section_ref()
            Ref("Rashi on Genesis 2")
            >>> Ref("Genesis 2:3").top_section_ref()
            Ref("Genesis 2")

        :return: :class:`Ref`
        """
        return self.padded_ref().context_ref(self.index_node.depth - 1)

    def next_section_ref(self):
        """
        Returns a Ref to the next section (e.g. Chapter).

        If this is the last section, returns ``None``

        :return: :class:`Ref`
        """
        if not self._next:
            self._next = self._iter_text_section()
            if self._next is None and not self.index_node.children:
                current_leaf = self.index_node
                #we now need to iterate over the next leaves, finding the first available section
                while True:
                    next_leaf = current_leaf.next_leaf() #next schema/JANode
                    if next_leaf:
                        next_node_ref = next_leaf.ref() #get a ref so we can do the next lines
                        potential_next = next_node_ref._iter_text_section(depth_up=0 if next_leaf.depth == 1 else 1)
                        if potential_next:
                            self._next = potential_next
                            break
                        current_leaf = next_leaf
                    else:
                        self._next = None
                        break
        return self._next

    def prev_section_ref(self):
        """
        Returns a Ref to the previous section (e.g. Chapter).

        If this is the first section, returns ``None``

        :return: :class:`Ref`
        """
        if not self._prev:
            self._prev = self._iter_text_section(False)
            if self._prev is None and not self.index_node.children:
                current_leaf = self.index_node
                # we now need to iterate over the prev leaves, finding the first available section
                while True:
                    prev_leaf = current_leaf.prev_leaf()  # prev schema/JANode
                    if prev_leaf:
                        prev_node_ref = prev_leaf.ref()  # get a ref so we can do the next lines
                        potential_prev = prev_node_ref._iter_text_section(forward=False, depth_up=0 if prev_leaf.depth == 1 else 1)
                        if potential_prev:
                            self._prev = potential_prev
                            break
                        current_leaf = prev_leaf
                    else:
                        self._prev = None
                        break
        return self._prev

    def recalibrate_next_prev_refs(self, add_self=True):
        """
        Internal. Called when a section is inserted or deleted.

        :param add_self:
        :return: None
        """
        next_ref = self.next_section_ref()
        prev_ref = self.prev_section_ref()
        if next_ref:
            next_ref._prev = self if add_self else prev_ref
        if prev_ref:
            prev_ref._next = self if add_self else next_ref

    def prev_segment_ref(self):
        """
        Returns a :class:`Ref` to the next previous populated segment.

        If this ref is not segment level, will return ``self```

        :return: :class:`Ref`
        """
        r = self.starting_ref()
        if not r.is_segment_level():
            return r
        if r.sections[-1] > 1:
            d = r._core_dict()
            d["sections"] = d["toSections"] = r.sections[:-1] + [r.sections[-1] - 1]
            return Ref(_obj=d)
        else:
            r = r.prev_section_ref()
            if not r:
                return None
            d = r._core_dict()
            newSections = r.sections + [self.get_state_ja().sub_array_length([i - 1 for i in r.sections])]
            d["sections"] = d["toSections"] = newSections
            return Ref(_obj=d)

    def next_segment_ref(self):
        """
        Returns a :class:`Ref` to the next populated segment.

        If this ref is not segment level, will return ``self```

        :return: :class:`Ref`
        """
        r = self.ending_ref()
        if not r.is_segment_level():
            return r
        sectionRef = r.section_ref()
        sectionLength = self.get_state_ja().sub_array_length([i - 1 for i in sectionRef.sections])
        if r.sections[-1] < sectionLength:
            d = r._core_dict()
            d["sections"] = d["toSections"] = r.sections[:-1] + [r.sections[-1] + 1]
            return Ref(_obj=d)
        else:
            try:
                return r.next_section_ref().subref(1)
            except AttributeError:
                # No next section
                return None

    def last_segment_ref(self):
        """
        Returns :class:`Ref` to the last segment in the current book (or complex book part).

        Not to be confused with :meth:`ending_ref`

        :return:
        """
        o = self._core_dict()
        o["sections"] = o["toSections"] = [i + 1 for i in self.get_state_ja().last_index(self.index_node.depth)]
        return Ref(_obj=o)

    def first_available_section_ref(self):
        """
        Returns a :class:`Ref` to the first section inside of or following this :class:`Ref` that has some content.

        Returns ``None`` if self is empty and no following :class:`Ref` has content.

        :return: :class:`Ref`
        """
        if isinstance(self.index_node, JaggedArrayNode):
            r = self.padded_ref()
        elif isinstance(self.index_node, SchemaNode):
            nodes = self.index_node.get_leaf_nodes()
            if not len(nodes):
                return None
            r = nodes[0].ref().padded_ref()
        else:
            return None

        return r.next_section_ref() if r.is_empty() else r

    #Don't store results on Ref cache - state objects change, and don't yet propogate to this Cache
    def get_state_node(self, meta=None, hint=None):
        """
        :return: :class:`sefaria.model.version_state.StateNode`
        """
        from . import version_state
        return version_state.StateNode(snode=self.index_node, meta=meta, hint=hint)

    def get_state_ja(self, lang="all"):
        """
        :param lang: "all", "he", or "en"
        :return: :class:`sefaria.datatype.jagged_array`
        """
        #TODO: also does not work with complex texts...
        return self.get_state_node(hint=[(lang, "availableTexts")]).ja(lang)

    def is_text_fully_available(self, lang):
        """
        :param lang: "he" or "en"
        :return: True if at least one complete version of ref is available in lang.
        """
        if self.is_section_level() or self.is_segment_level():
            # Using mongo queries to slice and merge versions 
            # is much faster than actually using the Version State doc
            text = self.text(lang=lang).text
            return bool(len(text) and all(text))
        else:
            sja = self.get_state_ja(lang)
            subarray = sja.subarray_with_ref(self)
            return subarray.is_full()

    def is_text_translated(self):
        """
        :return: True if at least one complete version of this :class:`Ref` is available in English.
        """
        return self.is_text_fully_available("en")

    def is_empty(self):
        """
        Checks if :class:`Ref` has any corresponding data in :class:`Version` records.

        :return: Bool True is there is not text at this ref in any language
        """
        return not len(self.versionset())

    def _iter_text_section(self, forward=True, depth_up=1):
        """
        Iterate forwards or backwards to the next available :class:`Ref` in a text

        :param forward: Boolean indicating direction to iterate
        :depth_up: if we want to traverse the text at a higher level than most granular. Defaults to one level above
        :return: :class:`Ref`
        """
        if self.index_node.depth <= depth_up:  # if there is only one level of text, don't even waste time iterating.
            return None

        #arrays are 0 based. text sections are 1 based. so shift the numbers back.
        if not forward:
            # Going backward, start from begginning of Ref
            starting_points = [s - 1 for s in self.sections[:self.index_node.depth - depth_up]]
        else:
            # Going forward start form end of Ref
            starting_points = [s - 1 for s in self.toSections[:self.index_node.depth - depth_up]]


        #start from the next one
        if len(starting_points) > 0:
            starting_points[-1] += 1 if forward else -1

        #let the counts obj calculate the correct place to go.
        c = self.get_state_node(hint=[("all","availableTexts")]).ja("all", "availableTexts")
        new_section = c.next_index(starting_points) if forward else c.prev_index(starting_points)

        # we are also scaling back the sections to the level ABOVE the lowest section type (eg, for bible we want chapter, not verse)
        if new_section:
            d = self._core_dict()
            d["toSections"] = d["sections"] = [(s + 1) for s in new_section[:-depth_up]]
            return Ref(_obj=d)
        else:
            return None

    def to(self, toref):
        """
        Return a reference that begins at this :class:`Ref`, and ends at toref

        :param toref: :class:`Ref` that denotes the end of the new ranged :class:`Ref`
        :return: :class:`Ref`
        """
        assert self.book == toref.book
        d = self._core_dict()
        d["toSections"] = toref.toSections[:]
        return Ref(_obj=d)

    def subref(self, subsections):
        """
        Returns a more specific reference than the current Ref

        :param subsection: int or list - the subsection(s) of the current Ref
        :return: :class:`Ref`
        """
        if isinstance(subsections, int):
            subsections = [subsections]
        assert self.index_node.depth >= len(self.sections) + len(subsections), u"Tried to get subref of bottom level ref: {}".format(self.normal())
        assert not self.is_range(), u"Tried to get subref of ranged ref".format(self.normal())

        d = self._core_dict()
        d["sections"] += subsections
        d["toSections"] += subsections
        return Ref(_obj=d)

    def subrefs(self, length):
        """
        Return a list of :class:`Ref` objects one level deeper than this :class:`Ref`, from 1 to `length`.

        :param length: Number of subrefs to return

        ::

            >>> Ref("Genesis").subrefs(4)
            [Ref('Genesis 1'),
             Ref('Genesis 2'),
             Ref('Genesis 3'),
             Ref('Genesis 4')]

        :return: List of :class:`Ref`
        """
        l = []
        for i in range(length):
            l.append(self.subref(i + 1))
        return l

    def all_subrefs(self):
        """
        Return a list of all the valid :class:`Ref` objects one level deeper than this :class:`Ref`.

        ::

            >>> Ref("Genesis").all_subrefs()
            [Ref('Genesis 1'),
             Ref('Genesis 2'),
             Ref('Genesis 3'),
             Ref('Genesis 4'),
             ...]

        :return: List of :class:`Ref`
        """
        # TODO this function should take Version as optional parameter to limit the refs it returns to ones existing in that Version
        assert not self.is_range(), "Ref.all_subrefs() is not intended for use on Ranges"

        size = self.get_state_ja().sub_array_length([i - 1 for i in self.sections])
        return self.subrefs(size)

    def context_ref(self, level=1):
        """
        :return: :class:`Ref` that is more general than this :class:`Ref`.
        :param level: how many levels to 'zoom out' from the most specific possible :class:`Ref`

        ::

            >>> Ref("Genesis 4:5").context_ref(level = 1)
            Ref("Genesis 4")
            >>> Ref("Genesis 4:5").context_ref(level = 2)
            Ref("Genesis")

        If this :class:`Ref` is less specific than or equally specific to the level given, it is returned as-is.
        """
        if level == 0:
            return self

        if not self._context.get(level) or not self._context[level]:
            if len(self.sections) <= self.index_node.depth - level:
                return self

            if level > self.index_node.depth:
                raise InputError(u"Call to Ref.context_ref of {} exceeds Ref depth of {}.".format(level, self.index_node.depth))
            d = self._core_dict()
            d["sections"] = d["sections"][:self.index_node.depth - level]
            d["toSections"] = d["toSections"][:self.index_node.depth - level]
            self._context[level] = Ref(_obj=d)
        return self._context[level]

    def padded_ref(self):
        """
        :return: :class:`Ref` with 1s inserted to make the :class:`Ref` specific to the section level

        ::

            >>> Ref("Genesis").padded_ref()
            Ref("Genesis 1")

        If this :class:`Ref` is already specific to the section or segment level, it is returned unchanged.

        ::

            >>> Ref("Genesis 1").padded_ref()
            Ref("Genesis 1")

        """
        if not self._padded:
            if not getattr(self, "index_node", None):
                raise Exception(u"No index_node found {}".format(vars(self)))
            try:
                if len(self.sections) >= self.index_node.depth - 1:
                    return self
            except AttributeError: # This is a schema node, try to get a default child
                try:
                    return self.default_child_ref().padded_ref()
                except Exception:
                    raise InputError("Can not pad a schema node ref")

            d = self._core_dict()
            if self.is_talmud():
                if len(self.sections) == 0: #No daf specified
                    section = 3 if "Bavli" in self.index.categories else 1
                    d["sections"].append(section)
                    d["toSections"].append(section)
            for i in range(self.index_node.depth - len(d["sections"]) - 1):
                d["sections"].append(1)
                d["toSections"].append(1)  # todo: is this valid in all cases?
            self._padded = Ref(_obj=d)
        return self._padded

    def first_spanned_ref(self):
        """
        Returns the first section portion of a spanning :class:`Ref`.
        Designed to cut the wasted cost of running :meth:`split_spanning_ref`

        >>> Ref("Shabbat 6b-9a").first_spanned_ref()
        Ref('Shabbat 6b')
        >>> Ref("Shabbat 6b.12-9a.7").first_spanned_ref()
        Ref('Shabbat 6b:12-47')

        :return: :py:class:`Ref`
        """
        if not self._first_spanned_ref:

            if self._spanned_refs:
                self._first_spanned_ref = self._spanned_refs[0]

            elif self.index_node.depth == 1 or not self.is_spanning():
                self._first_spanned_ref = self

            else:
                ref_depth = len(self.sections)

                d = self._core_dict()
                d["toSections"] = self.sections[0:self.range_index() + 1]
                for i in range(self.range_index() + 1, ref_depth):
                    d["toSections"] += [self.get_state_ja().sub_array_length([s - 1 for s in d["toSections"][0:i]])]

                r = Ref(_obj=d)
                if self.range_depth() > 2:
                    self._first_spanned_ref = r.first_spanned_ref()
                else:
                    self._first_spanned_ref = r

        return self._first_spanned_ref

    def starting_refs_of_span(self, deep_range=False):
        """
            >>> Ref("Zohar 1:3b:12-3:12b:1").stating_refs_of_span()
            [Ref("Zohar 1:3b:12"),Ref("Zohar 2"),Ref("Zohar 3")]
            >>> Ref("Zohar 1:3b:12-1:4b:12").stating_refs_of_span(True)
            [Ref("Zohar 1:3b:12"),Ref("Zohar 1:4a"),Ref("Zohar 1:4b")]
            >>> Ref("Zohar 1:3b:12-1:4b:12").stating_refs_of_span(False)
            [Ref("Zohar 1:3b:12")]
            >>> Ref("Genesis 12:1-14:3").stating_refs_of_span()
            [Ref("Genesis 12:1"), Ref("Genesis 13"), Ref("Genesis 14")]

        :param deep_range: Default: False.  If True, returns list of refs at whatever level the range is.  If False, only returns refs for the 0th index, whether ranged or not.
        :return:
        """
        if not self.is_spanning():
            return self
        level = 0 if not deep_range else self.range_index()

        results = []

        start = self.sections[level]
        end = self.toSections[level] + 1
        for i, n in enumerate(range(start, end)):
            d = self._core_dict()
            if i != 0:
                d["sections"] = self.sections[0:level] + [self.sections[level] + i]
            d["toSections"] = d["sections"][:]
            results += [Ref(_obj=d)]

        return results

    def split_spanning_ref(self):
        """
        Return list of non-spanning :class:`Ref` objects which completely cover the area of this Ref

            >>> Ref("Shabbat 13b-14b").split_spanning_ref()
            [Ref("Shabbat 13b"), Ref("Shabbat 14a"), Ref("Shabbat 14b")]
            >>> Ref("Shabbat 13b:3 - 14b:3").split_spanning_ref()
            [Ref('Shabbat 13b:3-50'), Ref('Shabbat 14a'), Ref('Shabbat 14b:1-3')]

        """
        if not self._spanned_refs:

            if self.index_node.depth == 1 or not self.is_spanning():
                self._spanned_refs = [self]

            else:
                start, end = self.sections[self.range_index()], self.toSections[self.range_index()]
                ref_depth = len(self.sections)

                refs = []
                for n in range(start, end + 1):
                    d = self._core_dict()
                    if n == start:
                        d["toSections"] = self.sections[0:self.range_index() + 1]
                        for i in range(self.range_index() + 1, ref_depth):
                            d["toSections"] += [self.get_state_ja().sub_array_length([s - 1 for s in d["toSections"][0:i]])]
                    elif n == end:
                        d["sections"] = self.toSections[0:self.range_index() + 1]
                        for _ in range(self.range_index() + 1, ref_depth):
                            d["sections"] += [1]
                    else:
                        d["sections"] = self.sections[0:self.range_index()] + [n]
                        d["toSections"] = self.sections[0:self.range_index()] + [n]

                        '''  If we find that we need to expand inner refs, add this arg.
                        # It will require handling on cached ref and passing on the recursive call below.
                        if expand_middle:
                            for i in range(self.range_index() + 1, ref_depth):
                                d["sections"] += [1]
                                d["toSections"] += [self.get_state_ja().sub_array_length([s - 1 for s in d["toSections"][0:i]])]
                        '''

                    if d["toSections"][-1]:  # to filter out, e.g. non-existant Rashi's, where the last index is 0
                        try:
                            refs.append(Ref(_obj=d))
                        except InputError:
                            pass

                if self.range_depth() == 2:
                    self._spanned_refs = refs
                if self.range_depth() > 2: #recurse
                    expanded_refs = []
                    for ref in refs:
                        expanded_refs.extend(ref.split_spanning_ref())
                    self._spanned_refs = expanded_refs

        return self._spanned_refs

    def range_list(self):
        """
        :return: list of :class:`Ref` objects corresponding to each point in the range of this :class:`Ref`
        """
        if not self._ranged_refs:
            results = []
            if not self.is_range():
                return [self]
            if self.is_spanning():
                for oref in self.split_spanning_ref():
                    results += oref.range_list() if oref.is_range() else [oref] if oref.is_segment_level() else oref.all_subrefs()
            else:
                for s in range(self.sections[-1], self.toSections[-1] + 1):
                    d = self._core_dict()
                    d["sections"][-1] = s
                    d["toSections"][-1] = s
                    results.append(Ref(_obj=d))

            self._ranged_refs = results
        return self._ranged_refs

    def regex(self, as_list=False, anchored=True):
        """
        :return string: for a Regular Expression which will find any refs that match this Ref exactly, or more specifically.

        E.g., "Genesis 1" yields an RE that match "Genesis 1" and "Genesis 1:3"
        """
        #todo: move over to the regex methods of the index nodes
        patterns = []

        if self.is_range():
            if self.is_spanning():
                s_refs = self.split_spanning_ref()
                normals = []
                for s_ref in s_refs:
                    normals += [r.normal() for r in s_ref.range_list()]
            else:
                normals = [r.normal() for r in self.range_list()]

            for r in normals:
                sections = re.sub("^%s" % re.escape(self.book), '', r)
                patterns.append("%s$" % sections)   # exact match
                patterns.append("%s:" % sections)   # more granualar, exact match followed by :
                patterns.append("%s \d" % sections) # extra granularity following space
        else:
            sections = re.sub("^%s" % re.escape(self.book), '', self.normal())
            patterns.append("%s$" % sections)   # exact match
            if self.index_node.has_titled_continuation():
                patterns.append(u"{}({}).".format(sections, u"|".join(self.index_node.title_separators)))
            if self.index_node.has_numeric_continuation():
                patterns.append("%s:" % sections)   # more granualar, exact match followed by :
                patterns.append("%s \d" % sections) # extra granularity following space

        escaped_book = re.escape(self.book)
        if anchored:
            if as_list:
                return ["^{}{}".format(escaped_book, p) for p in patterns]
            else:
                return "^%s(%s)" % (escaped_book, "|".join(patterns))
        else:
            if as_list:
                return ["{}{}".format(escaped_book, p) for p in patterns]
            else:
                return "%s(%s)" % (escaped_book, "|".join(patterns))

    def base_text_and_commentary_regex(self):
        ref_regex_str = self.regex(anchored=False)
        commentators = library.get_commentary_version_titles_on_book(self.book, with_commentary2=True)
        if commentators:
            return ur"(^{})|(^({}) on {})".format(ref_regex_str, "|".join(commentators), ref_regex_str)
        else:
            return ur"^{}".format(ref_regex_str)

    """ Comparisons """
    def overlaps(self, other):
        """
        Does this Ref overlap ``other`` Ref?

        :param other:
        :return bool:
        """
        assert isinstance(other, Ref)
        if not self.index_node == other.index_node:
            return False

        return not (self.precedes(other) or self.follows(other))

    def contains(self, other):
        """
        Does this Ref completely contain ``other`` Ref?

        :param other:
        :return bool:
        """
        assert isinstance(other, Ref)
        if not self.index_node == other.index_node:
            return False

        return (
            (not self.starting_ref().follows(other.starting_ref()))
            and
            (not self.ending_ref().precedes(other.ending_ref()))
        )

    def precedes(self, other):
        """
        Does this Ref completely precede ``other`` Ref?

        :param other:
        :return bool:
        """
        assert isinstance(other, Ref)
        if not self.index_node == other.index_node:
            return False

        my_end = self.ending_ref()
        other_start = other.starting_ref()

        smallest_section_len = min([len(my_end.sections), len(other_start.sections)])

        # Bare book references never precede or follow
        if smallest_section_len == 0:
            return False

        # Compare all but last section
        for i in range(smallest_section_len - 1):
            if my_end.sections[i] < other_start.sections[i]:
                return True
            if my_end.sections[i] > other_start.sections[i]:
                return False

        # Compare last significant section
        if my_end.sections[smallest_section_len - 1] < other_start.sections[smallest_section_len - 1]:
            return True

        return False

    def follows(self, other):
        """
        Does this Ref completely follow ``other`` Ref?

        :param other:
        :return bool:
        """
        assert isinstance(other, Ref)
        if not self.index_node == other.index_node:
            return False

        my_start = self.starting_ref()
        other_end = other.ending_ref()

        smallest_section_len = min([len(my_start.sections), len(other_end.sections)])

        # Bare book references never precede or follow
        if smallest_section_len == 0:
            return False

        # Compare all but last section
        for i in range(smallest_section_len - 1):
            if my_start.sections[i] > other_end.sections[i]:
                return True
            if my_start.sections[i] < other_end.sections[i]:
                return False

        # Compare last significant section
        if my_start.sections[smallest_section_len - 1] > other_end.sections[smallest_section_len - 1]:
            return True

        return False

    def in_terms_of(self, other):
        """
        Returns the current reference sections in terms of another, containing reference.

        Returns an array of ordinal references, not array indexes.  (Meaning first is 1)

        Must be called on a point Reference, not a range

        ""

            >>> Ref("Genesis 6:3").in_terms_of("Genesis 6")
            [3]
            >>> Ref("Genesis 6:3").in_terms_of("Genesis")
            [6,3]
            >>> Ref("Genesis 6:3").in_terms_of("Genesis 6-7")
            [1,3]
            >>> Ref("Genesis 6:8").in_terms_of("Genesis 6:3-7:3")
            [1, 6]

        :param other: :class:`Ref`
        :return: array of indexes

        """

        #What's best behavior for these cases?
        assert isinstance(other, Ref)
        if not self.index_node == other.index_node:
            return None

        if self.is_range():
            raise Exception("Ref.in_terms_of() called on ranged Ref: {}".format(self))

        if not other.contains(self):
            return None

        ret = []

        if not other.is_range():
            ret = self.sections[len(other.sections):]
        else:
            for i in range(other.range_index(), self.index_node.depth):
                ret.append(self.sections[i] + 1 - other.sections[i])
                if other.sections[i] != self.sections[i] or len(other.sections) <= i + 1:
                    ret += self.sections[i + 1:]
                    break
        return ret

    def order_id(self):
        """
        Returns a unique id for this reference that establishes an ordering of references across the whole catalog.
        This id will change as the ordering of the categories changes, and may begin to overlap with other numbers because of those changes.
        However, at any point in time these ids will be unique across the catalog.
        Used to sort results from ElasticSearch queries

        :return string:
        """
        #Todo: handle complex texts.  Right now, all complex results are grouped under the root of the text

        cats = self.index.categories[:]
        if len(cats) >= 1 and cats[0] == "Commentary":
            cats = cats[1:2] + ["Commentary"] + cats[2:]

        key = "/".join(cats + [self.index.title])
        try:
            base = library.category_id_dict()[key]
            res = reduce(lambda x, y: x + format(y, '04'), self.sections, base)
            if self.is_range():
                res = reduce(lambda x, y: x + format(y, '04'), self.toSections, res + "-")
            return res
        except Exception as e:
            logger.warning("Failed to execute order_id for {} : {}".format(self, e))
            return "Z"

    """ Methods for working with Versions and VersionSets """
    def storage_address(self):
        """
        Return the storage location within a Version for this Ref.

        :return string:
        """
        return ".".join(["chapter"] + self.index_node.address()[1:])

    def part_projection(self):
        """
        Returns the slice and storage address to return top-level sections for Versions of this ref

        Used as:

        ::

            Version().load({...},oref.part_projection())

        **Regarding projecting complex texts:**
        By specifying a projection that includes a non-existing element of our dictionary at the level of our selection,
        we cause all other elements of the dictionary to be unselected.
        A bit non-intuitive, but a huge savings of document size and time on the data transfer.
        http://stackoverflow.com/a/15798087/213042
        """
        # todo: reimplement w/ aggregation pipeline (see above)
        # todo: special case string 0?

        projection = {k: 1 for k in Version.required_attrs + Version.optional_attrs}
        del projection[Version.content_attr]  # Version.content_attr == "chapter"
        projection["_id"] = 0

        if not self.sections:
            # For simple texts, self.store_address() == "chapter".
            # For complex texts, it can be a deeper branch of the dictionary: "chapter.Bereshit.Torah" or similar
            projection[self.storage_address()] = 1
        else:
            skip = self.sections[0] - 1
            limit = 1 if self.range_index() > 0 else self.toSections[0] - self.sections[0] + 1
            slce = {"$slice": [skip, limit]}
            projection[self.storage_address()] = slce
            if len(self.index_node.address()) > 1:
                # create dummy key at level of our selection - see above.
                dummy_limiter = ".".join(["chapter"] + self.index_node.address()[1:-1] + ["hacky_dummy_key"])
                projection[dummy_limiter] = 1

        return projection

    def condition_query(self, lang=None):
        """
        Return condition to select only versions with content at the location of this Ref.
        Usage:

        ::

            VersionSet(oref.condition_query(lang))

        Can be combined with :meth:`part_projection` to only return the content indicated by this ref:

        ::

            VersionSet(oref.condition_query(lang), proj=oref.part_projection())

        :return: dict containing a query in the format expected by VersionSet
        """
        d = {
            "title": self.index.title,
        }
        if lang:
            d.update({"language": lang})

        condition_addr = self.storage_address()
        if not isinstance(self.index_node, JaggedArrayNode):
            # This will also return versions with no content in this Ref location - since on the version, there is a dictionary present.
            # We could enter the dictionary and check each array, but it's not clear that it's neccesary.
            d.update({
                condition_addr: {"$exists": True}
            })
        elif not self.sections:
            d.update({
                condition_addr: {"$exists": True, "$elemMatch": {"$nin": ["", [], 0]}}  # any non-empty element will do
            })
        elif not self.is_spanning():
            for s in range(0, len(self.sections) if not self.is_range() else len(self.sections) - 1):
                condition_addr += ".{}".format(self.sections[s] - 1)
            if len(self.sections) == self.index_node.depth and not self.is_range():
                d.update({
                    condition_addr: {"$exists": True, "$nin": ["", [], 0]}
                })
            else:
                d.update({
                    condition_addr: {"$exists": True, "$elemMatch": {"$nin": ["", [], 0]}}
                })
        else:
            #todo: If this method gets cached, then copies need to be made before the del below.
            parts = []
            refs = self.split_spanning_ref()
            for r in refs:
                q = r.condition_query()
                del q["title"]
                parts.append(q)
                d.update({
                    "$or": parts
                })

        return d

    def versionset(self, lang=None):
        """
        :class:`VersionsSet` of :class:`Version` objects that have content for this Ref in lang, projected

        :param lang: "he", "en", or None
        :return: :class:`VersionSet`
        """
        return VersionSet(self.condition_query(lang), proj=self.part_projection())

    def version_list(self):
        """
        A list of available text versions titles and languages matching this ref.
        If this ref is book level, decorate with the first available section of content per version.

        :return list: each list element is an object with keys 'versionTitle' and 'language'
        """
        fields = ["versionTitle", "versionSource", "language", "status", "license", "versionNotes", "digitizedBySefaria", "priority"]
        versions = VersionSet(self.condition_query())
        version_list = []
        if self.is_book_level():
            for v in  versions:
                version = {f: getattr(v, f, "") for f in fields}
                oref = v.first_section_ref() or v.get_index().nodes.first_leaf().first_section_ref()
                version["firstSectionRef"] = oref.normal()
                version_list.append(version)
            return version_list
        else:
            return [
                {f: getattr(v, f, "") for f in fields}
                for v in VersionSet(self.condition_query(), proj={f: 1 for f in fields})
            ]

    """ String Representations """
    def __str__(self):
        return self.uid()

    def __repr__(self):  # Wanted to use orig_tref, but repr can not include Unicode
        return self.__class__.__name__ + "('" + str(self.uid()) + "')"

    def old_dict_format(self):
        """
        Outputs the ref in the old format, for code that relies heavily on that format
        """
        #todo: deprecate this.
        d = {
            "ref": self.tref,
            "book": self.book,
            "sections": self.sections,
            "toSections": self.toSections,
            "type": self.type
        }
        d.update(self.index.contents())
        del d["title"]
        return d

    def he_book(self):
        return self.index.get_title(lang="he")

    def _get_normal(self, lang):
        #//todo: commentary refactor
        normal = self.index_node.full_title(lang)
        if not normal:
            if lang != "en":
                return self.normal()
            else:
                raise InputError("Failed to get English normal form for ref")

        if len(self.sections) == 0:
            return normal

        if self.type == "Commentary" and not getattr(self.index, "commentaryCategories", None):
            return normal

        normal += u" "

        normal += u":".join(
            [self.index_node.address_class(i).toStr(lang, n) for i, n in enumerate(self.sections)]
        )

        for i in range(len(self.sections)):
            if not self.sections[i] == self.toSections[i]:
                normal += u"-{}".format(
                    u":".join(
                        [self.index_node.address_class(i + j).toStr(lang, n) for j, n in enumerate(self.toSections[i:])]
                    )
                )
                break

        return normal

    def normal_section(self, section_index, lang="en", **kwargs):
        """
        Return the display form of the section value at depth `section_index`
        Does not support ranges
        :param section_index: 0 based
        :param lang:
        :param kwargs:
            dotted=<bool> - Use dotted form for Hebrew talmud?,
            punctuation=<bool> - Use geresh for Hebrew numbers?
        :return:
        """
        assert not self.is_range()
        assert len(self.sections) > section_index
        return self.index_node.address_class(section_index).toStr(lang, self.sections[section_index], **kwargs)

    def normal_last_section(self, lang="en", **kwargs):
        """
        Return the display form of the last section
        Does not support ranges
        :param lang:
        :param kwargs:
            dotted=<bool> - Use dotted form for Hebrew talmud?,
            punctuation=<bool> - Use geresh for Hebrew numbers?
        :return:
        """
        length = len(self.sections)
        if length == 0:
            return ""
        return self.normal_section(length - 1, lang, **kwargs)

    def he_normal(self):
        """
        :return string: Normal Hebrew string form
        """
        '''
            18 June 2015: Removed the special casing for Hebrew Talmud sub daf numerals
            Previously, talmud lines had been normalised as arabic numerals
        '''
        if not self._he_normal:
            self._he_normal = self._get_normal("he")
        return self._he_normal

    def uid(self):
        """
        To handle the fact that default nodes have the same name as their parents
        :return:
        """
        return self.normal() + ("<d>" if self.index_node.is_default() else "")

    def normal(self):
        """
        :return string: Normal English string form
        """
        if not self._normal:
            self._normal = self._get_normal("en")
        return self._normal

    def text(self, lang="en", vtitle=None, exclude_copyrighted=False):
        """
        :param lang: "he" or "en"
        :param vtitle: optional. text title of the Version to get the text from
        :return: :class:`TextChunk` corresponding to this Ref
        """
        return TextChunk(self, lang, vtitle, exclude_copyrighted=exclude_copyrighted)

    def url(self):
        """
        :return string: normal url form
        """
        if not self._url:
            self._url = self.normal().replace(" ", "_").replace(":", ".")

            # Change "Mishna_Brachot_2:3" to "Mishna_Brachot.2.3", but don't run on "Mishna_Brachot"
            if len(self.sections) > 0:
                last = self._url.rfind("_")
                if last == -1:
                    return self._url
                lref = list(self._url)
                lref[last] = "."
                self._url = "".join(lref)
        return self._url

    def noteset(self, public=True, uid=None):
        """
        :return: :class:`NoteSet` for this Ref
        """
        from . import NoteSet
        if public and uid:
            query = {"ref": {"$regex": self.regex()}, "$or": [{"public": True}, {"owner": uid}]}
        elif public:
            query = {"ref": {"$regex": self.regex()}, "public": True}
        elif uid:
            query = {"ref": {"$regex": self.regex()}, "owner": uid}
        else:
            raise InputError("Can not get anonymous private notes")

        return NoteSet(query)

    def linkset(self):
        """
        :return: :class:`LinkSet` for this Ref
        """
        from . import LinkSet
        return LinkSet(self)


    def distance(self, ref, max_dist=None):
        """

        :param ref: ref which you want to compare distance with
        :param max_dist: maximum distance beyond which the function will return -1. it's suggested you set this param b/c alternative is very slow
        :return: int: num refs between self and ref. -1 if self and ref aren't in the same index
        """
        if self.index_node != ref.index_node:
            return -1

        # convert to base 0
        sec1 = self.sections[:]
        sec2 = ref.sections[:]
        for i in xrange(len(sec1)):
            sec1[i] -= 1
        for i in xrange(len(sec2)):
            sec2[i] -= 1

        distance = self.get_state_ja().distance(sec1,sec2)
        if max_dist and distance > max_dist:
            return -1
        else:
            return distance

class Library(object):
    """
    Operates as a singleton, through the instance called ``library``.

    Stewards the in-memory and in-cache objects that cover the entire collection of texts.

    Exposes methods to add, remove, or register change of an index record.  These are primarily called by the dependencies mechanism on Index Create/Update/Destroy.

    """

    def __init__(self):
        self.langs = ["en", "he"]

        # Maps, keyed by language, from index key to array of titles
        self._index_title_maps = {lang:{} for lang in self.langs}

        # Maps, keyed by language, from titles to schema nodes
        self._title_node_maps = {lang:{} for lang in self.langs}

        # Maps, keyed by language, from index key to array of commentary titles
        self._index_title_commentary_maps = {lang:{} for lang in self.langs}

        # Maps, keyed by language, from titles to simple and commentary schema nodes
        self._title_node_with_commentary_maps = {lang:{} for lang in self.langs}

        # Lists of full titles, keys are string generated from a combination of language code, "commentators", "commentary", and "terms".  See method `full_title_list()`
        self._full_title_lists = {}

        # Lists of full titles, including simple and commentary texts, keyed by language
        self._full_title_list_jsons = {}

        # Title regex strings & objects, keys are strings generated from a combination of arguments to `all_titles_regex` and `all_titles_regex_string`
        self._title_regex_strings = {}
        self._title_regexes = {}

        # Maps, keyed by language, from term names to text refs
        self._term_ref_maps = {lang: {} for lang in self.langs}

        # Map from index title to index object
        self._index_map = {}

        # Table of Contents
        self._toc = None
        self._toc_json = None
        self._category_id_dict = None
        self._toc_size = 16

        if not hasattr(sys, '_doc_build'):  # Can't build cache without DB
            self._build_core_maps()

    def _build_core_maps(self):
        # Build index and title node dicts in an efficient way

        # self._index_title_commentary_maps if index_object.is_commentary() else self._index_title_maps
        # simple texts
        self._index_map = {i.title: i for i in IndexSet() if i.nodes}
        forest = [i.nodes for i in self._index_map.values()]
        self._title_node_maps = {lang: {} for lang in self.langs}

        for tree in forest:
            try:
                for lang in self.langs:
                    tree_titles = tree.title_dict(lang)
                    self._index_title_maps[lang][tree.key] = tree_titles.keys()
                    self._title_node_maps[lang].update(tree_titles)
            except IndexSchemaError as e:
                logger.error(u"Error in generating title node dictionary: {}".format(e))

        # commentary
        commentary_indexes = {t: CommentaryIndex(*t.split(" on ")) for t in self.get_commentary_version_titles()}
        commentary_forest = [i.nodes for i in commentary_indexes.values()]
        self._index_map.update(commentary_indexes)
        self._title_node_with_commentary_maps = {lang: self._title_node_maps[lang].copy() for lang in self.langs}

        for tree in commentary_forest:
            try:
                for lang in self.langs:
                    tree_titles = tree.title_dict(lang)
                    self._index_title_commentary_maps[lang][tree.key] = tree_titles.keys()
                    self._title_node_with_commentary_maps[lang].update(tree_titles)
            except IndexSchemaError as e:
                logger.error(u"Error in generating title node dictionary: {}".format(e))

    def _reset_index_derivative_objects(self):
        self._full_title_lists = {}
        self._full_title_list_jsons = {}
        self._title_regex_strings = {}
        self._title_regexes = {}
        # TOC is handled separately since it can be edited in place

    def _reset_commentator_derivative_objects(self):
        """
        "commentators" in _full_title_lists
        "both" or "commentary" in _title_regex_strings
        "both" or "commentary" in _title_regexes
        :return:
        """
        for key in self._full_title_lists.keys():
            if "commentators" in key:
                del self._full_title_lists[key]

        for key in self._title_regex_strings.keys():
            if "commentary" in key or "both" in key:
                del self._title_regex_strings[key]

        for key in self._title_regexes.keys():
            if "commentary" in key or "both" in key:
                del self._title_regexes[key]

    def _reset_toc_derivate_objects(self):
        scache.delete_cache_elem('toc_cache')
        scache.delete_cache_elem('toc_json_cache')
        scache.set_cache_elem('toc_cache', self.get_toc(), 600000)
        scache.set_cache_elem('toc_json_cache', self.get_toc_json(), 600000)
        scache.delete_template_cache("texts_list")
        scache.delete_template_cache("texts_dashboard")
        self._full_title_list_jsons = {}

    def rebuild(self, include_toc = False):
        self._build_core_maps()
        self._reset_index_derivative_objects()
        Ref.clear_cache()
        if include_toc:
            self.rebuild_toc()

    def rebuild_toc(self):
        self._toc = None
        self._toc_json = None
        self._category_id_dict = None
        self._reset_toc_derivate_objects()

    def get_toc(self):
        """
        Returns table of contents object from cache,
        DB or by generating it, as needed.
        """
        if not self._toc:
            self._toc = scache.get_cache_elem('toc_cache')
            if not self._toc:
                from sefaria.summaries import update_table_of_contents
                self._toc = update_table_of_contents()
                scache.set_cache_elem('toc_cache', self._toc)
        return self._toc

    def get_toc_json(self):
        """
        Returns JSON representation of TOC.
        """
        if not self._toc_json:
            self._toc_json = scache.get_cache_elem('toc_json_cache')
            if not self._toc_json:
                self._toc_json = json.dumps(self.get_toc())
                scache.set_cache_elem('toc_json_cache', self._toc_json)
        return self._toc_json

    def recount_index_in_toc(self, indx):
        from sefaria.summaries import update_title_in_toc
        self._toc = update_title_in_toc(self.get_toc(), indx, recount=True)
        self._toc_json = None
        self._category_id_dict = None
        self._reset_toc_derivate_objects()

    def delete_index_from_toc(self, bookname):
        from sefaria.summaries import recur_delete_element_from_toc
        self._toc = recur_delete_element_from_toc(bookname, self.get_toc())
        self._toc_json = None
        self._category_id_dict = None
        self._reset_toc_derivate_objects()

    def update_index_in_toc(self, indx, old_ref=None):
        """
        :param indx:
        :param old_ref:
        :return:
        """
        from sefaria.summaries import update_title_in_toc
        self._toc = update_title_in_toc(self.get_toc(), indx, old_ref=old_ref, recount=False)
        self._toc_json = None
        self._category_id_dict = None
        self._reset_toc_derivate_objects()

    def get_index(self, bookname):
        """
        Factory - returns either an :class:`Index` object or a :class:`CommentaryIndex` object

        :param string bookname: Name of the book or commentary on book.
        :return:
        """
        # look for result in indices cache
        if not bookname:
            raise BookNameError("No book provided.")

        indx = self._index_map.get(bookname)
        if not indx:
            bookname = (bookname[0].upper() + bookname[1:]).replace("_", " ")  #todo: factor out method

            #todo: cache
            lang = "he" if is_hebrew(bookname) else "en"
            node = self._title_node_maps[lang].get(bookname)
            if node:
                indx = node.index
            else:
                # "commenter" on "book"
                # todo: handle hebrew x on y format (do we need this?)
                pattern = r'(?P<commentor>.*) on (?P<book>.*)'
                m = regex.match(pattern, bookname)
                if m:
                    indx = CommentaryIndex(m.group('commentor'), m.group('book'))
                else:
                    #simple commentary record
                    indx = Index().load({
                            "titleVariants": bookname,
                            "categories.0": "Commentary"
                        })

            if not indx:
                raise BookNameError(u"No book named '{}'.".format(bookname))

            self._index_map[bookname] = indx

        return indx

    def add_commentary_index(self, title):
        m = re.match(r'^(.*) on (.*)', title)
        self.add_index_record_to_cache(CommentaryIndex(m.group(1), m.group(2)))

    def remove_commentary_index(self, title):
        self.remove_index_record_from_cache(old_title=title)

    def add_index_record_to_cache(self, index_object = None, rebuild = True):
        """
        Update library title dictionaries and caches with information from provided index.
        Index can be passed with primary title in `index_title` or as an object in `index_object`
        :param index_object: Index record
        :param rebuild: Perform a rebuild of derivative objects afterwards?  False only in cases of batch update.
        :return:
        """
        assert index_object, "Library.add_index_record_to_cache called without index"

        # don't add simple commentator records
        if not index_object.nodes:
            self._reset_commentator_derivative_objects()
            # logger.error("Tried to add commentator {} to cache.  Politely refusing.".format(index_object.title))
            return

        self._index_map[index_object.title] = index_object

        #//TODO: mark for commentary refactor
        title_maps = self._index_title_commentary_maps if index_object.is_commentary() else self._index_title_maps

        try:
            for lang in self.langs:
                title_dict = index_object.nodes.title_dict(lang)
                title_maps[lang][index_object.title] = title_dict.keys()
                self._title_node_with_commentary_maps[lang].update(title_dict)
                if not index_object.is_commentary():
                    self._title_node_maps[lang].update(title_dict)
        except IndexSchemaError as e:
            logger.error(u"Error in generating title node dictionary: {}".format(e))

        if rebuild:
            self._reset_index_derivative_objects()

    def remove_index_record_from_cache(self, index_object=None, old_title=None, rebuild = True):
        """
        Update provided index from library title dictionaries and caches
        :param index_object:
        :param old_title: In the case of a title change - the old title of the Index record
        :param rebuild: Perform a rebuild of derivative objects afterwards?
        :return:
        """
        if index_object and not index_object.nodes:
            for key in index_object.titleVariants + index_object.heTitleVariants + [old_title]:
                try:
                    del self._index_map[key]
                except KeyError:
                    pass
            self._reset_commentator_derivative_objects()
            return

        index_title = old_title or index_object.title
        Ref.remove_index_from_cache(index_title)

        #//TODO: mark for commentary refactor
        #//Keeping commentary branch and simple branch completely separate - should make refactor easier
        for lang in self.langs:
            commentary_titles = self._index_title_commentary_maps[lang].get(index_title)
            simple_titles = self._index_title_maps[lang].get(index_title)
            if simple_titles:
                for key in simple_titles:
                    try:
                        del self._title_node_with_commentary_maps[lang][key]
                        del self._title_node_maps[lang][key]
                    except KeyError:
                        logger.warning("Tried to delete non-existent title '{}' of index record '{}' from title-node map".format(key, index_title))
                    try:
                        del self._index_map[key]
                    except KeyError:
                        pass
                del self._index_title_maps[lang][index_title]
            elif commentary_titles:
                for key in commentary_titles:
                    try:
                        del self._title_node_with_commentary_maps[lang][key]
                    except KeyError:
                        logger.warning("Tried to delete non-existent title '{}' of index record '{}' from title-node map".format(key, index_title))
                    try:
                        del self._index_map[key]
                    except KeyError:
                        pass
                del self._index_title_commentary_maps[lang][index_title]
            else:
                logger.warning("Failed to remove '{}' from {} index-title and title-node cache: nothing to remove".format(index_title, lang))
                return

        if rebuild:
            self._reset_index_derivative_objects()


    def refresh_index_record_in_cache(self, index_object, old_title = None):
        """
        Update library title dictionaries and caches for provided index
        :param title: primary title of index
        :return:
        """

        self.remove_index_record_from_cache(index_object, old_title=old_title, rebuild=False)
        new_index = None
        if isinstance(index_object, Index):
            new_index = Index().load({"title":index_object.title})
        elif isinstance(index_object, CommentaryIndex):
            pattern = r'(?P<commentor>.*) on (?P<book>.*)'
            m = regex.match(pattern, index_object.title)
            if m:
                new_index = CommentaryIndex(m.group('commentor'), m.group('book'))
        assert new_index, u"No Index record found for {}: {}".format(index_object.__class__.__name__, index_object.title)
        self.add_index_record_to_cache(new_index, rebuild=True)

    #todo: the for_js path here does not appear to be in use.
    def all_titles_regex_string(self, lang="en", commentary=False, with_commentary=False, with_terms=False): #, for_js=False):
        """
        :param lang: "en" or "he"
        :param commentary: If true matches ONLY commentary records
        :param with_commentary: If true, overrides `commentary` argument and matches BOTH "x on y" style records and simple records
        Note that matching behavior differs between commentary=True and with_commentary=True.
        commentary=True matches 'title', 'commentor' and 'commentee' named groups.
        with_commentary=True matches only 'title', wether for plain records or commentary records.
        :param with_terms:
        :param for_js:
        :return:
        """
        if lang == "he" and (commentary or with_commentary):
            raise InputError("No support for Hebrew Commentatory Ref Objects")
        key = lang
        key += "_both" if with_commentary else "_commentary" if commentary else ""
        key += "_terms" if with_terms else ""
        re_string = self._title_regex_strings.get(key)
        if not re_string:
            re_string = u""
            simple_books = map(re.escape, self.full_title_list(lang, with_commentators=False, with_commentary=with_commentary, with_terms=with_terms))
            simple_book_part = ur'|'.join(sorted(simple_books, key=len, reverse=True))  # Match longer titles first

            # re_string += ur'(?:^|[ ([{>,-]+)' if for_js else u''  # Why don't we check for word boundaries internally as well?
            # re_string += ur'(?:\u05d5?(?:\u05d1|\u05de|\u05dc|\u05e9|\u05d8|\u05d8\u05e9)?)' if for_js and lang == "he" else u'' # likewise leading characters in Hebrew?
            # re_string += ur'(' if for_js else
            re_string = ur'(?P<title>'
            if not commentary:
                re_string += simple_book_part
            else:
                first_part = ur'|'.join(map(re.escape, self.get_commentator_titles(with_variants=True)))
                # if for_js:
                #    re_string += ur"(" + first_part + ur") on (" + simple_book_part + ur")"
                # else:
                re_string += ur"(?P<commentor>" + first_part + ur") on (?P<commentee>" + simple_book_part + ur")"
            re_string += ur')'
            re_string += ur'($|[:., <]+)'
            self._title_regex_strings[key] = re_string

        return re_string

    #WARNING: Do NOT put the compiled re2 object into redis.  It gets corrupted.
    def all_titles_regex(self, lang="en", commentary=False, with_commentary=False, with_terms=False):
        """
        :return: A regular expression object that will match any known title in the library in the provided language
        :param lang: "en" or "he"
        :param bool commentary: Default False.
            If True, matches "X on Y" style commentary records only.
            If False matches simple records only.
        :param with_commentary: If true, overrides `commentary` argument and matches BOTH "x on y" style records and simple records
        Note that matching behavior differs between commentary=True and with_commentary=True.
        commentary=True matches 'title', 'commentor' and 'commentee' named groups.
        with_commentary=True matches only 'title', whether for plain records or commentary records.
        :param bool with_terms: Default False.  If True, include shared titles ('terms')
        :raise: InputError: if lang == "he" and commentary == True

        Uses re2 if available.  See https://github.com/Sefaria/Sefaria-Project/wiki/Regular-Expression-Engines
        """
        key = "all_titles_regex_" + lang
        key += "_both" if with_commentary else "_commentary" if commentary else ""
        key += "_terms" if with_terms else ""
        reg = self._title_regexes.get(key)
        if not reg:
            re_string = self.all_titles_regex_string(lang, commentary, with_commentary, with_terms)
            try:
                reg = re.compile(re_string, max_mem=256 * 1024 * 1024)
            except TypeError:
                reg = re.compile(re_string)
            self._title_regexes[key] = reg
        return reg

    def full_title_list(self, lang="en", with_commentators=True, with_commentary=False, with_terms=False):
        """
        :return: list of strings of all possible titles
        :param lang: "he" or "en"
        :param with_commentators: if True, includes the commentator names, with variants (not the cross-product with books)
        :param with_commentary: if True, includes all existing "X on Y" type commentary records
        :param with_terms: if True, includes shared titles ('terms')
        """

        key = lang
        key += "_commentators" if with_commentators else ""
        key += "_commentary" if with_commentary else ""
        key += "_terms" if with_terms else ""
        titles = self._full_title_lists.get(key)
        if not titles:
            titles = self.get_title_node_dict(lang, with_commentary=with_commentary).keys()
            if with_terms:
                titles += self.get_term_dict(lang).keys()
            if with_commentators:
                titles += self.get_commentator_titles(lang, with_variants=True)
            self._full_title_lists[key] = titles
        return titles

    def ref_list(self):
        """
        :return: list of all section-level Refs in the library
        """
        section_refs = []
        for indx in self.all_index_records(True):
            try:
                section_refs += indx.all_section_refs()
            except Exception as e:
                logger.warning(u"Failed to get section refs for {}: {}".format(getattr(indx,"title","unknown index"), e))
        return section_refs

    def get_term_dict(self, lang="en"):
        """
        :return: dict of shared titles that have an explicit ref
        :param lang: "he" or "en"
        """
        # key = "term_dict_" + lang
        # term_dict = self.local_cache.get(key)
        term_dict = self._term_ref_maps.get(lang)
        # if not term_dict:
        #    term_dict = scache.get_cache_elem(key)
        #    self.local_cache[key] = term_dict
        if not term_dict:
            term_dict = {}
            terms = TermSet({"$and":[{"ref": {"$exists":True}},{"ref":{"$nin":["",[]]}}]})
            for term in terms:
                for title in term.get_titles(lang):
                    term_dict[title] = term.ref
            # scache.set_cache_elem(key, term_dict)
            # self.local_cache[key] = term_dict
            self._term_ref_maps[lang] = term_dict
        return term_dict

    #todo: no usages?
    def get_content_nodes(self, with_commentary=False):
        """
        :return: list of all content nodes in the library
        :param bool with_commentary: If True, returns "X on Y" type titles as well
        """
        nodes = []
        forest = self.get_index_forest(with_commentary=with_commentary)
        for tree in forest:
            nodes += tree.get_leaf_nodes()
        return nodes

    #todo: used in get_content_nodes, but besides that, only bio scripts
    def get_index_forest(self, with_commentary=False):
        """
        :return: list of root Index nodes.
        :param bool with_commentary: If True, returns "X on Y" type titles as well
        """
        #todo: speed: does it matter that this skips the index cache?
        root_nodes = [i.nodes for i in IndexSet() if not i.is_commentary()]

        if with_commentary:
            ctitles = self.get_commentary_version_titles()
            for title in ctitles:
                try:
                    i = self.get_index(title)
                    root_nodes.append(i.nodes)

                # TEMPORARY - filter out complex texts
                except BookNameError:
                    pass
                # End TEMPORARY

        return root_nodes

    def all_index_records(self, with_commentary=False):
        r = [i for i in IndexSet() if i.nodes]
        if with_commentary:
            ctitles = self.get_commentary_version_titles()
            for title in ctitles:
                i = self.get_index(title)
                r.append(i)
        return r

    def get_title_node_dict(self, lang="en", with_commentary=False):
        """
        :param lang: "he" or "en"
        :param bool with_commentary: if true, includes "X on Y" types nodes
        :return:  dictionary of string titles and the nodes that they point to.

        Does not include bare commentator names, like *Rashi*.
        """
        return self._title_node_with_commentary_maps[lang] if with_commentary else self._title_node_maps[lang]


    #todo: handle terms
    def get_schema_node(self, title, lang=None, with_commentary=False):
        """
        :param string title:
        :param lang: "en" or "he"
        :return: a particular SchemaNode that matches the provided title and language
        :rtype: :class:`sefaria.model.schema.SchemaNode`
        """
        if not lang:
            lang = "he" if is_hebrew(title) else "en"
        title = title.replace("_", " ")
        return self.get_title_node_dict(lang, with_commentary=with_commentary).get(title)

    def get_text_titles_json(self, lang="en"):
        """
        :return: JSON of full texts list, (cached)
        """
        title_json = self._full_title_list_jsons.get(lang)
        if not title_json:
            from sefaria.summaries import flatten_toc
            title_list = self.full_title_list(lang=lang, with_commentary=True)
            if lang == "en":
                toc_titles = flatten_toc(self.get_toc())
                secondary_list = list(set(title_list) - set(toc_titles))
                title_list = toc_titles + secondary_list
            title_json = json.dumps(title_list)
            self._full_title_list_jsons[lang] = title_json
        return title_json

    def get_text_categories(self):
        """
        :return: List of all known text categories.
        """
        return IndexSet().distinct("categories")

    def get_indexes_in_category(self, category, include_commentary=False, full_records=False):
        """
        :param string category: Name of category
        :param bool include_commentary: If true includes records of Commentary and Targum
        :param bool full_records: If True will return the actual :class: 'IndexSet' otherwise just the titles
        :return: :class:`IndexSet` of :class:`Index` records in the specified category
        """

        if not include_commentary:
            q = {"$and": [{"categories": category}, {"categories": {"$ne": "Commentary"}}, {"categories": {"$ne": "Commentary2"}}, {"categories": {"$ne": "Targum"}}]}
        else:
            q = {"categories": category}

        return IndexSet(q) if full_records else IndexSet(q).distinct("title")

    def get_commentator_titles(self, lang="en", with_variants=False, with_commentary2=False):
        #//TODO: mark for commentary refactor
        """
        :param lang: "he" or "en"
        :param with_variants: If True, includes titles variants along with the primary titles.
        :return: List of titles
        """
        args = {
            ("en", False): "title",
            ("en", True): "titleVariants",
            ("he", False): "heTitle",
            ("he", True): "heTitleVariants"
        }
        commentators  = IndexSet({"categories.0": "Commentary"}).distinct(args[(lang, with_variants)])
        if with_commentary2:
            commentary2   = IndexSet({"categories.0": "Commentary2"}).distinct(args[(lang, with_variants)])
            commentators  = commentators + [s.split(" on ")[0].split(u" על ")[0] for s in commentary2]

        return commentators

    def get_commentary_versions(self, commentators=None, with_commentary2=False):
        """
        :param string|list commentators: A single commentator name, or a list of commentator names.
        :return: :class:`VersionSet` of :class:`Version` records for the specified commentators

        If no commentators are provided, all commentary Versions will be returned.
        """
        if isinstance(commentators, basestring):
            commentators = [commentators]
        if not commentators:
            commentators = self.get_commentator_titles(with_commentary2=with_commentary2)
        commentary_re = ur"^({}) on ".format("|".join(commentators))
        query = {"title": {"$regex": commentary_re}}
        if with_commentary2:
            # Handle Commentary2 texts that don't have "X on Y" titles (e.g., "Rambam's Introduction to the Mishnah")
            if not commentators:
                titles = IndexSet({"categories.0": "Commentary2"}).distinct("title")
            else:
                titles = IndexSet({"categories.0": "Commentary2", "categories.2": {"$in": commentators}}).distinct("title")
            query = {"$or":[query, {"title": {"$in": titles}}]}
        return VersionSet(query)

    def get_commentary_version_titles(self, commentators=None, with_commentary2=False):
        """
        :param string|list commentators: A single commentator name, or a list of commentator names.
        :return: list of titles of :class:`Version` records for the specified commentators

        If no commentators are provided, all commentary Versions will be returned.
        """
        return self.get_commentary_versions(commentators, with_commentary2=with_commentary2).distinct("title")

    def get_commentary_versions_on_book(self, book=None, with_commentary2=False):
        """
        :param string book: The primary name of a book
        :return: :class:`VersionSet` of :class:`Version` records that comment on the provided book
        """
        assert book
        commentators = self.get_commentator_titles(with_commentary2=with_commentary2)
        commentary_re = ur"^({}) on {}$".format("|".join(commentators), book)
        return VersionSet({"title": {"$regex": commentary_re}})

    def get_commentary_version_titles_on_book(self, book, with_commentary2=False):
        """
        :param string book: The primary name of a book
        :return: list of titles of :class:`Version` records that comment on the provided book
        """
        return self.get_commentary_versions_on_book(book, with_commentary2=with_commentary2).distinct("title")

    def get_titles_in_string(self, s, lang=None):
        """
        Returns the titles found in the string.

        :param s: The string to search
        :param lang: "en" or "he"
        :return list: titles found in the string
        """
        if not lang:
            lang = "he" if is_hebrew(s) else "en"
        if lang=="en":
            #todo: combine into one regex
            return [m.group('title') for m in self.all_titles_regex(lang, with_commentary=True).finditer(s)]
        elif lang=="he":
            return [m.group('title') for m in self.all_titles_regex(lang, commentary=False).finditer(s)]

    def get_refs_in_string(self, st, lang=None):
        """
        Returns an list of Ref objects derived from string

        :param string st: the input string
        :param lang: "he" or "en"
        :return: list of :class:`Ref` objects
        """
        # todo: only match titles of content nodes

        refs = []
        if lang is None:
            lang = "he" if is_hebrew(st) else "en"
        if lang == "he":
            from sefaria.utils.hebrew import strip_nikkud
            st = strip_nikkud(st)
            unique_titles = {title: 1 for title in self.get_titles_in_string(st, lang)}
            for title in unique_titles.iterkeys():
                try:
                    res = self._build_all_refs_from_string(title, st)
                except AssertionError as e:
                    logger.info(u"Skipping Schema Node: {}".format(title))
                else:
                    refs += res
        else:  # lang == "en"
            for match in self.all_titles_regex(lang, with_commentary=True).finditer(st):
                title = match.group('title')
                if not title:
                    continue
                try:
                    res = self._build_ref_from_string(title, st[match.start():])  # Slice string from title start
                except AssertionError as e:
                    logger.info(u"Skipping Schema Node: {}".format(title))
                except InputError as e:
                    logger.info(u"Input Error searching for refs in string: {}".format(e))
                else:
                    refs += res
        return refs

    # do we want to move this to the schema node? We'd still have to pass the title...
    def get_regex_string(self, title, lang, for_js=False):
        node = self.get_schema_node(title, lang, with_commentary=True)
        assert isinstance(node, JaggedArrayNode)  # Assumes that node is a JaggedArrayNode

        if lang == "en" or for_js:  # Javascript doesn't support look behinds.
            return node.full_regex(title, lang, for_js=for_js, match_range=for_js, compiled=False, anchored=(not for_js))

        elif lang == "he":
            return ur"""(?<=							# look behind for opening brace
                    [({]										# literal '(', brace,
                    [^})]*										# anything but a closing ) or brace
                )
                """ + regex.escape(title) + node.after_title_delimiter_re + node.address_regex(lang, for_js=for_js, match_range=for_js) + ur"""
                (?=\W|$)                                        # look ahead for non-word char
                (?=												# look ahead for closing brace
                    [^({]*										# match of anything but an opening '(' or brace
                    [)}]										# zero-width: literal ')' or brace
                )"""

    #todo: handle ranges in inline refs
    def _build_ref_from_string(self, title=None, st=None, lang="en"):
        """
        Build a Ref object given a title and a string.  The title is assumed to be at position 0 in the string.
        This is used primarily for English matching.  Hebrew matching is done with _build_all_refs_from_string()
        :param title: The title used in the text to refer to this Index node
        :param st: The source text for this reference
        :return: Ref
        """
        node = self.get_schema_node(title, lang, with_commentary=True)
        assert isinstance(node, JaggedArrayNode)  # Assumes that node is a JaggedArrayNode

        try:
            re_string = self.get_regex_string(title, lang)
        except AttributeError as e:
            logger.warning(u"Library._build_ref_from_string() failed to create regex for: {}.  {}".format(title, e))
            return []

        reg = regex.compile(re_string, regex.VERBOSE)
        ref_match = reg.match(st)
        if ref_match:
            sections = []
            gs = ref_match.groupdict()
            for i in range(0, node.depth):
                gname = u"a{}".format(i)
                if gs.get(gname) is not None:
                    sections.append(node._addressTypes[i].toNumber(lang, gs.get(gname)))

            _obj = {
                "tref": ref_match.group(),
                "book": node.full_title("en"),
                "index_node": node,
                "index": node.index,
                "type": node.index.categories[0],
                "sections": sections,
                "toSections": sections
            }
            try:
                return [Ref(_obj=_obj)]
            except InputError:
                return []
        else:
            return []

    #todo: handle ranges in inline refs
    def _build_all_refs_from_string(self, title=None, st=None, lang="he"):
        """
        Build all Ref objects for title found in string.  By default, only match what is found between braces (as in Hebrew).
        This is used primarily for Hebrew matching.  English matching uses _build_ref_from_string()
        :param title: The title used in the text to refer to this Index node
        :param st: The source text for this reference
        :return: list of Refs
        """
        node = self.get_schema_node(title, lang)
        assert isinstance(node, JaggedArrayNode)  # Assumes that node is a JaggedArrayNode

        refs = []
        try:
            re_string = self.get_regex_string(title, lang)
        except AttributeError as e:
            logger.warning(u"Library._build_all_refs_from_string() failed to create regex for: {}.  {}".format(title, e))
            return refs

        reg = regex.compile(re_string, regex.VERBOSE)
        for ref_match in reg.finditer(st):
            sections = []
            gs = ref_match.groupdict()
            for i in range(0, node.depth):
                gname = u"a{}".format(i)
                if gs.get(gname) is not None:
                    sections.append(node._addressTypes[i].toNumber(lang, gs.get(gname)))

            _obj = {
                "tref": ref_match.group(),
                "book": node.full_title("en"),
                "index_node": node,
                "index": node.index,
                "type": node.index.categories[0],
                "sections": sections,
                "toSections": sections
            }
            try:
                refs.append(Ref(_obj=_obj))
            except InputError:
                continue
        return refs

    def category_id_dict(self, toc=None, cat_head="", code_head=""):
        if toc is None:
            if not self._category_id_dict:
                self._category_id_dict = self.category_id_dict(self.get_toc())
            return self._category_id_dict

        d = {}

        for i, c in enumerate(toc):
            name = c["category"] if "category" in c else c["title"]
            if cat_head:
                key = "/".join([cat_head, name])
                val = code_head + format(i, '02')
            else:
                key = name
                val = "A" + format(i, '02')

            d[key] = val
            if "contents" in c:
                d.update(self.category_id_dict(c["contents"], key, val))

        return d

library = Library()


# Deprecated
def get_index(bookname):
    logger.warning("Use of deprecated function: get_index(). Use library.get_index()")
    return library.get_index(bookname)


def process_index_title_change_in_versions(indx, **kwargs):
    VersionSet({"title": kwargs["old"]}).update({"title": kwargs["new"]})

    if indx.is_commentary():  # and "commentaryBook" not in d:  # looks useless
        old_titles = library.get_commentary_version_titles(kwargs["old"])
    else:
        old_titles = library.get_commentary_version_titles_on_book(kwargs["old"])
    old_new = [(title, title.replace(kwargs["old"], kwargs["new"], 1)) for title in old_titles]
    for pair in old_new:
        VersionSet({"title": pair[0]}).update({"title": pair[1]})


def process_index_delete_in_versions(indx, **kwargs):
    VersionSet({"title": indx.title}).delete()
    if indx.is_commentary():  # and not getattr(self, "commentator", None):   # Seems useless
        library.get_commentary_versions(indx.title).delete()


def process_index_title_change_in_core_cache(indx, **kwargs):
    old_title = kwargs["old"]
    if USE_VARNISH:
        from sefaria.system.sf_varnish import invalidate_title
        invalidate_title(old_title)
    scache.delete_cache_elem(scache.generate_text_toc_cache_key(old_title))
    library.refresh_index_record_in_cache(indx, old_title=old_title)


def process_commentary_version_title_change_in_cache(ver, **kwargs):
    old_title = kwargs["old"]
    if USE_VARNISH:
        from sefaria.system.sf_varnish import invalidate_title
        invalidate_title(old_title)
    scache.delete_cache_elem(scache.generate_text_toc_cache_key(old_title))
    library.refresh_index_record_in_cache(library.get_index(ver.title), old_title=old_title)


def process_index_change_in_core_cache(indx, **kwargs):
    if kwargs.get("is_new"):
        library.add_index_record_to_cache(indx)
    else:
        scache.delete_cache_elem(scache.generate_text_toc_cache_key(indx.title))
        library.refresh_index_record_in_cache(indx)
        if USE_VARNISH:
            from sefaria.system.sf_varnish import invalidate_index
            invalidate_index(indx.title)


def process_index_change_in_toc(indx, **kwargs):
    if indx.is_commentary():
        library.rebuild_toc()
    else:
        library.update_index_in_toc(indx, old_ref=kwargs.get('orig_vals').get('title') if kwargs.get('orig_vals') else None)


def process_index_delete_in_toc(indx, **kwargs):
    if indx.is_commentary():
        library.rebuild_toc()
    else:
        library.delete_index_from_toc(indx.title)


def process_index_delete_in_core_cache(indx, **kwargs):
    scache.delete_cache_elem(scache.generate_text_toc_cache_key(indx.title))
    library.remove_index_record_from_cache(indx)
    if USE_VARNISH:
        from sefaria.system.sf_varnish import invalidate_index, invalidate_counts
        invalidate_index(indx.title)
        invalidate_counts(indx.title)

def process_version_save_in_cache(ver, **kwargs):
    scache.delete_cache_elem(scache.generate_text_toc_cache_key(ver.title))
    if not Index().load({"title": ver.title}) and " on " in ver.title:
        library.remove_commentary_index(ver.title)
        library.add_commentary_index(ver.title)

def process_version_delete_in_cache(ver, **kwargs):
    scache.delete_cache_elem(scache.generate_text_toc_cache_key(ver.title))
    if not Index().load({"title": ver.title}) and " on " in ver.title:
        library.remove_commentary_index(ver.title)


