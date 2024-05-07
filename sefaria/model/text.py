# -*- coding: utf-8 -*-
"""
text.py
"""

import time
import structlog
from functools import reduce, partial
from typing import Optional, Union
logger = structlog.get_logger(__name__)

import sys
import regex
import copy
import bleach
import json
import itertools
from collections import defaultdict
from bs4 import BeautifulSoup, Tag
try:
    import re2 as re
    re.set_fallback_notification(re.FALLBACK_WARNING)
except ImportError:
    logger.warning("Failed to load 're2'.  Falling back to 're' for regular expression parsing. See https://github.com/sefaria/Sefaria-Project/wiki/Regular-Expression-Engines")
    import re

from . import abstract as abst
from .schema import deserialize_tree, SchemaNode, VirtualNode, DictionaryNode, JaggedArrayNode, TitledTreeNode, DictionaryEntryNode, SheetNode, AddressTalmud, Term, TermSet, TitleGroup, AddressType
from sefaria.system.database import db

import sefaria.system.cache as scache
from sefaria.system.cache import in_memory_cache
from sefaria.system.exceptions import InputError, BookNameError, PartialRefInputError, IndexSchemaError, \
    NoVersionFoundError, DictionaryEntryNotFoundError, MissingKeyError
from sefaria.utils.hebrew import hebrew_term
from sefaria.utils.tibetan import has_tibetan,is_all_tibetan
from sefaria.utils.util import list_depth, truncate_string
from sefaria.datatype.jagged_array import JaggedTextArray, JaggedArray
from sefaria.settings import DISABLE_INDEX_SAVE, USE_VARNISH, MULTISERVER_ENABLED, RAW_REF_MODEL_BY_LANG_FILEPATH, RAW_REF_PART_MODEL_BY_LANG_FILEPATH, DISABLE_AUTOCOMPLETER
from sefaria.system.multiserver.coordinator import server_coordinator
from sefaria.constants import model as constants

"""
                ----------------------------------
                         Index, IndexSet
                ----------------------------------
"""


class AbstractIndex(object):
    def contents(self, raw=False, **kwargs):
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

        return self.nodes.primary_title(lang)

    def set_title(self, title, lang="en"):
        if getattr(self, 'nodes', None) is None:
            if lang == "en":
                self._title = title
            return

        if lang == "en":
            self._title = title  # we need to store the title attr in a physical storage, note that .title is a virtual property
            self.nodes.key = title

        old_primary = self.nodes.primary_title(lang)
        self.nodes.add_title(title, lang, True, True)
        if old_primary != title:  # then remove the old title, we don't want it.
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
                            "primary_category": vs.index.get_primary_category(),
                            "index_node": c,
                            "sections": sections,
                            "toSections": sections
                        }
                    )]
            except Exception as e:
                logger.warning("Failed to generate references for {}, section {}. {}".format(c.full_title("en"), ".".join([str(s) for s in sections]) if sections else "-", str(e)))
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
        from . import topic
        return [topic.Topic.init(slug) for slug in getattr(self, "authors", []) if topic.Topic.init(slug)]

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
        contents = self.contents()
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
                    if "key" in node:
                        annotate_schema(node, vstate[node["key"]])
            else:
                schema["content_counts"] = simplify_version_state(vstate)

        annotate_schema(contents["schema"], vstate.content)
        return contents


class Index(abst.AbstractMongoRecord, AbstractIndex):
    """
    Index objects define the names and structure of texts stored in the system.
    There is an Index object for every text.

    """
    collection = 'index'
    history_noun = 'index'
    criteria_field = 'title'
    criteria_override_field = 'oldTitle'  # used when primary attribute changes. field that holds old value.
    track_pkeys = True
    pkeys = ["title", "compPlace", "pubPlace"]

    required_attrs = [
        "title",
        "categories"
    ]
    optional_attrs = [
        "schema",             # required for new style
        "alt_structs",        # optional for new style
        "default_struct",     # optional for new style
        "exclude_structs",    # optional, specifies which structs the client should ignore when displaying navigation ToCs
        "order",              # optional for old style and new
        "authors",
        "enDesc",
        "heDesc",
        "enShortDesc",
        "heShortDesc",
        "pubDate",
        "hasErrorMargin",     # (bool) whether or not compDate is exact.  used to be 'errorMargin' which was an integer amount that compDate was off by
        "compDate",
        "compPlace",
        "pubPlace",
        "era",
        "dependence",           # (str) Values: "Commentary" or "Targum" - to denote commentaries and other potential not standalone texts
        "base_text_titles",     # (list) the base book(s) this one is dependant on
        "base_text_mapping",    # (str) string that matches a key in sefaria.helper.link.AutoLinkerFactory._class_map
        "collective_title",     # (str) string value for a group of index records - the former commentator name. Requires a matching term.
        "is_cited",             # (bool) only indexes with this attribute set to True will be picked up as a citation in a text by default
        "lexiconName",          # (str) For dictionaries - the name used in the Lexicon collection
        "dedication",           # (dict) Dedication texts, keyed by language
        "hidden",               # (bool) Default false.  If not present, Index is visible in all TOCs.  True value hides the text in the main TOC, but keeps it in the search toc.
        "corpora",              # (list[str]) List of corpora that this index is included in. Currently these are just strings without validation. First element is used to group texts for determining version preference within a corpus.
    ]

    def __str__(self):
        return "Index: {}".format(self.title)

    def __repr__(self):  # Wanted to use orig_tref, but repr can not include Unicode
        return "{}().load({{'title': '{}'}})".format(self.__class__.__name__, self.title)

    def save(self, override_dependencies=False):
        if DISABLE_INDEX_SAVE:
            raise InputError("Index saving has been disabled on this system.")
        return super(Index, self).save(override_dependencies=override_dependencies)

    def _set_derived_attributes(self):
        if getattr(self, "schema", None):
            self.nodes = deserialize_tree(self.schema, index=self)
            # Our pattern has been to validate on save, not on load
            # self.nodes.validate()
        else:
            self.nodes = None
        self._set_struct_objs()

    def _set_struct_objs(self):
        self.struct_objs = {}
        if getattr(self, "alt_structs", None) and self.nodes:
            for name, struct in list(self.alt_structs.items()):
                self.struct_objs[name] = deserialize_tree(struct, index=self, struct_class=TitledTreeNode)
                self.struct_objs[name].title_group = self.nodes.title_group

    def is_complex(self):
        return getattr(self, "nodes", None) and self.nodes.has_children()

    def contents(self, raw=False, with_content_counts=False, with_related_topics=False, **kwargs):
        if raw:
            contents = super(Index, self).contents()
        else:
            # adds a set of legacy fields like 'titleVariants', expands alt structures with preview, etc.
            contents = self.nodes.as_index_contents()
            if with_content_counts:
                contents["schema"] = self.annotate_schema_with_content_counts(contents["schema"])
                contents["firstSectionRef"] = Ref(self.title).first_available_section_ref().normal()

            contents = self.expand_metadata_on_contents(contents)
        return contents


    def annotate_schema_with_content_counts(self, schema):
        """
        Returns the `schema` dictionary with each node annotated with section lengths info
        from version_state.
        """
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
                    if "key" in node:
                        annotate_schema(node, vstate[node["key"]])
            else:
                schema["content_counts"] = simplify_version_state(vstate)

        annotate_schema(schema, vstate.content)

        return schema

    def expand_metadata_on_contents(self, contents):
        """
        Decorates contents with expanded meta data such as Hebrew author names, human readable date strings etc.
        :param contents: the initial dictionary of contents
        :return: a dictionary of contents with additional fields
        """
        authors = self.author_objects()
        if len(authors):
            contents["authors"] = [{"en": author.get_primary_title("en"), "he": author.get_primary_title("he"), "slug": author.slug} for author in authors]

        if getattr(self, "collective_title", None):
            contents["collective_title"] = {"en": self.collective_title, "he": hebrew_term(self.collective_title)}

        if getattr(self, "base_text_titles", None):
            contents["base_text_titles"] = [{"en": btitle, "he": hebrew_term(btitle)} for btitle in self.base_text_titles]

        contents["heCategories"] = list(map(hebrew_term, self.categories))
        contents = self.time_period_and_place_contents(contents)
        return contents

    def time_period_and_place_contents(self, contents):
        """ Used to expand contents for date and time info """
        for k, f in [("compDateString", self.composition_time_period), ("pubDateString", self.publication_time_period)]:
            time_period = f()
            if time_period:
                contents[k] = {"en": time_period.period_string('en'), 'he': time_period.period_string('he')}

        for k, f in [("compPlaceString", self.composition_place), ("pubPlaceString", self.publication_place)]:
            place = f()
            if place:
                contents[k] = {"en": place.primary_name('en'), 'he': place.primary_name('he')}
        return contents

    def _saveable_attrs(self):
        d = {k: getattr(self, k) for k in self._saveable_attr_keys() if hasattr(self, k)}
        if getattr(self, "nodes", None):
            d["schema"] = self.nodes.serialize()
        if getattr(self, "struct_objs", None):
            d["alt_structs"] = {}
            for name, obj in list(self.struct_objs.items()):
                c = obj.serialize()
                del c["titles"]
                d["alt_structs"][name] = c
        return d

    def versions_are_sparse(self):
        """
            This function is just a convenience function!
            It's left as legacy code to estimate completion on a sparse text.
            Do not write code that depends on it.
        """
        return getattr(self, 'base_text_mapping', None) == 'many_to_one'

    def is_dependant_text(self):
        return getattr(self, 'dependence', None) is not None

    def all_titles(self, lang):
        if self.nodes:
            return self.nodes.all_tree_titles(lang)
        else:
            return None

    '''         Alternate Title Structures          '''
    def set_alt_structure(self, name, struct_obj):
        """
        :param name: String
        :param struct_obj:  :py.class:`TitledTreeNode`
        :return:
        """
        self.struct_objs[name] = struct_obj
        self.struct_objs[name].title_group = self.nodes.title_group

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
        for key, tree in list(self.get_alt_structures().items()):
            title_dict.update(tree.title_dict(lang))
        return title_dict

    def alt_titles_regex(self, lang):
        full_title_list = list(self.alt_titles_dict(lang).keys())
        alt_titles = list(map(re.escape, full_title_list))
        reg = '(?P<title>' + '|'.join(sorted(alt_titles, key=len, reverse=True)) + r')($|[:., ]+)'
        try:
            reg = re.compile(reg, max_mem=384 * 1024 * 1024)
        except TypeError:
            reg = re.compile(reg)

        return reg

    def get_alt_struct_node(self, title, lang=None):
        if not lang:
            lang = "he" if has_tibetan(title) else "en"
        return self.alt_titles_dict(lang).get(title)

    def get_alt_struct_roots(self):
        """
        Return list of the highest alt struct nodes that have real content. Currently, the highest level alt struct node
        has no useful information.
        @return:
        """
        return reduce(lambda a, b: a + b.children, self.get_alt_structures().values(), [])

    def get_alt_struct_leaves(self):

        def alt_struct_nodes_helper(node, nodes):
            if node.is_leaf():
                nodes.append(node)
            else:
                for child in node.children:
                    alt_struct_nodes_helper(child, nodes)

        nodes = []
        for node in self.get_alt_struct_roots():
            alt_struct_nodes_helper(node, nodes)
        return nodes

    def get_trimmed_alt_structs_for_ref(self, oref) -> dict:
        """
        this function takes the index's alt_structs and reduce it to the relevant ref
        """
        # Set up empty Array that mirrors text structure
        alts_ja = JaggedArray()
        for key, struct in self.get_alt_structures().items():
            # Assuming these are in order, continue if it is before ours, break if we see one after
            for n in struct.get_leaf_nodes():
                wholeRef = Ref(n.wholeRef).default_child_ref().as_ranged_segment_ref()
                if wholeRef.ending_ref().precedes(oref):
                    continue
                if wholeRef.starting_ref().follows(oref):
                    break

                # It's in our territory
                wholeRefStart = wholeRef.starting_ref()
                if oref.contains(wholeRefStart) and not wholeRefStart.contains(oref):
                    indxs = [k - 1 for k in wholeRefStart.in_terms_of(oref)]
                    val = {"en": [], "he": []}
                    try:
                        val = alts_ja.get_element(indxs) or val
                    except IndexError:
                        pass
                    val["en"] += [n.primary_title("en")]
                    val["he"] += [n.primary_title("he")]
                    val["whole"] = True
                    alts_ja.set_element(indxs, val)

                if getattr(n, "refs", None):
                    for i, r in enumerate(n.refs):
                        # hack to skip Rishon, skip empty refs
                        if i == 0 or not r:
                            continue
                        subRef = Ref(r)
                        subRefStart = subRef.starting_ref()
                        if oref.contains(subRefStart) and not subRefStart.contains(oref):
                            indxs = [k - 1 for k in subRefStart.in_terms_of(oref)]
                            val = {"en": [], "he": []}
                            try:
                                val = alts_ja.get_element(indxs) or val
                            except IndexError:
                                pass
                            val["en"] += [n.sectionString([i + 1], "en", title=False)]
                            val["he"] += [n.sectionString([i + 1], "he", title=False)]
                            alts_ja.set_element(indxs, val)
                        elif subRefStart.follows(oref):
                            break

        return alts_ja.array()

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
        return self._get_time_period("compDate", margin_field="hasErrorMargin")

    def publication_time_period(self):
        return self._get_time_period("pubDate")

    def best_time_period(self):
        """
        :return: TimePeriod: First tries to return `compDate`.
        If no compDate or compDate is an empty list, _get_time_period returns None and it then looks at author info
        """
        compDatePeriod = self._get_time_period('compDate', margin_field="hasErrorMargin")
        if compDatePeriod:
            return compDatePeriod
        else:
            author = self.author_objects()[0] if len(self.author_objects()) > 0 else None
            tp = author and author.most_accurate_time_period()
            return tp

    def _get_time_period(self, date_field, margin_field=""):
        """
        Assumes that value of `date_field` ('pubDate' or 'compDate') is a list of integers.
        """
        from . import timeperiod
        years = getattr(self, date_field, [])
        if years is None or len(years) == 0:
            return None
        try:
            error_margin = getattr(self, margin_field, False) if margin_field else False
        except ValueError:
            error_margin = False
        startIsApprox = endIsApprox = error_margin
        if len(years) > 1:
            start, end = years
        else:
            start = end = years[0]
        return timeperiod.TimePeriod({
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
                raise InputError("Please provide category for Index record: {}.".format(d.get("title")))

            # Data is being loaded from dict in old format, rewrite to new format
            # Assumption is that d has a complete title collection
            if "schema" not in d:
                node = getattr(self, "nodes", None)
                if node:
                    node._init_title_defaults()
                else:
                    node = JaggedArrayNode()

                node.key = d.get("title")

                if node.is_flat():
                    sn = d.pop("sectionNames", None)
                    if sn:
                        node.sectionNames = sn
                        node.depth = len(node.sectionNames)
                    else:
                        raise InputError("Please specify section names for Index record.")

                    if d["categories"][0] == "Talmud":
                        node.addressTypes = ["Talmud", "Integer"]
                        if d["categories"][1] == "Bavli" and d.get("heTitle") and not self.is_dependant_text():
                            node.checkFirst = {
                                "he": "משנה" + " " + d.get("heTitle"),
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
                        lang = "he" if has_tibetan(t) else "en"
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


    @staticmethod
    def get_title_quotations_variants(title):
        """
        If there is a quotation, fancy quotation, or gershayim in title, return two titles also with quotations.
        For example, if title is 'S"A', return a list of 'S”A' and
        'S״A'
        :param title: str
        :return: list
        """
        titles = []
        quotes = ['"', '״', '”']
        found_quotes = [quote for quote in quotes if quote in title]
        for found_quote_char in found_quotes:
            titles += [title.replace(found_quote_char, quote_char) for quote_char in quotes if quote_char != found_quote_char]
        return titles

    def normalize_titles_with_quotations(self):
        # for all Index and node hebrew titles, this function does the following:
        # 1. any title that has regular quotes, gershayim, or fancy quotes will now have two corresponding
        # titles where the characters are exactly the same except for the type of quote
        # 2. all primary titles will not have gershayim or fancy quotes, but only have regular quotes or none at all.
        # 3. all titles have either gershayim or fancy quotes or regular quotes or none at all,
        # so that no title can have two different types of quotes.
        primary_title = self.get_title('he').replace('״', '"').replace('”', '"')
        self.nodes.add_title(primary_title, 'he', True, True)
        index_titles = [primary_title]
        for title in self.schema["titles"]:
            if title["lang"] == "he" and title.get("primary", False) == False:
                index_titles.append(title["text"])

        for title in index_titles:
            title = title.replace('״', '"').replace('”', '"')
            new_titles = [title] + self.get_title_quotations_variants(title)
            for new_title in new_titles:
                if new_title not in index_titles:
                    self.nodes.add_title(new_title, 'he')

        for node in self.nodes.children:
            if getattr(node, "default", False) == False and getattr(node, "sharedTitle", "") == "":
                primary_title = node.get_primary_title('he')
                primary_title = primary_title.replace('״', '"').replace('”', '"')
                node.add_title(primary_title, 'he', True, True)
                node_titles = node.get_titles('he')
                for node_title in node_titles:
                    node_title = node_title.replace('״', '"').replace('”', '"')
                    new_titles = [node_title] + self.get_title_quotations_variants(node_title)
                    for new_title in new_titles:
                        if new_title not in node_titles:
                            node.add_title(new_title, 'he')

    def _normalize(self):
        self.title = self.title.strip()
        self.title = self.title[0].upper() + self.title[1:]

        if getattr(self, "is_cited", False):
            self.normalize_titles_with_quotations()

        if isinstance(getattr(self, "authors", None), str):
            self.authors = [self.authors]

        if not self.is_new():
            for t in [self.title, self.nodes.primary_title("en"), self.nodes.key]:  # This sets a precedence order
                if t != self.pkeys_orig_values["title"]:  # One title changed, update all of them.
                    self.title = t
                    self.nodes.key = t
                    self.nodes.add_title(t, "en", True, True)
                    break
            self._update_alt_structs_on_title_change()

        """
        Make sure these fields do not appear:
        "titleVariants",      # required for old style
        "sectionNames",       # required for old style simple texts, sometimes erroneously present for commnetary
        "heTitle",            # optional for old style
        "heTitleVariants",    # optional for old style
        "maps",               # deprecated
        "length",             # optional for old style
        "lengths",            # optional for old style
        "transliteratedTitle",# optional for old style
        """
        deprecated_attrs = ["titleVariants","sectionNames","heTitle","heTitleVariants","maps","length","lengths", "transliteratedTitle"]
        for attr in deprecated_attrs:
            if getattr(self, attr, None):
                delattr(self, attr)

    def _update_alt_structs_on_title_change(self):
        old_title = self.pkeys_orig_values["title"]
        new_title = self.nodes.primary_title("en")
        def change_alt_node_refs(node):
            if 'wholeRef' in node:
                node['wholeRef'] = node['wholeRef'].replace(old_title, new_title)
            if 'refs' in node:
                node['refs'] = [r.replace(old_title, new_title) for r in node['refs']]
            if 'nodes' in node:
                for n in node['nodes']:
                    change_alt_node_refs(n)
        alts = getattr(self, 'alt_structs', None)
        if alts and old_title != new_title:
            for alt in alts.values():
                change_alt_node_refs(alt)
            self._set_struct_objs()

    def _validate(self):
        assert super(Index, self)._validate()

        # Keys that should be non empty lists
        non_empty = ["categories"]

        for key in non_empty:
            if not isinstance(getattr(self, key, None), list) or len(getattr(self, key, [])) == 0:
                raise InputError("{} field must be a non empty list of strings.".format(key))

        #allow only ASCII in text titles
        if not self.title.isascii():
            raise InputError("Text title may contain only simple English characters.")

        # Disallow special characters in text titles
        if any((c in ':.-\\/') for c in self.title):
            raise InputError("Text title may not contain periods, hyphens or slashes.")

        # Disallow special character in categories
        for cat in self.categories:
            if any((c in '.-') for c in cat):
                raise InputError("Categories may not contain periods or hyphens.")

        for btitle in getattr(self, "base_text_titles", []):
            try:
                library.get_index(btitle)
            except BookNameError:
                raise InputError("Base Text Titles must point to existing texts in the system.")

        from sefaria.model import Category
        if not Category().load({"path": self.categories}):
            raise InputError("You must create category {} before adding texts to it.".format("/".join(self.categories)))

        for date_key in ['compDate', 'pubDate']:
            if hasattr(self, date_key):
                val = getattr(self, date_key)
                if not isinstance(val, list) or not all([isinstance(x, int) for x in val]):
                    raise InputError(f"Optional attribute '{date_key}' must be list of integers.")

        '''
        for cat in self.categories:
            if not hebrew_term(cat):
                raise InputError("You must add a hebrew translation Term for any new Category title: {}.".format(cat))
        '''

        if getattr(self, "collective_title", None) and not hebrew_term(getattr(self, "collective_title", None)):
            raise InputError("You must add a hebrew translation Term for any new Collective Title: {}.".format(self.collective_title))

        #complex style records- all records should now conform to this
        if self.nodes:
            # Make sure that all primary titles match
            if self.title != self.nodes.primary_title("en") or self.title != self.nodes.key:
                raise InputError("Primary titles mismatched in Index Record: {}, {}, {}"
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
                        raise InputError('A text called "{}" already exists.'.format(title))

            self.nodes.validate()
            for key, tree in list(self.get_alt_structures().items()):
                tree.validate()

        else:  # old style commentator record are no longer supported
            raise InputError('All new Index records must have a valid schema.')

        if getattr(self, "authors", None):
            from .topic import Topic, AuthorTopic
            if not isinstance(self.authors, list):
                raise InputError(f'{self.title} authors must be a list.')
            for author_slug in self.authors:
                topic = Topic.init(author_slug)
                assert isinstance(topic, AuthorTopic), f"Author with slug {author_slug} does not match any valid AuthorTopic instance. Make sure the slug exists in the topics collection and has the subclass 'author'."

        return True

    def get_toc_index_order(self):
        order = getattr(self, 'order', None)
        if order:
            return order[0]
        return None

    def get_base_text_order(self):
        if getattr(self, 'base_text_titles', None):
            base_orders = [a for a in filter(None, [library.get_index(x).get_toc_index_order() for x in self.base_text_titles])]
            if len(base_orders) > 0:
                return min(base_orders) or 10000
        return 10000

    def slim_toc_contents(self):
        toc_contents_dict = {
            "title": self.get_title(),
            "heTitle": self.get_title("he"),
        }
        order = self.get_toc_index_order()
        if order:
            toc_contents_dict["order"] = order

        base_text_order = self.get_base_text_order()
        if base_text_order:
            toc_contents_dict["base_text_order"] = base_text_order

        return toc_contents_dict

    def toc_contents(self, include_first_section=False, include_flags=False, include_base_texts=False):
        """Returns to a dictionary used to represent this text in the library wide Table of Contents"""
        toc_contents_dict = {
            "title": self.get_title(),
            "heTitle": self.get_title("he"),
            "categories": self.categories[:],
            "enShortDesc": getattr(self, "enShortDesc", ""),
            "heShortDesc": getattr(self, "heShortDesc", ""),
            "primary_category" : self.get_primary_category(),
        }

        if getattr(self, "dependence", False):
            toc_contents_dict["dependence"] = self.dependence

        if len(getattr(self, "corpora", [])) > 0:
            # first elem in corpora is the main corpus
            toc_contents_dict["corpus"] = self.corpora[0]

        if include_first_section:
            firstSection = Ref(self.title).first_available_section_ref()
            toc_contents_dict["firstSection"] = firstSection.normal() if firstSection else None

        if include_flags:
            vstate = self.versionState()
            toc_contents_dict["enComplete"] = bool(vstate.get_flag("enComplete"))
            toc_contents_dict["heComplete"] = bool(vstate.get_flag("heComplete"))

        order = self.get_toc_index_order()
        if order:
            toc_contents_dict["order"] = order

        if hasattr(self, "collective_title"):
            toc_contents_dict["commentator"] = self.collective_title # todo: deprecate Only used in s1 js code
            toc_contents_dict["heCommentator"] = hebrew_term(self.collective_title) # todo: deprecate Only used in s1 js code
            toc_contents_dict["collectiveTitle"] = self.collective_title
            toc_contents_dict["heCollectiveTitle"] = hebrew_term(self.collective_title)

        if include_base_texts and hasattr(self, 'base_text_titles'):
            toc_contents_dict["base_text_titles"] = self.base_text_titles
            toc_contents_dict["base_text_order"] = self.get_base_text_order()
            if include_first_section:
                toc_contents_dict["refs_to_base_texts"] = self.get_base_texts_and_first_refs()
            if "collectiveTitle" not in toc_contents_dict:
                toc_contents_dict["collectiveTitle"] = self.title
                toc_contents_dict["heCollectiveTitle"] = self.get_title("he")
        elif hasattr(self, 'base_text_titles'):
            toc_contents_dict["base_text_order"] = self.get_base_text_order()

        if include_base_texts and hasattr(self, 'base_text_mapping'):
            toc_contents_dict["base_text_mapping"] = self.base_text_mapping

        if hasattr(self, 'hidden'):
            toc_contents_dict["hidden"] = self.hidden

        return toc_contents_dict

    #todo: the next 3 functions seem to come at an unacceptable performance cost. Need to review performance or when they are called.
    def get_base_texts_and_first_refs(self):
        return {btitle: self.get_first_ref_in_base_text(btitle) for btitle in self.base_text_titles}

    def get_first_ref_in_base_text(self, base_text_title):
        from sefaria.model.link import Link
        orig_ref = Ref(self.title)
        base_text_ref = Ref(base_text_title)
        first_link = Link().load(
            {'$and': [orig_ref.ref_regex_query(), base_text_ref.ref_regex_query()], 'is_first_comment': True}
        )
        if first_link:
            if orig_ref.contains(Ref(first_link.refs[0])):
                return Ref(first_link.refs[0]).section_ref().normal()
            else:
                return Ref(first_link.refs[1]).section_ref().normal()
        else:
            firstSection = orig_ref.first_available_section_ref()
            return firstSection.section_ref().normal() if firstSection else None

    def find_string(self, regex_str, cleaner=lambda x: x, strict=True, lang='he', vtitle=None):
        """
        See TextChunk.find_string
        :param regex_str:
        :param cleaner:
        :param strict:
        :param lang:
        :param vtitle:
        :return:
        """
        return self.nodes.find_string(regex_str, cleaner=cleaner, strict=strict, lang=lang, vtitle=vtitle)

    def text_index_map(self, tokenizer=lambda x: re.split(r'\s+', x), strict=True, lang='he', vtitle=None):
        """
        See TextChunk.text_index_map
        :param tokenizer:
        :param strict:
        :param lang:
        :return:
        """
        return self.nodes.text_index_map(tokenizer=tokenizer, strict=strict, lang=lang, vtitle=vtitle)

    def get_primary_category(self):
        if self.is_dependant_text():
            return self.dependence.capitalize()
        else:
            return self.categories[0]

    def get_primary_corpus(self):
        """
        Primary corpus used for setting version preference by
        """
        corpora = getattr(self, "corpora", [])
        if len(corpora) > 0:
            return corpora[0]

    def referenceable_children(self):
        """
        parallel to TreeNodes's `children`. Allows full traversal of an index's nodes

        @return:
        """
        default_struct_children = self.nodes.children
        if len(default_struct_children) == 0:
            # simple text. Use root as only child.
            default_struct_children = [self.nodes]
        return default_struct_children + self.get_alt_struct_roots()

    def get_referenceable_alone_nodes(self):
        """
        Return list of nodes on Index where each node has at least one match template with scope "alone"
        @return: List of TitledTreeNodes
        """
        alone_nodes = []
        for child in self.referenceable_children():
            if child.has_scope_alone_match_template():
                alone_nodes += [child]
            alone_nodes += child.get_referenceable_alone_nodes()
        return alone_nodes


class IndexSet(abst.AbstractMongoSet):
    """
    A set of :class:`Index` objects.
    """
    recordClass = Index

    # Index changes behavior of load_from_dict, so this circumvents that changed behavior to call load_from_dict on the abstract superclass
    def update(self, attrs):
        for rec in self:
            rec.update_from_dict(attrs).save()


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

    def sub_content(self, key_list=None, indx_list=None, value=None):
        """
        Gets or sets values deep within the content of this version.
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
        node = reduce(lambda d, k: d[k], key_list, self.get_content())
        if indx_list:  # accessing/setting index with jagged array node
            if value is not None:
                # NOTE: JaggedArrays modify their store in place, so this change will affect `self`
                JaggedArray(node).set_element(indx_list, value, '')
            return reduce(lambda a, i: a[i], indx_list, node)
        else: # accessing/setting index in schema nodes
            if value is not None:
                if isinstance(value, list):  # we assume if value is a list, you want to modify the entire contents of the jagged array node
                    node[:] = value
                else:  # this change is to a schema node that's not a leaf. need to explicitly set contents on the parent so this change affects `self` 
                    if len(key_list) == 0:
                        setattr(self, self.content_attr, value)
                    elif len(key_list) == 1:
                        self.get_content()[key_list[0]] = value
                    else:
                        node_parent = reduce(lambda d, k: d[k], key_list[:-1], self.get_content())
                        node_parent[key_list[-1]] = value
            return node


class AbstractTextRecord(object):
    """
    """
    text_attr = "chapter"
    ALLOWED_TAGS    = constants.ALLOWED_TAGS_IN_ABSTRACT_TEXT_RECORD
    ALLOWED_ATTRS   = constants.ALLOWED_ATTRS_IN_ABSTRACT_TEXT_RECORD

    def word_count(self):
        """ Returns the number of words in this text """
        return self.ja(remove_html=True).word_count()

    def char_count(self):
        """ Returns the number of characters in this text """
        return self.ja(remove_html=True).char_count()

    def verse_count(self):
        """ Returns the number of verses in this text """
        return self.ja().verse_count()

    def ja(self, remove_html=False): #don't cache locally unless change is handled.  Pontential to cache on JA class level
        base_text = getattr(self, self.text_attr, None)
        if base_text and remove_html:
            base_text = AbstractTextRecord.remove_html(base_text)
        return JaggedTextArray(base_text)

    def get_top_level_jas(self) -> tuple:
        """
        Returns tuple with two items 
            1) ja_list: list of highest level JaggedArrays
            2) parent_key_list: list of tuples (parent, ja_key) where parent is the SchemaNode parent of the corresponding ja in ja_list and ja_key is the key of that ja in parent
        parent_key_list is helpful if you need to update each jagged array
        """
        return self._get_top_level_jas_helper(getattr(self, self.text_attr, None))

    def get_node_by_key_list(self, key_list: list) -> tuple:
        """
        Given return node at self.text_attr[addr1][addr2]...[addr_n] where addr_i in address_list
        There doesn't seem to be a nice way to do this in Python
        Returns tuple of three items
            1) node at key_list
            2) parent node
            3) key of node in parent node
        Returns (None, None, None) if address_list has a non-existing key
        """
        curr_node = getattr(self, self.text_attr, None)
        parent, node_key = None, None
        for key in key_list:
            parent = curr_node
            node_key = key
            curr_node = curr_node.get(key)
            if curr_node is None:
                return None, None, None
        return curr_node, parent, node_key
    
    def _get_top_level_jas_helper(self, item: Union[dict, list], parent=None, item_key=None) -> tuple:
        """
        Helper function for get_top_level_jas to help with recursion
        """
        jas = []
        parent_key_list = []
        if isinstance(item, dict):
            for key, child in item.items():
                temp_jas, temp_parent_key_list = self._get_top_level_jas_helper(child, item, key)
                jas += temp_jas
                parent_key_list += temp_parent_key_list
        elif isinstance(item, list):
            jas += [item]
            parent_key_list = [(parent, item_key)]
        return jas, parent_key_list

    def _trim_ending_whitespace(self):
        """
        Trims blank segments from end of every section
        :return:
        """
        jas, parent_key_list = self.get_top_level_jas()
        for ja, (parent_node, ja_key) in zip(jas, parent_key_list):
            new_ja = JaggedTextArray(ja).trim_ending_whitespace().array()
            if parent_node is None:
                setattr(self, self.text_attr, new_ja)
            else:
                parent_node[ja_key] = new_ja

    def as_string(self):
        content = getattr(self, self.text_attr, None)
        if isinstance(content, str):
            return content
        elif isinstance(content, list):
            return self.ja().flatten_to_string()
        else:
            return ""

    def as_sized_string(self, min_char=240, max_char=360):
        """
        Return a starting substring of this text.
        If the entire text is less than min_char, return the entire text.
        If a segment boundary occurs between min_char and max_char, split there.
        Otherwise, attempt to break on a period, semicolon, or comma between min_char and max_char.
        Otherwise, break on a space between min_char and max_char.
        :param min_char:
        :param max_char:
        :return:
        """
        balance = lambda doc: str(BeautifulSoup(doc, "html.parser"))

        as_array = self.ja().flatten_to_array()

        previous_state = None
        accumulator = ''

        for segment in as_array:
            segment = self.strip_itags(segment)
            joiner = " " if previous_state is not None else ""
            previous_state = accumulator
            accumulator += joiner + segment

            cur_len = len(accumulator)
            prev_len = len(previous_state)
            # If a segment boundary occurs between min_char and max_char, return.
            # Get the longest instance where that's true.
            if cur_len > max_char >= prev_len >= min_char:
                if previous_state[-1] == ".":
                    return previous_state[:-1] + "…"
                else:
                    return previous_state + "…"

            # We're too big, and the previous chunk was too small.  Break on a signal character.
            if cur_len > max_char and min_char > prev_len:

                # get target lengths
                at_least = min_char - prev_len
                at_most = max_char - prev_len
                return balance(previous_state + joiner + truncate_string(segment, at_least, at_most))

        # We've reached the end, it's not longer than max_char, and it's what we've got.
        return accumulator


    @classmethod
    def sanitize_text(cls, t):
        if isinstance(t, list):
            for i, v in enumerate(t):
                t[i] = AbstractTextRecord.sanitize_text(v)
        elif isinstance(t, str):
            t = bleach.clean(t, tags=cls.ALLOWED_TAGS, attributes=cls.ALLOWED_ATTRS)
        else:
            return False
        return t

    @staticmethod
    def remove_html(t):
        if isinstance(t, list):
            for i, v in enumerate(t):
                if isinstance(v, str):
                    t[i] = re.sub('<[^>]+>', " ", v)
                else:
                    t[i] = AbstractTextRecord.remove_html(v)
        elif isinstance(t, str):
            t = re.sub('<[^>]+>', " ", t)
        else:
            return False
        return t

    @staticmethod
    def remove_html_and_make_presentable(t):
        if isinstance(t, list):
            for i, v in enumerate(t):
                if isinstance(v, str):
                    t[i] = re.sub(r'<[^>]+>', " ", v)
                    t[i] = re.sub(r'[ ]{2,}', " ", t[i])
                    t[i] = re.sub(r'(\S) ([.?!,])', r"\1\2", t[i])  # Remove spaces preceding punctuation
                    t[i] = t[i].strip()
                else:
                    t[i] = AbstractTextRecord.remove_html_and_make_presentable(v)
        elif isinstance(t, str):
            t = re.sub(r'<[^>]+>', " ", t)
            t = re.sub(r'[ ]{2,}', " ", t)
            t = re.sub(r'(\S) ([.?!,])', r"\1\2", t)  # Remove spaces preceding punctuation
            t = t.strip()
        else:
            return False
        return t

    @staticmethod
    def find_all_itags(s, only_footnotes=False):
        soup = BeautifulSoup("<root>{}</root>".format(s), 'lxml')
        itag_list = soup.find_all(AbstractTextRecord._find_itags)
        if only_footnotes:
            itag_list = list(filter(lambda itag: AbstractTextRecord._itag_is_footnote(itag), itag_list))
        return soup, itag_list

    @staticmethod
    def _itag_is_footnote(tag):
        return tag.name == "sup" and isinstance(tag.next_sibling, Tag) and tag.next_sibling.name == "i" and 'footnote' in tag.next_sibling.get('class', '')

    @staticmethod
    def _find_itags(tag):
        if isinstance(tag, Tag):
            is_inline_commentator = tag.name == "i" and len(tag.get('data-commentator', '')) > 0
            is_page_marker = tag.name == "i" and len(tag.get('data-overlay','')) > 0
            is_tanakh_end_sup = tag.name == "sup" and 'endFootnote' in tag.get('class', [])  # footnotes like this occur in JPS english
            return AbstractTextRecord._itag_is_footnote(tag) or is_inline_commentator or is_page_marker or is_tanakh_end_sup
        return False

    @staticmethod
    def strip_imgs(s, sections=None):
        soup = BeautifulSoup("<root>{}</root>".format(s), 'lxml')
        imgs = soup.find_all('img')
        for img in imgs:
            img.decompose()
        return soup.root.encode_contents().decode()  # remove divs added

    @staticmethod
    def strip_itags(s, sections=None):
        soup, itag_list = AbstractTextRecord.find_all_itags(s)
        for itag in itag_list:
            try:
                if AbstractTextRecord._itag_is_footnote(itag):
                    itag.next_sibling.decompose()  # it's a footnote
            except AttributeError:
                pass  # it's an inline commentator
            itag.decompose()
        return soup.root.encode_contents().decode()  # remove divs added

    def _get_text_after_modifications(self, text_modification_funcs, start_sections=None):
        """
        :param text_modification_funcs: list(func). functions to apply in order on each segment in text chunk
        :return ja: Return jagged array after applying text_modification_funcs iteratively on each segment
        """
        if len(text_modification_funcs) == 0:
            return getattr(self, self.text_attr)

        def modifier(string, sections):
            for func in text_modification_funcs:
                string = func(string, sections)
            return string
        start_sections = None if start_sections is None else [s-1 for s in start_sections]  # zero-indexed for ja
        return self.ja().modify_by_function(modifier, start_sections)

    # Currently assumes that text is JA
    def _sanitize(self):
        setattr(self, self.text_attr,
                self.sanitize_text(getattr(self, self.text_attr, None))
        )

    def has_manually_wrapped_refs(self):
        return True


class Version(AbstractTextRecord, abst.AbstractMongoRecord, AbstractSchemaContent):
    """
    A version of a text.
    NOTE: AbstractTextRecord is inherited before AbstractMongoRecord in order to overwrite ALLOWED_TAGS
    Relates to a complete single record from the texts collection.

    A new version is created with a dict of correlating information inside. Two example fields are below:
    new_version = Version({"versionTitle": "ABCD",
                            "versionSource": "EFGHI"
                            ......})

    An existing version is queried for with a slightly different syntax:
    existing_version = Version().load({Mongo-query-for-that-specific-version})

    For basic operations such as loading, saving, and updating existing versions, see abst.AbstractMongoRecord
    in abstract.py - the parent class for the Version class.
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

    """
    Regarding the strange naming of the parameters versionTitleInHebrew and versionNotesInHebrew: These names were
    chosen to avoid naming conflicts and ambiguity on the TextAPI. See TextFamily for more details.
    """
    optional_attrs = [
        "status",
        "priority",
        "license",
        "versionNotes",
        "formatAsPoetry",
        "digitizedBySefaria",
        "method",
        "heversionSource",  # bad data?
        "versionUrl",  # bad data?
        "versionTitleInHebrew",  # stores the Hebrew translation of the versionTitle
        "versionNotesInHebrew",  # stores VersionNotes in Hebrew
        "shortVersionTitle",
        "shortVersionTitleInHebrew",
        "extendedNotes",
        "extendedNotesHebrew",
        "purchaseInformationImage",
        "purchaseInformationURL",
        "hasManuallyWrappedRefs",  # true for texts where refs were manually wrapped in a-tags. no need to run linker at run-time.
        "actualLanguage",  # ISO language code
        'languageFamilyName',  # full name of the language, but without specificity (for Judeo Arabic actualLanguage=jrb, languageFamilyName=arabic
        "isBaseText",  # should be deprecated (needs some changes on client side)
        'isSource',  # bool, True if this version is not a translation
        'isPrimary', # bool, True if we see it as a primary version (usually equals to isSource, but Hebrew Kuzarif or example is primary but not source)
        'direction',  # 'rtl' or 'ltr'
    ]

    def __str__(self):
        return "Version: {} <{}>".format(self.title, self.versionTitle)

    def __repr__(self):  # Wanted to use orig_tref, but repr can not include Unicode
        return "{}().load({{'title': '{}', 'versionTitle': '{}'}})".format(self.__class__.__name__, self.title, self.versionTitle)

    def _validate(self):
        assert super(Version, self)._validate()
        """
        Old style database text record have a field called 'chapter'
        Version records in the wild have a field called 'text', and not always a field called 'chapter'
        """
        languageCodeRe = re.search(r"\[([a-z]{2})\]$", getattr(self, "versionTitle", None))
        if languageCodeRe and languageCodeRe.group(1) != getattr(self,"actualLanguage",None):
            self.actualLanguage = languageCodeRe.group(1)
        if not getattr(self, 'languageFamilyName', None):
            try:
                self.languageFamilyName = constants.LANGUAGE_CODES[self.actualLanguage]
            except KeyError:
                self.languageFamilyName = constants.LANGUAGE_CODES[self.language]
        if getattr(self,"language", None) not in ["en", "he"]:
            raise InputError("Version language must be either 'en' or 'he'")
        index = self.get_index()
        if index is None:
            raise InputError("Versions cannot be created for non existing Index records")
        assert self._check_node_offsets(self.chapter, index.nodes), 'there are more sections than index_offsets_by_depth'

        return True

    def _check_arrays_lengths(self, array1, array2):
        if len(array1) < len(array2):
            return False
        if isinstance(array1[0], list):
            for subarray1, subarray2 in zip(array1, array2):
                if not self._check_arrays_lengths(subarray1, subarray2):
                    return False
        return True

    def _check_node_offsets(self, content, node):
        if isinstance(content, list) and hasattr(node, 'index_offsets_by_depth'):
            for depth, nums in node.index_offsets_by_depth.items():
                if int(depth) > 1 and not self._check_arrays_lengths(nums, content):
                    return False
                elif depth == '1':
                    if not isinstance(nums, int):
                        return False
            return True
        elif isinstance(content, dict):
            for k, v in content.items():
                if not self._check_node_offsets(v, node.get_child_by_key(k)):
                    return False
        return True

    def _normalize(self):
        # add actualLanguage -- TODO: migration to get rid of bracket notation completely
        actualLanguage = getattr(self, "actualLanguage", None) 
        versionTitle = getattr(self, "versionTitle", None) 
        if not actualLanguage and versionTitle:
            languageCode = re.search(r"\[([a-z]{2})\]$", versionTitle)
            if languageCode and languageCode.group(1):
                self.actualLanguage = languageCode.group(1)
            else:
                self.actualLanguage = self.language

        if not getattr(self, 'direction', None):
            self.direction = 'rtl' if self.language == 'he' else 'ltr'

        if getattr(self, "priority", None):
            try:
                self.priority = float(self.priority)
            except ValueError as e:
                self.priority = None
        self._trim_ending_whitespace()

    def _sanitize(self):
        # sanitization happens on TextChunk saving
        pass

    def get_index(self):
        return library.get_index(self.title)

    def first_section_ref(self):
        """
        Returns a :class:`Ref` to the first non-empty location in this version.
        """
        index = self.get_index()
        leafnodes = index.nodes.get_leaf_nodes()
        for leaf in leafnodes:
            try:
                ja = JaggedTextArray(self.content_node(leaf))

            except AttributeError:
                assert leaf.is_virtual
                return leaf.first_child().ref()

            indx_array = ja.next_index()
            if indx_array:
                oref = Ref(_obj={
                    "index": index,
                    "book": leaf.full_title("en"),
                    "primary_category": index.get_primary_category(),
                    "index_node": leaf,
                    "sections": [i + 1 for i in indx_array],
                    "toSections": [i + 1 for i in indx_array]
                })
                if index.is_complex() or index.nodes.depth != 1:
                    # For depth 1 texts, consider the first segment as the first section
                    oref = oref.section_ref()
                return oref
        return None

    def ja(self, remove_html=False):
        # the quickest way to check if this is a complex text
        if isinstance(getattr(self, self.text_attr, None), dict):
            nodes = self.get_index().nodes.get_leaf_nodes()
            if remove_html:
                return JaggedTextArray([AbstractTextRecord.remove_html(self.content_node(node)) for node in nodes if not node.is_virtual])
            else:
                return JaggedTextArray([self.content_node(node) for node in nodes])
        else:
            return super(Version, self).ja(remove_html=remove_html)

    def is_copyrighted(self):
        return "Copyright" in getattr(self, "license", "")

    def walk_thru_contents(self, action, heTref=None, schema=None, terms_dict=None):
        """
        Walk through the contents of a version and run `action` for each segment. Only required parameter to call is `action`
        :param func action: (segment_str, tref, he_tref, version) => None

        action() is a callback function that can have any behavior you would like. It should return None.
        A common use case is to define action() to append segments to a nonlocal array, to get an entire text of a
        Version in a list. The 'magic' of walk_thru_contents is that this function will iterate through the segments
        of the given Version, and apply the action() callback to each segment.

        Here's an example:

        .. highlight:: python
        .. code-block:: python

            all_text = []

            def action(segment_str, tref, he_tref, version):
                global all_text
                all_text.append(segment_str)

            talmud_berakhot = Version().load(
                {"title": 'Berakhot', "versionTitle": 'William Davidson Edition - English'})
            if talmud_berakhot:
                talmud_berakhot.walk_thru_contents(action)

        ...

        The result will be all_text populated with all segments from Masekhet Berakhot.

        """
        args = self.__initialize_walk_thru_contents_params(schema, heTref)
        return self.__walk_thru_contents_recursive(action, *args, terms_dict=terms_dict)

    def __initialize_walk_thru_contents_params(self, schema, heTref):
        item = self.chapter
        tref = self.title
        index = None
        if schema is None:
            index = self.get_index()
            schema = index.schema
        if heTref is None:
            heTref = index.get_title('he') if index else ""  # NOTE: heTref initialization is dependent on schema initialization
        addressTypes = None
        index_offsets_by_depth = None
        section_indexes = []

        return item, tref, schema, heTref, addressTypes, index_offsets_by_depth, section_indexes

    def __walk_thru_contents_recursive(self, action, *recursive_args, terms_dict=None):
        item = recursive_args[0]

        if isinstance(item, dict):
            self.__walk_thru_node_tree(action, *recursive_args, terms_dict=terms_dict)
        elif isinstance(item, list):
            self.__walk_thru_jagged_array(action, *recursive_args)
        elif isinstance(item, str):
            self.__apply_action_to_segment(action, *recursive_args)

    def __walk_thru_node_tree(self, action, item, tref, schema, heTref, *walk_thru_contents_args, terms_dict=None):
        def get_primary_title(lang, titles):
            return [t for t in titles if t.get("primary") and t.get("lang", "") == lang][0]["text"]

        for node in schema["nodes"]:
            try:
                is_virtual_node = VirtualNode in globals()[node.get("nodeType", "")].__bases__
            except KeyError:
                is_virtual_node = False
            if node.get("default", False) or is_virtual_node:
                node_title_en = node_title_he = ""
            elif node.get("sharedTitle", False):
                titles = terms_dict[node["sharedTitle"]]["titles"] if terms_dict is not None else Term().load({"name": node["sharedTitle"]}).titles
                node_title_en = ", " + get_primary_title("en", titles)
                node_title_he = ", " + get_primary_title("he", titles)
            else:
                node_title_en = ", " + get_primary_title("en", node["titles"])
                node_title_he = ", " + get_primary_title("he", node["titles"])

            if is_virtual_node:
                curr_ref = Ref(tref)
                vnode = next(x for x in curr_ref.index_node.children if hasattr(x, 'nodeType') and x.nodeType == node.get("nodeType", "") and x.firstWord == node["firstWord"])
                for vchild in vnode.all_children():
                    vstring = " ".join(vchild.get_text())
                    vref = vchild.ref()
                    self.__walk_thru_contents_recursive(action, vstring, vref.normal(), node, vref.he_normal(), *walk_thru_contents_args)
            else:
                self.__walk_thru_contents_recursive(action, item[node["key"]], tref + node_title_en, node, heTref + node_title_he, *walk_thru_contents_args)

    def __walk_thru_jagged_array(self, action, item, tref, schema, heTref, addressTypes, index_offsets_by_depth, section_indexes):
        if schema is not None:
            if addressTypes is None:
                addressTypes = schema.get("addressTypes", None)
            if index_offsets_by_depth is None:
                index_offsets_by_depth = schema.get("index_offsets_by_depth", None)

        for section_index, ja in enumerate(item):
            try:
                offset = JaggedArrayNode.get_index_offset(section_indexes, index_offsets_by_depth)
                next_section_indexes = section_indexes + [section_index+offset]
                self.__walk_thru_contents_recursive(action, ja, tref, {}, heTref, addressTypes, index_offsets_by_depth, next_section_indexes)
            except IndexError as e:
                print(str(e))
                print("index error for addressTypes {} ref {} - vtitle {}".format(addressTypes, tref, self.versionTitle))

    def __apply_action_to_segment(self, action, segment_str, tref, schema, heTref, addressTypes, index_offsets_by_depth, section_indexes):
        segment_tref = self.__add_sections_to_tref(tref, "en", addressTypes, section_indexes)
        segment_heTref = self.__add_sections_to_tref(heTref, "he", addressTypes, section_indexes)
        action(segment_str, segment_tref, segment_heTref, self)

    @staticmethod
    def __add_sections_to_tref(tref, lang, addressTypes, section_indexes):
        for depth, section_index in enumerate(section_indexes):
            section_str = AddressType.to_str_by_address_type(addressTypes[depth], lang, section_index+1)
            tref += f"{' ' if depth == 0 else ':'}{section_str}"
        return tref


class VersionSet(abst.AbstractMongoSet):
    """
    A collection of :class:`Version` objects

    You can call a VersionSet by running something like the following:
    my_version_set = VersionSet(mongo-query-here)

    Even if it yields only a single result, the results will always be a list of the matching versions
    that came up for the given query. 
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

    def merge(self, node=None, prioritized_vtitle=None):
        """
        Returns merged result, but does not change underlying data
        :param prioritized_vtitle: optional vtitle which should have top priority, even if it generally has lower priority
        """
        for v in self:
            if not getattr(v, "versionTitle", None):
                logger.error("No version title for Version: {}".format(vars(v)))
        if node is None:
            return merge_texts([getattr(v, "chapter", []) for v in self], [getattr(v, "versionTitle", None) for v in self])
        versions = self.array()
        if prioritized_vtitle:
            vindex = next((i for (i, v) in enumerate(versions) if v.versionTitle == prioritized_vtitle), None)
            if vindex is not None:
                # move versions[vindex] to front of list
                versions.insert(0, versions.pop(vindex))
        return merge_texts([v.content_node(node) for v in versions], [getattr(v, "versionTitle", None) for v in versions])


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
        for x in range(max(list(map(len, text)))):    # Let longest text determine how many times to iterate
            translations = [_ for _ in itertools.zip_longest(*text)][x]  # transpose, and take section x
            remove_nones = lambda x: x or []
            result, source = merge_texts(list(map(remove_nones, translations)), sources)
            results.append(result)
            # NOTE - the below flattens the sources list, so downstream code can always expect
            # a one dimensional list, but in so doing the mapping of source names to segments
            # is lost for merged texts of depth > 2 (this mapping is not currenly used in general)
            result_sources += source
        return [results, result_sources]

    if depth == 1:
        text = [[x] for x in text]

    merged = itertools.zip_longest(*text)  # transpose
    text = []
    text_sources = []
    for verses in merged:
        # Look for the first non empty version (which will be the oldest, or one with highest priority)
        index, value = 0, ""
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


class TextFamilyDelegator(type):
    """
    Metaclass to delegate virtual text records
    """

    def __call__(cls, *args, **kwargs):
        if len(args) >= 1:
            oref = args[0]
        else:
            oref = kwargs.get("oref")

        if oref and oref.index_node.is_virtual:
            return VirtualTextChunk(*args, **kwargs)
        else:
            return super(TextFamilyDelegator, cls).__call__(*args, **kwargs)


class TextRange:
    """
    This class is planned to replace TextChunk, using real language rather than he/en
    For now it's used by v3 texts api
    It can be used for getting text, but not yet for saving
    The versions param is for better performance when the version(s) were already loaded from mongo
    """

    def __init__(self, oref, lang, vtitle, merge_versions=False, versions=None):
        if isinstance(oref.index_node, JaggedArrayNode) or isinstance(oref.index_node, DictionaryEntryNode): #text cannot be SchemaNode
            self.oref = oref
        elif oref.has_default_child(): #use default child:
            self.oref = oref.default_child_ref()
        else:
            raise InputError("Can not get TextRange at this level, please provide a more precise reference")
        self.lang = lang
        self.vtitle = vtitle
        self.merge_versions = merge_versions
        self._text = None
        self.sources = None
        self._set_versions(versions)

    def _set_versions(self, versions):
        if versions:
            self._validate_versions(versions)
            self._versions = versions
        else:
            condition_query = self.oref.condition_query(self.lang) if self.merge_versions else \
                {'title': self.oref.index.title, 'languageFamilyName': self.lang, 'versionTitle': self.vtitle}
            self._versions = VersionSet(condition_query, proj=self.oref.part_projection())

    def _validate_versions(self, versions):
        if not self.merge_versions and len(versions) > 1:
            raise InputError("Got many versions instead of one")
        for version in versions:
            condition = version.title == self.oref.index.title and version.languageFamilyName == self.lang
            if not self.merge_versions:
                condition = condition and version.versionTitle == self.vtitle
            if not condition:
                raise InputError(f"Given version, {version}, is not matching to title, language or versionTitle")

    def _trim_text(self, text):
        """
        part_projection trims only the upper level of the jagged array. this function trims its lower levels and get rid of 1 element arrays wrappings
        """
        #TODO can we get the specific text directly from mongo?
        text = copy.deepcopy(text)
        for s, section in enumerate(self.oref.toSections[1:], 1): #start cut from end, for cutting from the start will change the indexes
            subtext = reduce(lambda x, _: x[-1], range(s), text)
            del subtext[section:]
        for s, section in enumerate(self.oref.sections[1:], 1):
            subtext = reduce(lambda x, _: x[0], range(s), text)
            del subtext[:section-1]
        matching_sections = itertools.takewhile(lambda pair: pair[0] == pair[1], zip(self.oref.sections, self.oref.toSections))
        redundant_depth = len(list(matching_sections))
        return reduce(lambda x, _: x[0], range(redundant_depth), text)

    @property
    def text(self):
        if self._text is None:
            if self.merge_versions and len(self._versions) > 1:
                merged_text, sources = self._versions.merge(self.oref.index_node, prioritized_vtitle=self.vtitle)
                self._text = self._trim_text(merged_text)
                if len(sources) > 1:
                    self.sources = sources
            elif self.oref.index_node.is_virtual:
                self._text = self.oref.index_node.get_text()
            else:
                self._text = self._trim_text(self._versions[0].content_node(self.oref.index_node)) #todo if there is no version it will fail
        return self._text


class TextChunk(AbstractTextRecord, metaclass=TextFamilyDelegator):
    """
    A chunk of text corresponding to the provided :class:`Ref`, language, and optional version name.
    If it is possible to get a more complete text by merging multiple versions, a merged result will be returned.

    :param oref: :class:`Ref`
    :param lang: "he" or "en". "he" means all rtl languages and "en" means all ltr languages
    :param vtitle: optional. Title of the version desired.
    :param actual_lang: optional. if vtitle isn't specified, prefer to find a version with ISO language `actual_lang`. As opposed to `lang` which can only be "he" or "en", `actual_lang` can be any valid 2 letter ISO language code.
    """

    text_attr = "text"

    def __init__(self, oref, lang="en", vtitle=None, exclude_copyrighted=False, actual_lang=None, fallback_on_default_version=False):
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
        self._version_ids = None
        self._saveable = False  # Can this TextChunk be saved?

        self.lang = lang
        self.is_merged = False
        self.sources = []
        self.text = self._original_text = self.empty_text()
        self.vtitle = vtitle

        self.full_version = None
        self.versionSource = None  # handling of source is hacky

        if lang and vtitle and not fallback_on_default_version:
            self._saveable = True
            v = Version().load({"title": self._oref.index.title, "language": lang, "versionTitle": vtitle}, self._oref.part_projection())
            if exclude_copyrighted and v.is_copyrighted():
                raise InputError("Can not provision copyrighted text. {} ({}/{})".format(oref.normal(), vtitle, lang))
            if v:
                self._versions += [v]
                try:
                    self.text = self._original_text = self.trim_text(v.content_node(self._oref.index_node))
                except TypeError:
                    raise MissingKeyError(f'The version {vtitle} exists but has no key for the node {self._oref.index_node}')
        elif lang:
            if actual_lang is not None:
                self._choose_version_by_lang(oref, lang, exclude_copyrighted, actual_lang, prioritized_vtitle=vtitle)
            else:
                self._choose_version_by_lang(oref, lang, exclude_copyrighted, prioritized_vtitle=vtitle)
        else:
            raise Exception("TextChunk requires a language.")

    def _choose_version_by_lang(self, oref, lang: str, exclude_copyrighted: bool, actual_lang: str = None, prioritized_vtitle: str = None) -> None:
        if prioritized_vtitle:
            actual_lang = None
        vset = VersionSet(self._oref.condition_query(lang, actual_lang), proj=self._oref.part_projection())
        if len(vset) == 0:
            if VersionSet({"title": self._oref.index.title}).count() == 0:
                raise NoVersionFoundError("No text record found for '{}'".format(self._oref.index.title))
            return
        if len(vset) == 1:
            v = vset[0]
            if exclude_copyrighted and v.is_copyrighted():
                raise InputError("Can not provision copyrighted text. {} ({}/{})".format(oref.normal(), v.versionTitle, v.language))
            self._versions += [v]
            self.text = self.trim_text(v.content_node(self._oref.index_node))
            #todo: Should this instance, and the non-merge below, be made saveable?
        else:  # multiple versions available, merge
            if exclude_copyrighted:
                vset.remove(Version.is_copyrighted)
            merged_text, sources = vset.merge(self._oref.index_node, prioritized_vtitle=prioritized_vtitle)  #todo: For commentaries, this merges the whole chapter.  It may show up as merged, even if our part is not merged.
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

    def __str__(self):
        args = "{}, {}".format(self._oref, self.lang)
        if self.vtitle:
            args += ", {}".format(self.vtitle)
        return args

    def __repr__(self):  # Wanted to use orig_tref, but repr can not include Unicode
        args = "{}, {}".format(self._oref, self.lang)
        if self.vtitle:
            args += ", {}".format(self.vtitle)
        return "{}({})".format(self.__class__.__name__, args)

    def version_ids(self):
        if self._version_ids is None:
            if self._versions:
                vtitle_query = [{'versionTitle': v.versionTitle} for v in self._versions]
                query = {"title": self._oref.index.title, "$or": vtitle_query}
                self._version_ids = VersionSet(query).distinct("_id")
            else:
                self._version_ids = []
        return self._version_ids

    def is_empty(self):
        return self.ja().is_empty()

    def ja(self, remove_html=False):
        if remove_html:
            return JaggedTextArray(AbstractTextRecord.remove_html(self.text))
        else:
            return JaggedTextArray(self.text)

    def save(self, force_save=False):
        """
        For editing in place (i.e. self.text[3] = "Some text"), it is necessary to set force_save to True. This is
        because by editing in place, both the self.text and the self._original_text fields will get changed,
        causing the save to abort.
        :param force_save: If set to True, will force a save even if no change was detected in the text.
        :return:
        """
        assert self._saveable, "Tried to save a read-only text: {}".format(self._oref.normal())
        assert not self._oref.is_range(), "Only non-range references can be saved: {}".format(self._oref.normal())
        #may support simple ranges in the future.
        #self._oref.is_range() and self._oref.range_index() == len(self._oref.sections) - 1
        if not force_save:
            if self.text == self._original_text:
                logger.warning("Aborted save of {}. No change in text.".format(self._oref.normal()))
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
            assert self.full_version, "Failed to load Version record for {}, {}".format(self._oref.normal(), self.vtitle)
            if self.versionSource:
                self.full_version.versionSource = self.versionSource  # hack

        content = self.full_version.sub_content(self._oref.index_node.version_address())
        self._pad(content)
        self.full_version.sub_content(self._oref.index_node.version_address(), [i - 1 for i in self._oref.sections], self.text)

        self._check_available_text_pre_save()

        self.full_version.save()
        self._oref.recalibrate_next_prev_refs(len(self.text))
        self._update_link_language_availability()

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
            if pos < self._ref_depth - 2 and isinstance(parent_content[val - 1], str):
                parent_content[val - 1] = [parent_content[val - 1]]

    def _check_available_text_pre_save(self):
        """
        Stores the availability of this text in before a save is made,
        so that we can know if segments have been added or deleted overall.
        """
        self._available_text_pre_save = {}
        langs_checked = [self.lang] # swtich to ["en", "he"] when global availability checks are needed
        for lang in langs_checked:
            try:
                self._available_text_pre_save[lang] = self._oref.text(lang=lang).text
            except NoVersionFoundError:
                self._available_text_pre_save[lang] = []

    def _check_available_segments_changed_post_save(self, lang=None):
        """
        Returns a list of tuples containing a Ref and a boolean availability
        for each Ref that was either made available or unavailble for `lang`.
        If `lang` is None, returns changed availability across all langauges.
        """
        if lang:
            old_refs_available = self._text_to_ref_available(self._available_text_pre_save[self.lang])
        else:
            # Looking for availability of in all langauges, merge results of Hebrew and English
            old_en_refs_available = self._text_to_ref_available(self._available_text_pre_save["en"])
            old_he_refs_available = self._text_to_ref_available(self._available_text_pre_save["he"])
            zipped = list(itertools.zip_longest(old_en_refs_available, old_he_refs_available))
            old_refs_available = []
            for item in zipped:
                en, he = item[0], item[1]
                ref = en[0] if en else he[0]
                old_refs_available.append((ref, (en and en[1] or he and he[1])))

        new_refs_available = self._text_to_ref_available(self.text)

        changed = []
        zipped = list(itertools.zip_longest(old_refs_available, new_refs_available))
        for item in zipped:
            old_text, new_text = item[0], item[1]
            had_previously = old_text and old_text[1]
            have_now = new_text and new_text[1]

            if not had_previously and have_now:
                changed.append(new_text)
            elif had_previously and not have_now:
                # Current save is deleting a line of text, but it could still be
                # available in a different version for this language. Check again.
                if lang:
                    text_still_available = bool(old_text[0].text(lang=lang).text)
                else:
                    text_still_available = bool(old_text[0].text("en").text) or bool(old_text[0].text("he").text)
                if not text_still_available:
                    changed.append([old_text[0], False])

        return changed

    def _text_to_ref_available(self, text):
        """Converts a JaggedArray of text to flat list of (Ref, bool) if text is availble"""
        flat = JaggedArray(text).flatten_to_array_with_indices()
        refs_available = []
        for item in flat:
            d = self._oref._core_dict()
            d["sections"] = d["sections"] + item[0]
            d["toSections"] = d["sections"]
            ref = Ref(_obj=d)
            available = bool(item[1])
            refs_available += [[ref, available]]
        return refs_available

    def _update_link_language_availability(self):
        """
        Check if current save has changed the overall availabilty of text for refs
        in this language, pass refs to update revelant links if so.
        """
        changed = self._check_available_segments_changed_post_save(lang=self.lang)

        if len(changed):
            from . import link
            for change in changed:
                link.update_link_language_availabiliy(change[0], self.lang, change[1])

    def _validate(self):
        """
        validate that depth/breadth of the TextChunk.text matches depth/breadth of the Ref
        :return:
        """
        posted_depth = 0 if isinstance(self.text, str) else list_depth(self.text)
        ref_depth = self._oref.range_index() if self._oref.is_range() else self._ref_depth
        implied_depth = ref_depth + posted_depth
        if implied_depth != self._oref.index_node.depth:
            raise InputError(
                "Text Structure Mismatch. The stored depth of {} is {}, but the text posted to {} implies a depth of {}."
                .format(self._oref.index_node.full_title(), self._oref.index_node.depth, self._oref.normal(), implied_depth)
            )

        #validate that length of the array matches length of the ref
        #todo: double check for depth >= 3
        if self._oref.is_spanning():
            span_size = self._oref.span_size()
            if posted_depth == 0: #possible?
                raise InputError(
                        "Text Structure Mismatch. {} implies a length of {} sections, but the text posted is a string."
                        .format(self._oref.normal(), span_size)
                )
            elif posted_depth == 1: #possible?
                raise InputError(
                        "Text Structure Mismatch. {} implies a length of {} sections, but the text posted is a simple list."
                        .format(self._oref.normal(), span_size)
                )
            else:
                posted_length = len(self.text)
                if posted_length != span_size:
                    raise InputError(
                        "Text Structure Mismatch. {} implies a length of {} sections, but the text posted has {} elements."
                        .format(self._oref.normal(), span_size, posted_length)
                    )
                #todo: validate last section size if provided

        elif self._oref.is_range():
            range_length = self._oref.range_size()
            if posted_depth == 0:
                raise InputError(
                        "Text Structure Mismatch. {} implies a length of {}, but the text posted is a string."
                        .format(self._oref.normal(), range_length)
                )
            elif posted_depth == 1:
                posted_length = len(self.text)
                if posted_length != range_length:
                    raise InputError(
                        "Text Structure Mismatch. {} implies a length of {}, but the text posted has {} elements."
                        .format(self._oref.normal(), range_length, posted_length)
                    )
            else:  # this should never happen.  The depth check should catch it.
                raise InputError(
                    "Text Structure Mismatch. {} implies an simple array of length {}, but the text posted has depth {}."
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

    def has_manually_wrapped_refs(self):
        try:
            return getattr(self.version(), 'hasManuallyWrappedRefs', False)
        except:
            # merged version
            return False

    def nonempty_segment_refs(self):
        """

        :return: list of segment refs with content in this TextChunk
        """
        r = self._oref
        ref_list = []


        if r.is_range():
            input_refs = r.range_list()
        else:
            input_refs = [r]
        for temp_ref in input_refs:
            temp_tc = temp_ref.text(lang=self.lang, vtitle=self.vtitle)
            ja = temp_tc.ja()
            jarray = ja.mask().array()

            #TODO do I need to check if this ref exists for this version?
            if temp_ref.is_segment_level():
                if jarray: #it's an int if ref is segment_level
                    ref_list.append(temp_ref)
            elif temp_ref.is_section_level():
                ref_list += [temp_ref.subref(i + 1) for i, v in enumerate(jarray) if v]
            else: # higher than section level
                ref_list += [temp_ref.subref([j + 1 for j in ne] + [i + 1])
                             for ne in ja.non_empty_sections()
                             for i, v in enumerate(ja.subarray(ne).mask().array()) if v]

        return ref_list

    def find_string(self, regex_str, cleaner=lambda x: x, strict=True):
        """
        Regex search in TextChunk
        :param regex_str: regex string to search for
        :param cleaner: f(str)->str. function to clean a semgent before searching
        :param strict: if True, throws error if len(ind_list) != len(ref_list). o/w truncates longer array to length of shorter
        :return: list[(Ref, Match, str)] - list of tuples. each tuple has a segment ref, match object for the match, and text for the segment
        """
        ref_list = self.nonempty_segment_refs()
        text_list = [x for x in self.ja().flatten_to_array() if len(x) > 0]
        if len(text_list) != len(ref_list):
            if strict:
                raise ValueError("The number of refs doesn't match the number of starting words. len(refs)={} len(inds)={}".format(len(ref_list),len(ind_list)))
            else:
                print("Warning: The number of refs doesn't match the number of starting words. len(refs)={} len(inds)={} {}".format(len(ref_list),len(ind_list),str(self._oref)))

        matches = []
        for r, t in zip(ref_list, text_list):
            cleaned = cleaner(t)
            for m in re.finditer(regex_str,cleaned):
                matches += [(r, m, cleaned)]

        return matches

    def text_index_map(self, tokenizer=lambda x: re.split(r'\s+', x), strict=True, ret_ja=False):
        """
        Primarily used for depth-2 texts in order to get index/ref pairs relative to the full text string
         indexes are the word index in word_list

        tokenizer: f(str)->list(str) - function to split up text
        strict: if True, throws error if len(ind_list) != len(ref_list). o/w truncates longer array to length of shorter
        :param ret_ja: True if you want to return the flattened ja
        :return: (list,list) - index_list (0 based index of start word of each segment ref as compared with the text chunk ref), ref_list
        """
        #TODO there is a known error that this will fail if the text version you're using has fewer segments than the VersionState.
        ind_list = []
        ref_list = self.nonempty_segment_refs()

        total_len = 0
        text_list = self.ja().flatten_to_array()
        for i,segment in enumerate(text_list):
            if len(segment) > 0:
                ind_list.append(total_len)
                total_len += len(tokenizer(segment))

        if len(ind_list) != len(ref_list):
            if strict:
                raise ValueError("The number of refs doesn't match the number of starting words. len(refs)={} len(inds)={}".format(len(ref_list),len(ind_list)))
            else:
                print("Warning: The number of refs doesn't match the number of starting words. len(refs)={} len(inds)={} {}".format(len(ref_list),len(ind_list),str(self._oref)))
                if len(ind_list) > len(ref_list):
                    ind_list = ind_list[:len(ref_list)]
                else:
                    ref_list = ref_list[:len(ind_list)]

        if ret_ja:
            return ind_list, ref_list, total_len, text_list
        else:
            return ind_list, ref_list, total_len


class VirtualTextChunk(AbstractTextRecord):
    """
    Delegated from TextChunk
    Should only arrive here if oref.index_node is virtual.
    """

    text_attr = "text"

    def __init__(self, oref, lang="en", vtitle=None, exclude_copyrighted=False, actual_lang=None, fallback_on_default_version=False):

        self._oref = oref
        self._ref_depth = len(self._oref.sections)
        self._saveable = False

        self.lang = lang
        self.is_merged = False
        self.sources = []

        if self._oref.index_node.parent and not self._oref.index_node.parent.supports_language(self.lang):
            self.text = []
            self._versions = []
            return

        try:
            self.text = self._oref.index_node.get_text()  # <- This is where the magic happens
        except:
            self.text = []
            self._versions = []
            return

        v = Version().load({
            "title": self._oref.index_node.get_index_title(),
            "versionTitle": self._oref.index_node.get_version_title(self.lang),
            "language": self.lang
        }, {"chapter": 0})    # Currently vtitle is thrown out.  There's only one version of each lexicon.
        self._versions = [v] if v else []

    def version(self):
        return self._versions[0] if self._versions else None

    def version_ids(self):
        return [self._versions[0]._id] if self._versions else []


# This was built as a bridge between the object model and existing front end code, so has some hallmarks of that legacy.
class TextFamily(object):
    """
    A text with its translations and optionally the commentary on it.

    Can be instantiated with just the first argument.

    :param oref: :class:`Ref`.  This is the only required argument.
    :param int context: Default: 1. How many context levels up to go when getting commentary.  See :func:`Ref.context_ref`
    :param bool commentary: Default: True. Include commentary?
    :param version: optional. Name of version to use when getting text.
    :param lang: None, "en" or "he".  Default: None.  If None, include both languages.
    :param version2: optional. Additional name of version to use.
    :param bool pad: Default: True.  Pads the provided ref before processing.  See :func:`Ref.padded_ref`
    :param bool alts: Default: False.  Adds notes of where alternate structure elements begin
    """

    ## Attribute maps used for generating dict format ##
    """
    A bit of a naming conflict has arisen here. The TextFamily bundles two versions - one with English text and one
    with Hebrew text. versionTitle refers to the English title of the English version, while heVersionTitle refers to
    the English title of the Hebrew version.

    Later on we decided to translate all of our versionTitles into Hebrew. To avoid direct conflict with the text api,
    these got the names versionTitleInHebrew and versionNotesInHebrew.
    """
    text_attr_map = {
        "en": "text",
        "he": "he"
    }

    attr_map = {
        "versionTitle": {
            "en": "versionTitle",
            "he": "heVersionTitle"
        },
        "versionTitleInHebrew": {
            "en": "versionTitleInHebrew",
            "he": "heVersionTitleInHebrew",
        },
        "shortVersionTitle": {
            "en": "shortVersionTitle",
            "he": "heShortVersionTitle",
        },
        "shortVersionTitleInHebrew": {
            "en": "shortVersionTitleInHebrew",
            "he": "heShortVersionTitleInHebrew",
        },
        "versionSource": {
            "en": "versionSource",
            "he": "heVersionSource"
        },
        "status": {
            "en": "versionStatus",
            "he": "heVersionStatus"
        },
        "versionNotes": {
            "en": "versionNotes",
            "he": "heVersionNotes"
        },
        "extendedNotes": {
            "en": "extendedNotes",
            "he": "heExtendedNotes"
        },
        "extendedNotesHebrew": {
            "en": "extendedNotesHebrew",
            "he": "heExtendedNotesHebrew"
        },
        "versionNotesInHebrew": {
            "en": "versionNotesInHebrew",
            "he": "heVersionNotesInHebrew",
        },
        "digitizedBySefaria": {
            "en": "digitizedBySefaria",
            "he": "heDigitizedBySefaria",
            "default": False,
        },
        "license": {
            "en": "license",
            "he": "heLicense",
            "default": "unknown"
        },
        "formatAsPoetry": { # Setup for Fox translation. Perhaps we want in other places as well?
            "he": "formatHeAsPoetry",
            "en": "formatEnAsPoetry",
            "default": False,
        }
    }
    sourceMap = {
        "en": "sources",
        "he": "heSources"
    }

    def __init__(self, oref, context=1, commentary=True, version=None, lang=None,
                 version2=None, lang2=None, pad=True, alts=False, wrapLinks=False, stripItags=False,
                 wrapNamedEntities=False, translationLanguagePreference=None, fallbackOnDefaultVersion=False):
        """
        :param oref:
        :param context:
        :param commentary:
        :param version:
        :param lang:
        :param version2:
        :param lang2:
        :param pad:
        :param alts: Adds notes of where alt elements begin
        :param wrapLinks: whether to return the text requested with all internal citations marked up as html links <a>
        :param stripItags: whether to strip inline commentator tags and inline footnotes from text
        :param wrapNamedEntities: whether to return the text requested with all known named entities marked up as html links <a>.
        :return:
        """
        if pad:
            oref = oref.padded_ref()
        elif oref.has_default_child():
            oref = oref.default_child_ref()

        if version:
            version = version.replace("_", " ")
        if version2:
            version2 = version2.replace("_", " ")

        self.ref            = oref.normal()
        self.heRef          = oref.he_normal()
        self.isComplex      = oref.index.is_complex()
        self.text           = None
        self.he             = None
        self._nonExistantVersions = {}
        self._lang          = lang
        self._original_oref = oref
        self._context_oref  = None
        self._chunks        = {}
        self._inode         = oref.index_node
        self._alts          = []

        if not isinstance(oref.index_node, JaggedArrayNode) and not oref.index_node.is_virtual:
            raise InputError("Can not get TextFamily at this level, please provide a more precise reference")

        for i in range(0, context):
            oref = oref.context_ref()
        self._context_oref = oref

        # processes "en" and "he" TextChunks, and puts the text in self.text and self.he, respectively.
        for language, attr in list(self.text_attr_map.items()):
            tc_kwargs = dict(oref=oref, lang=language, fallback_on_default_version=fallbackOnDefaultVersion)
            if language == 'en': tc_kwargs['actual_lang'] = translationLanguagePreference
            if language in {lang, lang2}:
                curr_version = version if language == lang else version2
                c = TextChunk(vtitle=curr_version, **tc_kwargs)
                if len(c._versions) == 0:  # indicates `version` doesn't exist
                    if tc_kwargs.get('actual_lang', False) and not curr_version:
                        # actual_lang is only used if curr_version is not passed
                        tc_kwargs.pop('actual_lang', None)
                        c = TextChunk(vtitle=curr_version, **tc_kwargs)
                    elif curr_version:
                        self._nonExistantVersions[language] = curr_version
            else:
                c = TextChunk(**tc_kwargs)
            self._chunks[language] = c
            text_modification_funcs = []
            if wrapNamedEntities and len(c._versions) > 0:
                from . import RefTopicLinkSet
                named_entities = RefTopicLinkSet({"expandedRefs": {"$in": [r.normal() for r in oref.all_segment_refs()]}, "charLevelData.versionTitle": c._versions[0].versionTitle, "charLevelData.language": language})
                if len(named_entities) > 0:
                    # assumption is that refTopicLinks are all to unranged refs
                    ne_by_secs = defaultdict(list)
                    for ne in named_entities:
                        try:
                            temp_ref = Ref(ne.ref)
                        except InputError:
                            continue
                        temp_secs = tuple(s-1 for s in temp_ref.sections)
                        ne_by_secs[temp_secs] += [ne]
                    text_modification_funcs += [lambda s, secs: library.get_wrapped_named_entities_string(ne_by_secs[tuple(secs)], s)]
            if stripItags:
                text_modification_funcs += [lambda s, secs: c.strip_itags(s), lambda s, secs: ' '.join(s.split()).strip()]
            if wrapLinks and c.version_ids() and not c.has_manually_wrapped_refs():
                #only wrap links if we know there ARE links- get the version, since that's the only reliable way to get it's ObjectId
                #then count how many links came from that version. If any- do the wrapping.
                from . import Link
                query = oref.ref_regex_query()
                query.update({"inline_citation": True})  # , "source_text_oid": {"$in": c.version_ids()}
                if Link().load(query) is not None:
                    link_wrapping_reg, title_nodes = library.get_regex_and_titles_for_ref_wrapping(c.ja().flatten_to_string(), lang=language, citing_only=True)
                    text_modification_funcs += [lambda s, secs: library.get_wrapped_refs_string(s, lang=language, citing_only=True, reg=link_wrapping_reg, title_nodes=title_nodes)]
            padded_sections, _ = oref.get_padded_sections()
            setattr(self, self.text_attr_map[language], c._get_text_after_modifications(text_modification_funcs, start_sections=padded_sections))

        if oref.is_spanning():
            self.spanning = True
        #// todo: should this parameter be renamed? it gets all links, not strictly commentary...
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
            self._alts = oref.index.get_trimmed_alt_structs_for_ref(oref)
        if self._inode.is_virtual:
            self._index_offsets_by_depth = None
        else:
            self._index_offsets_by_depth = self._inode.trim_index_offsets_by_sections(oref.sections, oref.toSections)

    def contents(self):
        """
        :return dict: Returns the contents of the text family.
        """
        d = {k: getattr(self, k) for k in list(vars(self).keys()) if k[0] != "_"}

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
        d["type"]            = getattr(self._original_oref, "primary_category")
        d["primary_category"] = getattr(self._original_oref, "primary_category")
        d["book"]            = getattr(self._original_oref, "book")

        for attr in ["categories", "order"]:
            d[attr] = getattr(self._inode.index, attr, "")
        for attr in ["sections", "toSections"]:
            d[attr] = getattr(self._original_oref, attr)[:]

        if getattr(self._inode.index, 'collective_title', None):
            d["commentator"] = getattr(self._inode.index, 'collective_title', "") # todo: deprecate Only used in s1 js code
            d["heCommentator"] = hebrew_term(getattr(self._inode.index, 'collective_title', "")) # todo: deprecate Only used in s1 js code
            d["collectiveTitle"] = getattr(self._inode.index, 'collective_title', "")
            d["heCollectiveTitle"] = hebrew_term(getattr(self._inode.index, 'collective_title', ""))

        if len(self._nonExistantVersions) > 0:
            d['nonExistantVersions'] = self._nonExistantVersions

        if self._inode.index.is_dependant_text():
            #d["commentaryBook"] = getattr(self._inode.index, 'base_text_titles', "")
            #d["commentaryCategories"] = getattr(self._inode.index, 'related_categories', [])
            d["baseTexTitles"] = getattr(self._inode.index, 'base_text_titles', [])

        d["isComplex"]    = self.isComplex
        d["isDependant"] = self._inode.index.is_dependant_text()
        d["indexTitle"]   = self._inode.index.title
        d["heIndexTitle"] = self._inode.index.get_title("he")
        d["sectionRef"]   = self._original_oref.section_ref().normal()
        try:
            d["firstAvailableSectionRef"] = self._original_oref.first_available_section_ref().normal()
        except AttributeError:
            pass
        d["heSectionRef"] = self._original_oref.section_ref().he_normal()
        d["isSpanning"]   = self._original_oref.is_spanning()
        if d["isSpanning"]:
            d["spanningRefs"] = [r.normal() for r in self._original_oref.split_spanning_ref()]

        for language, attr in list(self.text_attr_map.items()):
            chunk = self._chunks.get(language)
            if chunk.is_merged:
                d[self.sourceMap[language]] = chunk.sources
            else:
                ver = chunk.version()
                if ver:
                    for key, val in list(self.attr_map.items()):
                        d[val[language]] = getattr(ver, key, val.get("default", ""))

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
            """if d["type"] == "Commentary" and self._context_oref.is_talmud() and len(d["sections"]) > 1:
                d["title"] = "%s Line %d" % (d["title"], d["sections"][1])"""

        """elif self._context_oref.is_commentary():
            dep = len(d["sections"]) if len(d["sections"]) < 2 else 2
            d["title"] = d["book"] + " " + ":".join(["%s" % s for s in d["sections"][:dep]])"""

        d["alts"] = self._alts
        d['index_offsets_by_depth'] = self._index_offsets_by_depth

        return d

"""
                    -------------------
                           Refs
                    -------------------

"""


class RefCacheType(type):
    """
    Metaclass for Ref class.
    Caches all Ref instances according to the string they were instantiated with and their normal form.
    Returns cached instance on instantiation if either instantiation string or normal form are matched.
    """

    def __init__(cls, name, parents, dct):
        super(RefCacheType, cls).__init__(name, parents, dct)
        cls.__tref_oref_map = {}
        cls.__index_tref_map = {}

    def cache_size(cls):
        return len(cls.__tref_oref_map)

    def cache_size_bytes(cls):
        from sefaria.utils.util import get_size
        return get_size(cls.__tref_oref_map)

    def cache_dump(cls):
        return [(a, repr(b)) for (a, b) in cls.__tref_oref_map.items()]

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
                return cls.__tref_oref_map[tref]
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


class Ref(object, metaclass=RefCacheType):
    """
        A Ref is a reference to a location. A location could be to a *book*, to a specific *segment* (e.g. verse or mishnah), to a *section* (e.g chapter), or to a *range*.

        Instantiated with a string representation of the reference, e.g.:

        ::

            >>> Ref("Genesis 1:3")
            >>> Ref("Rashi on Genesis 1:3")
            >>> Ref("Genesis 1:3-2:4")
            >>> Ref("Shabbat 4b")
            >>> Ref("Rashi on Shabbat 4b-5a")
    """

    __slots__ = (
        'index', 'book', 'primary_category', 'sections', 'toSections', 'index_node',
        '_lang', 'tref', 'orig_tref', '_normal', '_he_normal', '_url', '_next', '_prev',
        '_padded', '_context', '_first_spanned_ref', '_spanned_refs', '_ranged_refs',
        '_range_depth', '_range_index', 'legacy_tref',
    )

    def __init__(self, tref=None, _obj=None):
        """
        Object is generally initialized with a textual reference - ``tref``

        Internally, the _obj argument can be used to instantiate a ref with a complete dict composing the Ref data
        """
        self.index = None
        self.book = None
        self.primary_category = None  # used to be named 'type' but that was very confusing
        self.sections = []
        self.toSections = []
        self.index_node = None
        self.__init_ref_pointer_vars()

        if tref:
            self.orig_tref = tref
            self._lang = "he" if is_all_tibetan(tref) else "en"
            self.tref = self.__clean_tref(tref, self._lang)
            self.__init_tref()
            self._validate()
        elif _obj:
            for key, value in list(_obj.items()):
                setattr(self, key, value)
            self.tref = self.normal()
            self._validate()

    def __init_ref_pointer_vars(self):
        self._normal = None
        self._he_normal = None
        self._url = None
        self._next = None
        self._prev = None
        self._padded = None
        self._context = None
        self._first_spanned_ref = None
        self._spanned_refs = None
        self._ranged_refs = None
        self._range_depth = None
        self._range_index = None

    def _validate(self):
        self.__validate_sections_in_range()
        self.__validate_toSections()

    def __validate_sections_in_range(self):
        checks = [self.sections, self.toSections]
        for check in checks:
            for c, che in enumerate(check):
                if che < 1:
                    raise InputError(f'{self.book} {"".join([str(x) for x in check[:c]])} starts at {1+self._get_offset([x-1 for x in check[:c]])}')
            if getattr(self.index_node, "lengths", None) and len(check):
                if check[0] > self.index_node.lengths[0]:
                    display_size = self.index_node.address_class(0).toStr("en", self.index_node.lengths[0])
                    raise InputError("{} ends at {} {}.".format(self.book, self.index_node.sectionNames[0], display_size))

    def __validate_toSections(self):
        if len(self.sections) != len(self.toSections):
            raise InputError("{} is an invalid range. depth of beginning of range must equal depth of end of range")

        for i in range(len(self.sections)):
            if self.toSections[i] > self.sections[i]:
                break
            if self.toSections[i] < self.sections[i]:
                raise InputError("{} is an invalid range.  Ranges must end later than they begin.".format(self.normal()))

    @staticmethod
    def __clean_tref(tref, lang):
        tref = tref.strip().replace("–", "-").replace("\u2011", "-").replace("_", " ")

        # don't replace : in Hebrew, where it can indicate amud
        if lang == "he":
            return tref

        tref = tref.replace(":", ".")

        try:
            # capitalize first letter (don't title case all to avoid e.g., "Song Of Songs")
            tref = tref[0].upper() + tref[1:]
        except IndexError:
            pass

        return tref

    def __reinit_tref(self, new_tref):
        logger.debug("__reinit_tref from {} to {}".format(self.tref, new_tref))
        self.tref = self.__clean_tref(new_tref, self._lang)
        self._lang = "en"
        self.__init_tref()

    def __init_tref(self):
        """
        Parse self.tref
        Populate self.index, self.index_node, self.type, self.book, self.sections, self.toSections, ...
        :return:
        """
        # Split ranges based on all '-' symbol, store in `parts` variable
        parts = [s.strip() for s in re.split("[-\u2010-\u2015]", self.tref)]
        if len(parts) > 2:
            raise InputError("Couldn't understand ref '{}' (too many -'s).".format(self.tref))
        if any([not p for p in parts]):
            raise InputError("Couldn't understand ref '{}' (beginning or ending -)".format(self.tref))

        base = parts[0]
        title = None

        tndict = library.get_title_node_dict(self._lang)
        termdict = library.get_term_dict(self._lang)

        self.index_node = tndict.get(base)  # Match index node before term
        if not self.index_node:
            new_tref = termdict.get(base)   # Check if there's a term match, reinit w/ term
            if new_tref:
                self.__reinit_tref(new_tref)
                return

        # Remove letter from end of base reference until TitleNode matched, set `title` variable with matched title
        for l in range(len(base), 0, -1):
            if l != len(base) and base[l] not in ' ,.:_':
                continue #do not stop in the middle of a word

            self.index_node = tndict.get(base[0:l])

            if self.index_node:
                title = base[0:l]
                if base[l - 1] == "." and l < len(base):   # Take care of Refs like "Exo.14.15", where the period shouldn't get swallowed in the name.
                    title = base[0:l - 1]
                break

        # At this point, `title` is something like "Exodus" or "Rashi on Exodus" or "Pesach Haggadah, Magid, Four Sons"
        if title:
            assert isinstance(self.index_node, TitledTreeNode)
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

            # Don't accept references like "Rashi" (deleted in commentary refactor)

        else:  # This may be a new version, try to build a schema node.
            raise InputError("Could not find title in reference: {}".format(self.tref))

        self.primary_category = self.index.get_primary_category()
        if title == base:  # Bare book, like "Genesis" or "Rashi on Genesis".
            if self.index_node.is_default():  # Without any further specification, match the parent of the fall-through node
                self.index_node = self.index_node.parent
                self.book = self.index_node.full_title("en")
            return

        reg = None
        try:
            reg = self.index_node.full_regex(title, self._lang, terminated=True)  # Try to treat this as a JaggedArray
        except AttributeError:
            if self.index_node.is_virtual:
                # The line below will raise InputError (or DictionaryEntryNotFoundError) if no match
                self.index_node = self.index_node.create_dynamic_node(title, base)
                self.book = self.index_node.full_title("en")
                self.sections = self.index_node.get_sections()
                self.toSections = self.sections[:]
                return

            elif self.index.has_alt_structures():
                # Give an opportunity for alt structure parsing, below
                pass

            else:
                # We matched a schema node followed by an illegal number. (Are there other cases here?)
                matched = self.index_node.full_title(self._lang)
                msg = "Partial reference match for '{}' - failed to find continuation for '{}'.\nValid continuations are:\n".format(self.tref, matched)
                continuations = []
                for child in self.index_node.children:
                    continuations += child.all_node_titles(self._lang)
                msg += ",\n".join(continuations)
                raise PartialRefInputError(msg, matched, continuations)

        # Numbered Structure node - try numbered structure parsing
        if reg and self.index_node.children and getattr(self.index_node, "_addressTypes", None):
            try:
                loose_reg = self.index_node.full_regex(title, self._lang)
                struct_indexes = self.__get_sections(loose_reg, base)
                self.index_node = reduce(lambda a, i: a.children[i], [s - 1 for s in struct_indexes], self.index_node)
                title = self.book = self.index_node.full_title("en")
                base = regex.sub(loose_reg, title, base)
                reg = self.index_node.full_regex(title, self._lang, terminated=True)
            except InputError:
                pass
            #todo: ranges that cross structures

        # Numbered Structure node parsed - return. (Verify this comment.  Should this be indented?)
        if title == base:
            return

        # Content node -  Match primary structure address (may be stage two of numbered structure parsing)
        if reg and not self.index_node.children and getattr(self.index_node, "_addressTypes", None):
            try:
                self.sections = self.__get_sections(reg, base)
            except InputError:
                pass

        # Look for alternate structure
        # todo: handle commentator on alt structure
        if not self.sections:
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
                        reg = alt_struct_node.full_regex(title, self._lang)  # Not strict, since the array map portion will go beyond
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
                                reg = alt_struct_node.full_regex(title, self._lang, terminated=True)
                            except InputError:
                                pass

                        # Alt struct map node -  (may be stage two of numbered structure parsing)
                        if title == base:  # not a repetition of similar test above - title may have changed in numbered structure parsing
                            alt_struct_indexes = []
                        else:
                            alt_struct_indexes = self.__get_sections(reg, base, use_node=alt_struct_node)
                        try:
                            new_tref = alt_struct_node.get_ref_from_sections(alt_struct_indexes)
                        except IndexError:
                            raise InputError("Sections {} not found in {}".format(alt_struct_indexes, alt_struct_node.full_title()))
                        if new_tref:
                            self.__reinit_tref(new_tref)
                            return

        if not self.sections:
            msg = f"Failed to parse sections for ref {self.orig_tref}"
            raise PartialRefInputError(msg, title, None)

        self.toSections = self.sections[:]

        # retrieve the address class of the last section in the ref
        address_class = AddressType.to_class_by_address_type(self.index_node.addressTypes[len(self.sections)-1])

        if hasattr(address_class, "parse_range_end"):
            base_wout_title = base.replace(title + " ", "")
            address_class.parse_range_end(self, parts, base_wout_title)
        elif len(parts) == 2: # Parse range end portion, if it exists
            try:
                second_part = Ref(parts[1])
                assert second_part.book == self.book, "the two sides of the range have different books"
                self.toSections = Ref(parts[1]).sections
            except InputError:
                self._parse_range_end(re.split("[.:, ]+", parts[1]))
            except AssertionError:
                raise InputError("the two sides of the range have different books: '{}'.".format(self.tref))


    def _parse_range_end(self, range_parts):
        self.__init_ref_pointer_vars()  # clear out any mistaken partial representations
        delta = len(self.sections) - len(range_parts)
        for i in range(delta, len(self.sections)):
            offset = self._get_offset([x-1 for x in self.toSections[:i]])
            try:
                self.toSections[i] = self.index_node._addressTypes[i].toNumber(self._lang,
                                                                                range_parts[i - delta], sections=self.sections[i]) - offset
            except (ValueError, IndexError):
                raise InputError("Couldn't understand text sections: '{}'.".format(self.tref))

    def _get_offset(self, section_indexes, use_node=None):
        use_node = use_node if use_node else self.index_node
        index_offsets_by_depth = getattr(use_node, 'index_offsets_by_depth', None)
        return JaggedArrayNode.get_index_offset(section_indexes, index_offsets_by_depth)

    def __get_sections(self, reg, tref, use_node=None):
        use_node = use_node or self.index_node
        sections = []
        ref_match = reg.match(tref)
        if not ref_match:
            raise InputError("Can not parse sections from ref: {}".format(tref))

        gs = ref_match.groupdict()
        indexes = []
        for i in range(0, use_node.depth):
            gname = "a{}".format(i)
            if gs.get(gname) is not None:
                try:
                    offset = self._get_offset(indexes, use_node)
                except IndexError:
                    raise InputError(f"Can not parse sections from ref: {tref}")
                sections.append(use_node._addressTypes[i].toNumber(self._lang, gs.get(gname)) - offset)
            indexes.append(sections[-1]-1)
        return sections


    def __eq__(self, other):
        return isinstance(other, Ref) and self.uid() == other.uid()

    def __hash__(self):
        return hash(self.uid())

    def __ne__(self, other):
        return not self.__eq__(other)

    @staticmethod
    def is_ref(tref):
        """
        Static method for testing if a string is valid for instantiating a Ref object.

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

    def is_bavli(self):
        """
        Is this a Talmud Bavli or related text reference?
        :return bool:
        """
        return "Bavli" in self.index.categories

    def is_commentary(self):
        """
        Is this a commentary reference?

        :return bool:
        """
        # TODO: -deprecate
        return getattr(self.index, 'dependence', "").capitalize() == "Commentary"

    def is_dependant(self):
        return self.index.is_dependant_text()

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

    def all_segment_refs(self):
        """
        A function that returns all lowest level refs under this ref. 
        TODO: This function was never adapted to serve for complex refs and only works for Refs that are themselves "section level". More specifically it only works for 
        `supported_classes` and fails otherwise 
        
        Note: There is a similar function present on class sefaria.model.text.AbstractIndex
        :return: list of all segment level refs under this Ref.  
        """
        supported_classes = (JaggedArrayNode, DictionaryEntryNode, SheetNode)
        assert self.index_node is not None
        if not isinstance(self.index_node, supported_classes):
            # search for default node child
            for child in self.index_node.children:
                if child.is_default():
                    return child.ref().all_segment_refs()
            assert isinstance(self.index_node, supported_classes)

        if self.is_range():
            input_refs = self.range_list()
        else:
            input_refs = [self]

        ref_list = []
        for temp_ref in input_refs:
            if temp_ref.is_segment_level():
                ref_list.append(temp_ref)
            elif temp_ref.is_section_level():
                ref_list += temp_ref.all_subrefs()
            else: # you're higher than section level
                if self.index_node.is_virtual:
                    sub_refs = temp_ref.all_subrefs()
                    ref_list_list = [sub_ref.all_segment_refs() for sub_ref in sub_refs]
                    ref_list += [refs for refs in ref_list_list]
                else:
                    state_ja = self.get_state_ja("all")
                    sub_ja = state_ja.subarray_with_ref(temp_ref)
                    ref_list_sections = [temp_ref.subref([i + 1 for i in k ]) for k in sub_ja.non_empty_sections() ]
                    ref_list += [ref_seg for ref_sec in ref_list_sections for ref_seg in ref_sec.all_subrefs(state_ja=state_ja)]

        return ref_list

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
        if getattr(self.index_node, "depth", None) is None:
            return False
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
        if getattr(self.index_node, "depth", None) is None:
            return False
        return len(self.sections) == self.index_node.depth

    def is_sheet(self):
        """
        Is this Ref a Sheet Ref?
        ::
            >>> Ref("Leviticus 15:3").is_sheet()
            False
            >>> Ref("Sheet 15").is_sheet()
            True
        :return bool:
        """
        return self.index.title == 'Sheet'

    """ Methods to generate new Refs based on this Ref """
    def _core_dict(self):
        return {
            "index": self.index,
            "book": self.book,
            "primary_category": self.primary_category,
            "index_node": self.index_node,
            "sections": self.sections[:],
            "toSections": self.toSections[:]
        }

    def has_default_child(self):
        return self.index_node.has_default_child()

    def default_child_ref(self):
        """
        Return ref to the default node underneath this node
        If there is no default node, return self
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

        max_depth = self.index_node.depth - len(self.sections)  # calculate the number of "paddings" required to get down to segment level

        if len(d['sections']) == 0:
            segment_refs = self.all_segment_refs()
            if segment_refs == []:
                return self
            d["sections"] = segment_refs[0].sections
        else:
            d['sections'] += [1] * max_depth

        state_ja = current_ending_ref.get_state_ja()

        for _ in range(max_depth):
            size = state_ja.sub_array_length([i - 1 for i in current_ending_ref.sections])
            if size and size > 0:
                d['toSections'].append(size)
            else:
                d['toSections'].append(1)

            # get the next level ending ref
            temp_d = current_ending_ref._core_dict()
            temp_d['sections'] = temp_d['toSections'][:] = d['toSections'][:]
            current_ending_ref = Ref(_obj=temp_d)

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

    def next_section_ref(self, vstate=None):
        """
        Returns a Ref to the next section (e.g. Chapter).

        If this is the last section, returns ``None``

        :return: :class:`Ref`
        """
        if not self._next:
            if self.index_node.is_virtual:
                nl = self.index_node.next_leaf()
                self._next = nl.ref() if nl else None
                return self._next
            self._next = self._iter_text_section(vstate=vstate)
            if self._next is None and not self.index_node.children:
                current_leaf = self.index_node
                #we now need to iterate over the next leaves, finding the first available section
                while True:
                    next_leaf = current_leaf.next_leaf() #next schema/JANode
                    if next_leaf and next_leaf.is_virtual:
                        if next_leaf.first_child():
                            return next_leaf.first_child().ref()
                        else:
                            return None
                    if next_leaf:
                        next_node_ref = next_leaf.ref() #get a ref so we can do the next lines
                        potential_next = next_node_ref._iter_text_section(depth_up=0 if next_leaf.depth == 1 else 1, vstate=vstate)
                        if potential_next:
                            self._next = potential_next
                            break
                        current_leaf = next_leaf
                    else:
                        self._next = None
                        break
        return self._next

    def prev_section_ref(self, vstate=None):
        """
        Returns a Ref to the previous section (e.g. Chapter).

        If this is the first section, returns ``None``

        :return: :class:`Ref`
        """
        if not self._prev:
            if self.index_node.is_virtual:
                pl = self.index_node.prev_leaf()
                self._prev = pl.ref() if pl else None
                return self._prev
            self._prev = self._iter_text_section(False, vstate=vstate)
            if self._prev is None and not self.index_node.children:
                current_leaf = self.index_node
                # we now need to iterate over the prev leaves, finding the first available section
                while True:
                    prev_leaf = current_leaf.prev_leaf()  # prev schema/JANode
                    if prev_leaf and prev_leaf.is_virtual:
                        if prev_leaf.last_child():
                            return prev_leaf.last_child().ref()
                        else:
                            return None
                    if prev_leaf:
                        prev_node_ref = prev_leaf.ref()  # get a ref so we can do the next lines
                        potential_prev = prev_node_ref._iter_text_section(forward=False, depth_up=0 if prev_leaf.depth == 1 else 1, vstate=vstate)
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
        Return first available segment ref is `self` is depth 1

        Returns ``None`` if self is empty and no following :class:`Ref` has content.

        :return: :class:`Ref`
        """
        # todo: This is now stored on the VersionState. Look for performance gains.
        if isinstance(self.index_node, JaggedArrayNode):
            r = self.padded_ref()
        elif isinstance(self.index_node, TitledTreeNode):
            if self.is_segment_level():  # dont need to use first_leaf if we're already at segment level
                r = self
            else:
                first_leaf = self.index_node.first_leaf()
                if not first_leaf:
                    return None
                try:
                    r = first_leaf.ref().padded_ref()
                except Exception as e: #VirtualNodes dont have a .ref() function so fall back to VersionState
                    if self.is_book_level():
                        return self.index.versionSet().array()[0].first_section_ref()
        else:
            return None

        if r.is_book_level():
            # r is depth 1. return first segment
            r = r.subref([1])
            return r.next_segment_ref() if r.is_empty() else r
        else:
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
            try:
                text = self.text(lang=lang).text
                return bool(len(text) and all(text))
            except NoVersionFoundError:
                return False
        else:
            sja = self.get_state_ja(lang)
            subarray = sja.subarray_with_ref(self)
            return subarray.is_full()

    def is_text_translated(self):
        """
        :return: True if at least one complete version of this :class:`Ref` is available in English.
        """
        return self.is_text_fully_available("en")

    def is_empty(self, lang=None):
        """
        Checks if :class:`Ref` has any corresponding data in :class:`Version` records.

        :return: Bool True is there is not text at this ref in any language
        """

        # The commented code is easier to understand, but the code we're using puts a lot less on the wire.
        # return not len(self.versionset())
        # depricated
        # return db.texts.find(self.condition_query(), {"_id": 1}).count() == 0

        return db.texts.count_documents(self.condition_query(lang)) == 0

    def word_count(self, lang="he"):
        try:
            return TextChunk(self, lang).word_count()
        except InputError:
            lns = self.index_node.get_leaf_nodes()
            return sum([TextChunk(n.ref(), lang).word_count() for n in lns])

    def _iter_text_section(self, forward=True, depth_up=1, vstate=None):
        """
        Iterate forwards or backwards to the next available :class:`Ref` in a text

        :param forward: Boolean indicating direction to iterate
        :depth_up: if we want to traverse the text at a higher level than most granular. Defaults to one level above
        :param vstate: VersionState for this index. Pass this down to avoid calling expensive database lookups
        :return: :class:`Ref`
        """
        if self.index_node.depth <= depth_up:  # if there is only one level of text, don't even waste time iterating.
            return None

        # arrays are 0 based. text sections are 1 based. so shift the numbers back.
        if not forward:
            # Going backward, start from begginning of Ref
            starting_points = [s - 1 for s in self.sections[:self.index_node.depth - depth_up]]
        else:
            # Going forward start form end of Ref
            starting_points = [s - 1 for s in self.toSections[:self.index_node.depth - depth_up]]


        # start from the next one
        if len(starting_points) > 0:
            starting_points[-1] += 1 if forward else -1

        # let the counts obj calculate the correct place to go.
        if vstate:
            c = vstate.state_node(self.index_node).ja("all", "availableTexts")
        else:
            c = self.get_state_node(hint=[("all","availableTexts")]).ja("all", "availableTexts")
        new_section = c.next_index(starting_points) if forward else c.prev_index(starting_points)

        # we are also scaling back the sections to the level ABOVE the lowest section type (eg, for bible we want chapter, not verse)
        if new_section:
            d = self._core_dict()
            d["toSections"] = d["sections"] = [(s + 1) for s in new_section[:-depth_up]]
            return Ref(_obj=d)
        else:
            return None

    def pad_to_last_segment_ref(self):
        """
        From current position in jagged array, pad :class:`Ref` so that it reaches the last segment ref
        ``self`` remains unchanged.
        E.g. for input:
            - segment ref -> unchanged
            - section ref -> last segment ref in section
            - book ref -> last segment ref in book (equivalent to :meth:`last_segment_ref`)
        :return:
        """

        ja = self.get_state_ja()

        r = self
        while not r.is_segment_level():
            sublen = ja.sub_array_length([s-1 for s in r.toSections],until_last_nonempty=True)
            r = r.subref([sublen])

        return r

    def to(self, toref):
        """
        Return a reference that begins at this :class:`Ref`, and ends at toref

        :param toref: :class:`Ref` that denotes the end of the new ranged :class:`Ref`
        :return: :class:`Ref`
        """
        assert self.book == toref.book
        d = self._core_dict()
        d["toSections"] = toref.toSections[:]


        #pad sections and toSections so they're the same length. easier to just make them both segment level
        if len(d['sections']) != len(d['toSections']):
            if not self.is_segment_level():
                d['sections'] = self.first_available_section_ref().sections + [1]
            d['toSections'] = toref.pad_to_last_segment_ref().toSections


        return Ref(_obj=d)

    def subref(self, subsections):
        """
        Returns a more specific reference than the current Ref

        :param subsections: int or list - the subsections of the current Ref.
        If a section in subsections is negative, will calculate the last section for that depth. NOTE: this requires access to state_ja so this is a bit slower.
        :return: :class:`Ref`
        """
        if isinstance(subsections, int):
            subsections = [subsections]
        new_depth = len(self.sections) + len(subsections)
        assert self.index_node.depth >= new_depth, "Tried to get subref of bottom level ref: {}".format(self.normal())
        assert not self.is_range(), "Tried to get subref of ranged ref".format(self.normal())

        d = self._core_dict()

        if any([sec < 0 for sec in subsections]):
            # only load state_ja when a negative index exists
            ja = self.get_state_ja()
            ja_inds = [sec - 1 for sec in self.sections + subsections]
            for i, sec in enumerate(subsections):
                if sec >= 0: continue
                subsections[i] = ja.sub_array_length(ja_inds[:len(self.sections) + i]) + sec + 1
        d["sections"] += subsections
        d["toSections"] += subsections
        return Ref(_obj=d)

    def subrefs(self, length: int):
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

    def all_subrefs(self, lang='all', state_ja=None):
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

        if self.index_node.is_virtual:
            size = len(self.text().text)
            return self.subrefs(size)
        state_ja = state_ja or self.get_state_ja(lang)
        size = state_ja.sub_array_length([i - 1 for i in self.sections])
        if size is None:
            size = 0
        return self.subrefs(size)

    def all_context_refs(self, include_self = True, include_book = False):
        """
        :return: a list of more general refs that contain this one - out too, and including, the book level
        """

        refs = [self] if include_self else []
        try:
            current_level = self.index_node.depth - len(self.sections)
            refs += [self.context_ref(n) for n in  range(current_level + 1, self.index_node.depth + 1)]
        except AttributeError:  # If self is a Schema Node
            pass

        n = self.index_node.parent

        while n is not None:
            try:
                refs += [n.ref()]
            except AttributeError:  # Jump over VirtualNodes
                pass
            n = n.parent
        if not include_book:
            refs = refs[:-1]
        return refs

    def context_ref(self, level=1):
        """
        :param level: how many levels to 'zoom out' from the most specific possible :class:`Ref`
        :return: :class:`Ref` that is more general than this :class:`Ref`.

        ::

            >>> Ref("Genesis 4:5").context_ref(level = 1)
            Ref("Genesis 4")
            >>> Ref("Genesis 4:5").context_ref(level = 2)
            Ref("Genesis")

        If this :class:`Ref` is less specific than or equally specific to the level given, it is returned as-is.
        """
        if level == 0:
            return self

        if not self.sections and self.index_node.has_children():
            if self.index_node.has_default_child():
                return self.default_child_ref()
            return self

        if self._context is None:
            self._context = {}

        if not self._context.get(level) or not self._context[level]:
            if len(self.sections) <= self.index_node.depth - level:
                return self

            if level > self.index_node.depth:
                raise InputError("Call to Ref.context_ref of {} exceeds Ref depth of {}.".format(level, self.index_node.depth))
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
                raise Exception("No index_node found {}".format(vars(self)))
            try:
                if len(self.sections) >= self.index_node.depth - 1:
                    return self
            except AttributeError:  # This is a schema node, try to get a default child
                if self.has_default_child():
                    return self.default_child_ref().padded_ref()
                else:
                    raise InputError("Can not pad a schema node ref")

            d = self._core_dict()
            if self.is_talmud():
                if len(self.sections) == 0: #No daf specified
                    section = 3 if "Bavli" in self.index.categories and "Rif" not in self.index.categories else 1
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
            >>> Ref("Zohar 1:3b:12-3:12b:1").starting_refs_of_span()
            [Ref("Zohar 1:3b:12"),Ref("Zohar 2"),Ref("Zohar 3")]
            >>> Ref("Zohar 1:3b:12-1:4b:12").starting_refs_of_span(True)
            [Ref("Zohar 1:3b:12"),Ref("Zohar 1:4a"),Ref("Zohar 1:4b")]
            >>> Ref("Zohar 1:3b:12-1:4b:12").starting_refs_of_span(False)
            [Ref("Zohar 1:3b:12")]
            >>> Ref("Genesis 12:1-14:3").starting_refs_of_span()
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
        if self.index_node.depth == 1 or not self.is_spanning():
            self._spanned_refs = [self]

        else:
            start, end = self.sections[self.range_index()], self.toSections[self.range_index()]
            ref_depth = len(self.sections)
            to_ref_depth = len(self.toSections)

            refs = []
            for n in range(start, end + 1):
                d = self._core_dict()
                if n == start:
                    d["toSections"] = self.sections[0:self.range_index() + 1]

                    for i in range(self.range_index() + 1, ref_depth):
                        d["toSections"] += [self.get_state_ja().sub_array_length([s - 1 for s in d["toSections"][0:i]],until_last_nonempty=True)]
                elif n == end:
                    d["sections"] = self.toSections[0:self.range_index() + 1]
                    for _ in range(self.range_index() + 1, to_ref_depth):
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
        if self._ranged_refs is None:
            if not self.is_range():
                return [self]
            results = []
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
        # todo: move over to the regex methods of the index nodes
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
                sections = re.sub(r"^%s" % re.escape(self.book), '', r)
                patterns.append(r"%s$" % sections)   # exact match
                patterns.append(r"%s:" % sections)   # more granualar, exact match followed by :
                patterns.append(r"%s \d" % sections) # extra granularity following space
        else:
            sections = re.sub(r"^%s" % re.escape(self.book), '', self.normal())
            patterns.append(r"%s$" % sections)   # exact match
            if self.index_node.has_titled_continuation():
                patterns.append(r"{}({}).".format(sections, "|".join(self.index_node.title_separators)))
            if self.index_node.has_numeric_continuation():
                patterns.append(r"%s:" % sections)   # more granualar, exact match followed by :
                patterns.append(r"%s \d" % sections) # extra granularity following space

        escaped_book = re.escape(self.book)
        if anchored:
            if as_list:
                return [r"^{}{}".format(escaped_book, p) for p in patterns]
            else:
                return r"^%s(%s)" % (escaped_book, "|".join(patterns))
        else:
            if as_list:
                return [r"{}{}".format(escaped_book, p) for p in patterns]
            else:
                return r"%s(%s)" % (escaped_book, "|".join(patterns))

    def ref_regex_query(self):
        """
        Convenience method to wrap the lines of logic used to generate a broken out list of ref queries from one regex.
        The regex in the list will naturally all be anchored.
        :return: dict of the form {"$or" [{"refs": {"$regex": r1}},{"refs": {"$regex": r2}}...]}
        """
        reg_list = self.regex(as_list=True)
        ref_clauses = [{"refs": {"$regex": r}} for r in reg_list]
        return {"$or": ref_clauses}

    def get_padded_sections(self, section_end=None):
        """
        pad sections and toSections to index_node.depth.
        In the case of toSections, pad with section_end, a placeholder for the end of the section
        """
        sections, toSections = self.sections[:], self.toSections[:]
        for _ in range(self.index_node.depth - len(sections)):
            sections += [1]
        for _ in range(self.index_node.depth - len(toSections)):
            toSections += [section_end]
        return sections, toSections

    """ Comparisons """
    def contains(self, other):
        """
        Does this Ref completely contain ``other`` Ref?
        In the case where other is less specific than self, a database lookup is required

        :param other:
        :return bool:
        """
        assert isinstance(other, Ref)
        if not self.index_node == other.index_node:
            return self.index_node.is_ancestor_of(other.index_node)

        if len(self.sections) > len(other.sections): # other is less specific than self
            if len(other.sections) == 0:  # other is a whole book
                if any([x != 1 for x in self.sections]):  # self is not a whole book
                    return False  # performance optimization to avoid call to as_ranged_segment_ref
            # we need to get the true extent of other
            other = other.as_ranged_segment_ref()

        smallest_section_len = min([len(self.sections), len(other.sections)])

        # at each level of shared specificity
        for i in range(smallest_section_len):
            # If other's end is after my end, I don't contain it
            if other.toSections[i] > self.toSections[i]:
                return False

            # if other's end is before my end, I don't need to keep checking
            if other.toSections[i] < self.toSections[i]:
                break

        # at each level of shared specificity
        for i in range(smallest_section_len):
            # If other's start is before my start, I don't contain it
            if other.sections[i] < self.sections[i]:
                return False

            # If other's start is after my start, I don't need to keep checking
            if other.sections[i] > self.sections[i]:
                break

        return True

    def overlaps(self, other):
        """
        Does this Ref overlap ``other`` Ref?

        :param other: Ref
        :return bool:
        """
        assert isinstance(other, Ref)
        if not self.index_node == other.index_node:
            return self.index_node.is_ancestor_of(other.index_node)

        smallest_section_len = min([len(self.sections), len(other.sections)])

        # at each level of shared specificity
        for i in range(smallest_section_len):
            # If I start after your end, we don't overlap
            if self.sections[i] > other.toSections[i]:
                return False
            # If I start before your end, we don't need to keep checking
            if self.sections[i] < other.toSections[i]:
                break

        # at each level of shared specificity
        for i in range(smallest_section_len):
            # If I end before your start, we don't overlap
            if self.toSections[i] < other.sections[i]:
                return False

            # If I end after your start, we don't need to keep checking
            if self.toSections[i] > other.sections[i]:
                break

        return True

    def precedes(self, other) -> bool:
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

    def follows(self, other) -> bool:
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

        cats = self.index.categories[:]

        key = "/".join(cats + [self.index.title])
        try:
            base = library.category_id_dict()[key]
            if self.index.is_complex() and self.index_node.parent:
                child_order = self.index.nodes.get_child_order(self.index_node)
                base += str(format(child_order, '03')) if isinstance(child_order, int) else child_order

            res = reduce(lambda x, y: x + str(format(y, '04')), self.sections, base)
            if self.is_range():
                res = reduce(lambda x, y: x + str(format(y, '04')), self.toSections, res + "-")
            return res
        except Exception as e:
            logger.warning("Failed to execute order_id for {} : {}".format(self, e))
            return "Z"

    """ Methods for working with Versions and VersionSets """
    def storage_address(self, format="string"):
        """
        Return the storage location within a Version for this Ref.

        :return string or list: if format == 'string' return string where each address is separated by period else return list of addresses
        """
        address_list = ["chapter"] + self.index_node.address()[1:]
        if format == "list": return address_list
        return ".".join(address_list)

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

        if self.index_node.is_virtual:
            return

        projection = {k: 1 for k in Version.required_attrs + Version.optional_attrs}
        del projection[Version.content_attr]  # Version.content_attr == "chapter"
        projection["_id"] = 0

        if not self.sections:
            # For simple texts, self.store_address() == "chapter".
            # For complex texts, it can be a deeper branch of the dictionary: "chapter.Bereshit.Torah" or similar
            projection[self.storage_address()] = 1
        else:
            offset = self.sections[0] - 1
            limit = 1 if self.range_index() > 0 else self.toSections[0] - self.sections[0] + 1
            slce = {"$slice": [offset, limit]}
            projection[self.storage_address()] = slce
            if len(self.index_node.address()) > 1:
                # create dummy key at level of our selection - see above.
                dummy_limiter = ".".join(["chapter"] + self.index_node.address()[1:-1] + ["hacky_dummy_key"])
                projection[dummy_limiter] = 1

        return projection

    def condition_query(self, lang=None, actual_lang=None):
        """
        Return condition to select only versions with content at the location of this Ref.
        `actual_lang` is a 2 letter ISO lang code that represents the actual language of the version
        this is as opposed to `lang` which can currently only be "he" or "en"
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
        if actual_lang:
            import re as pyre  # pymongo can only encode re.compile objects, not regex or re2.
            pattern = r"^(?!.*\[[a-z]{2}\]$).*" if actual_lang in {'en', 'he'} else fr"\[{actual_lang}\]$"
            d.update({"versionTitle": pyre.compile(pattern)})
        if lang:
            d.update({"language": lang})

        if self.index_node.is_virtual:
            try:
                d.update({"versionTitle": self.index_node.parent.lexicon.version_title})
            except:
                pass
            return d

        condition_addr = self.storage_address()
        if not isinstance(self.index_node, JaggedArrayNode):
            # This will also return versions with no content in this Ref location - since on the version, there is a dictionary present.
            # We could enter the dictionary and check each array, but it's not clear that it's necessary.
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
            # todo: If this method gets cached, then copies need to be made before the del below.
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
        A list of available text versions metadata matching this ref.
        If this ref is book level, decorate with the first available section of content per version.

        :return list: each list element is an object with keys 'versionTitle' and 'language'
        """
        fields = Version.optional_attrs + Version.required_attrs
        fields.remove('chapter') # not metadata
        versions = VersionSet(self.condition_query())
        version_list = []
        if self.is_book_level():
            for v in versions:
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

    def he_book(self):
        return self.index_node.full_title("he")

    def _get_normal(self, lang):
        normal = self.index_node.full_title(lang)
        if not normal:
            if lang != "en":
                return self.normal()
            else:
                raise InputError("Failed to get English normal form for ref")

        if len(self.sections) == 0:
            return normal

        normal += " "

        normal += ":".join(
            [self.normal_section(i, lang) for i in range(len(self.sections))]
        )

        for i in range(len(self.sections)):
            if not self.sections[i] == self.toSections[i]:
                normal += "-{}".format(
                    ":".join(
                        [self.normal_section(i + j, lang, 'toSections') for j in range(len(self.toSections[i:]))]
                    )
                )
                break

        return normal

    def normal_sections(self, lang="en"):
        return [self.normal_section(i, lang) for i in range(len(self.sections))]

    def normal_toSections(self, lang="en"):
        return [self.normal_section(i, lang, 'toSections') for i in range(len(self.toSections))]

    def normal_section(self, section_index, lang='en', attr='sections', **kwargs):
        sections = getattr(self, attr)
        assert len(sections) > section_index
        offset = self._get_offset([x-1 for x in sections[:section_index]])
        return self.index_node.address_class(section_index).toStr(lang, sections[section_index]+offset, **kwargs)

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
        assert not self.is_range()
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
            Previously, Talmud lines had been normalised as Arabic numerals
        '''
        return self.normal('he')

    def uid(self):
        """
        To handle the fact that default nodes have the same name as their parents
        :return:
        """
        return self.normal() + ("<d>" if self.index_node.is_default() else "")

    def normal(self, lang='en') -> str:
        """
        :return string: Normal English or Hebrew string form
        """
        normal_attr = "_normal" if lang == 'en' else "_he_normal"
        if not getattr(self, normal_attr, None):
            #check if the second last section has function normal_range and the ref is a range. if true, parse
            #using address_class's normal_range function.  this is necessary to return Shabbat 7a-8b as Shabbat 7-8
            if len(self.sections) > 0 and hasattr(AddressType.to_class_by_address_type(self.index_node.addressTypes[len(self.sections) - 1]), "normal_range") and self.is_range():
                address_class = AddressType.to_class_by_address_type(self.index_node.addressTypes[len(self.sections) - 1])
                normal_form = address_class.normal_range(self, lang)
            else:
                normal_form = self._get_normal(lang)
            setattr(self, normal_attr, normal_form)
        return getattr(self, normal_attr)

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

        return NoteSet(query, sort=[("_id", -1)])

    def linkset(self):
        """
        :return: :class:`LinkSet` for this Ref
        """
        from . import LinkSet
        return LinkSet(self)

    def topiclinkset(self, with_char_level_links=False):
        from . import RefTopicLinkSet
        regex_list = self.regex(as_list=True)
        query = {"$or": [{"expandedRefs": {"$regex": r}} for r in regex_list]}
        if not with_char_level_links:
            query["charLevelData"] = {"$exists": False}
        return RefTopicLinkSet(query)

    def autolinker(self, **kwargs):
        """
        Returns the class best suited to perform auto linking,
        according to the "base_text_mapping" attr on the Index record.
        :return:
        """
        from sefaria.helper.link import AutoLinkerFactory
        if self.is_dependant() and getattr(self.index, 'base_text_mapping', None):
            return AutoLinkerFactory.instance_factory(self.index.base_text_mapping, self, **kwargs)
        else:
            return None

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
        for i in range(len(sec1)):
            sec1[i] -= 1
        for i in range(len(sec2)):
            sec2[i] -= 1

        distance = self.get_state_ja().distance(sec1,sec2)
        if max_dist and distance > max_dist:
            return -1
        else:
            return distance

    def get_all_anchor_refs(self, expanded_self, document_tref_list, document_tref_expanded):
        """
        Return all refs in document_ref_list that overlap with self. These are your anchor_refs. Useful for related API.
        :param list(str): expanded_self. precalculated list of segment trefs for self
        :param list(str): document_tref_list. list of trefs to from document in which you want to find archor refs
        :param list(Ref): document_tref_expanded. unique list of trefs that results from running Ref.expand_refs(document_tref_list)
        Returns tuple(list(Ref), list(list(Ref))). returns two lists. First are the anchor_refs for self. The second is a 2D list, where the inner list represents the expanded anchor refs for the corresponding position in anchor_ref_list
        """

        # narrow down search space to avoid excissive Ref instantiation
        unique_anchor_ref_expanded_set = set(expanded_self) & set(document_tref_expanded)
        document_tref_list = [tref for tref in document_tref_list if tref.startswith(self.index.title)]

        unique_anchor_ref_expanded_list = []
        for tref in unique_anchor_ref_expanded_set:
            try:
                oref = Ref(tref)
                unique_anchor_ref_expanded_list += [oref]
            except InputError:
                continue
        document_oref_list = []
        for tref in document_tref_list:
            try:
                oref = Ref(tref)
                document_oref_list += [oref]
            except InputError:
                continue
        anchor_ref_list = list(filter(lambda document_ref: self.overlaps(document_ref), document_oref_list))
        anchor_ref_expanded_list = [list(filter(lambda document_segment_ref: anchor_ref.overlaps(document_segment_ref), unique_anchor_ref_expanded_list)) for anchor_ref in anchor_ref_list]
        return anchor_ref_list, anchor_ref_expanded_list

    @staticmethod
    def expand_refs(refs):
        """
        Expands `refs` into list of unique segment refs. Usually used to preprocess database objects that reference refs
        :param refs: list of trefs to expand
        :return: list(trefs). unique segment refs derived from `refs`
        """

        expanded_set = set()
        for tref in refs:
            try:
                oref = Ref(tref)
            except (InputError, IndexError):
                continue
            try:
                expanded_set |= {r.normal() for r in oref.all_segment_refs()}
            except AssertionError:
                continue
        return list(expanded_set)

    @staticmethod
    def instantiate_ref_with_legacy_parse_fallback(tref: str) -> 'Ref':
        """
        Tries the following in order and returns the first that works
        - Instantiate `tref` as is
        - Use appropriate `LegacyRefParser` to parse `tref`
        - If ref has partial match, return partially matched ref
        Can raise an `InputError`
        @param tref: textual ref to parse
        @return: best `Ref` according to rules above
        """
        from sefaria.helper.legacy_ref import legacy_ref_parser_handler, LegacyRefParserError

        try:
            oref = Ref(tref)
            try:
                # this field can be set if a legacy parsed ref is pulled from cache
                delattr(oref, 'legacy_tref')
            except AttributeError:
                pass
            return oref
        except PartialRefInputError as e:
            matched_ref = Ref(e.matched_part)
            try:
                tref = Ref.__clean_tref(tref, matched_ref._lang)
                # replace input title with normalized title in case input was an alt title
                tref = tref.replace(e.matched_part, matched_ref.normal())
                legacy_ref_parser = legacy_ref_parser_handler[matched_ref.index.title]
                return legacy_ref_parser.parse(tref)
            except LegacyRefParserError:
                return matched_ref


class Library(object):
    """
    Operates as a singleton, through the instance called ``library``.

    Stewards the in-memory and in-cache objects that cover the entire collection of texts.

    Exposes methods to add, remove, or register change of an index record.
    These are primarily called by the dependencies mechanism on Index Create/Update/Destroy.


    Dependencies

    Initialization of the library happens in stages
    1. On load of this file, library instance is created.
        - Terms maps created
    2. On load of full model with `from sefaria.model import *`
        - Indexes are built
    3. On load of reader/views
        - toc tree is built (categories loaded)
        - autocompleters are created


    """

    def __init__(self):
        # Timestamp when library last stored shared cache items (toc, terms, etc)
        self.last_cached = None

        self.langs = ["en", "he"]

        # Maps, keyed by language, from index key to array of titles
        self._index_title_maps = {lang:{} for lang in self.langs}

        # Maps, keyed by language, from titles to schema nodes
        self._title_node_maps = {lang:{} for lang in self.langs}

        # Lists of full titles, keys are string generated from a combination of language code and "terms".  See method `full_title_list()`
        # Contains a list of only those titles from which citations are recognized in the auto-linker. Keyed by "citing-<lang>"
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
        self._toc_tree = None
        self._topic_toc = None
        self._topic_toc_json = None
        self._topic_toc_category_mapping = None
        self._topic_link_types = None
        self._topic_data_sources = None
        self._category_id_dict = None
        self._toc_size = 16

        # Spell Checking and Autocompleting
        self._full_auto_completer = {}
        self._ref_auto_completer = {}
        self._lexicon_auto_completer = {}
        self._cross_lexicon_auto_completer = None
        self._topic_auto_completer = {}

        # Term Mapping
        self._simple_term_mapping = {}
        self._full_term_mapping = {}
        self._simple_term_mapping_json = None
        self._ref_resolver = None

        # Topics
        self._topic_mapping = {}

        # Virtual books
        self._virtual_books = []

        # Initialization Checks
        # These values are set to True once their initialization is complete
        self._toc_tree_is_ready = False
        self._full_auto_completer_is_ready = False
        self._ref_auto_completer_is_ready = False
        self._lexicon_auto_completer_is_ready = False
        self._cross_lexicon_auto_completer_is_ready = False
        self._topic_auto_completer_is_ready = False

        if not hasattr(sys, '_doc_build'):  # Can't build cache without DB
            self.get_simple_term_mapping() # this will implicitly call self.build_term_mappings() but also make sure its cached.

    def _build_index_maps(self):
        """
        Build index and title node dicts in an efficient way
        """

        # self._index_title_commentary_maps if index_object.is_commentary() else self._index_title_maps
        # simple texts
        self._index_map = {i.title: i for i in IndexSet() if i.nodes}
        forest = [i.nodes for i in list(self._index_map.values())]
        self._title_node_maps = {lang: {} for lang in self.langs}
        self._index_title_maps = {lang:{} for lang in self.langs}

        for tree in forest:
            try:
                for lang in self.langs:
                    tree_titles = tree.title_dict(lang)
                    self._index_title_maps[lang][tree.key] = list(tree_titles.keys())
                    self._title_node_maps[lang].update(tree_titles)
            except IndexSchemaError as e:
                logger.error("Error in generating title node dictionary: {}".format(e))

    def _reset_index_derivative_objects(self, include_auto_complete=False):
        """
        Resets the objects which are derivatives of the index
        """
        self._full_title_lists = {}
        self._full_title_list_jsons = {}
        self._title_regex_strings = {}
        self._title_regexes = {}
        # TOC is handled separately since it can be edited in place

    def rebuild(self, include_toc = False, include_auto_complete=False):
        self.get_simple_term_mapping_json(rebuild=True)
        self._build_topic_mapping()
        self._build_index_maps()
        self._full_title_lists = {}
        self._full_title_list_jsons = {}
        self.reset_text_titles_cache()
        self._title_regex_strings = {}
        self._title_regexes = {}
        Ref.clear_cache()
        in_memory_cache.reset_all()
        if include_toc:
            self.rebuild_toc()

    def rebuild_toc(self, skip_toc_tree=False):
        """
        Rebuilds the TocTree representation at startup time upon load of the Library class singleton.
        The ToC is a tree of nodes that represents the ToC as seen on the Sefaria homepage.
        This function also builds other critical data structures, such as the topics ToC.
        While building these ToC data structures, this function also builds the equivalent JSON structures
        as an API optimization.

        :param skip_toc_tree: Boolean
        """
        if not skip_toc_tree:
            self._toc_tree = self.get_toc_tree(rebuild=True)
        self._toc = self.get_toc(rebuild=True)
        self._toc_json = self.get_toc_json(rebuild=True)
        self._topic_toc = self.get_topic_toc(rebuild=True)
        self._topic_toc_json = self.get_topic_toc_json(rebuild=True)
        self._topic_toc_category_mapping = self.get_topic_toc_category_mapping(rebuild=True)
        self._category_id_dict = None
        scache.delete_template_cache("texts_list")
        scache.delete_template_cache("texts_dashboard")
        self._full_title_list_jsons = {}

    def init_shared_cache(self, rebuild=False):
        self.get_toc(rebuild=rebuild)
        self.get_toc_json(rebuild=rebuild)
        self.get_topic_mapping(rebuild=rebuild)
        self.get_topic_toc(rebuild=rebuild)
        self.get_topic_toc_json(rebuild=rebuild)
        self.get_topic_toc_category_mapping(rebuild=rebuild)
        self.get_text_titles_json(rebuild=rebuild)
        self.get_simple_term_mapping(rebuild=rebuild)
        self.get_simple_term_mapping_json(rebuild=rebuild)
        self.get_virtual_books(rebuild=rebuild)
        if rebuild:
            scache.delete_shared_cache_elem("regenerating")

    def get_last_cached_time(self):
        if not self.last_cached:
            self.last_cached = scache.get_shared_cache_elem("last_cached")
        if not self.last_cached:
            self.set_last_cached_time()
        return self.last_cached

    def set_last_cached_time(self):
        self.last_cached = time.time() # just use the unix timestamp, we dont need any fancy timezone faffing, just objective point in time.
        scache.set_shared_cache_elem("last_cached", self.last_cached)

    def get_toc(self, rebuild=False):
        """
        Returns the ToC Tree from the cache, DB or by generating it, as needed.
        """
        if rebuild or not self._toc:
            if not rebuild:
                self._toc = scache.get_shared_cache_elem('toc')
            if rebuild or not self._toc:
                self._toc = self.get_toc_tree().get_serialized_toc()  # update_table_of_contents()
                scache.set_shared_cache_elem('toc', self._toc)
                self.set_last_cached_time()
        return self._toc

    def get_toc_json(self, rebuild=False):
        """
        Returns as JSON representation of the ToC. This is generated on Library start up as an
        optimization for the API, to allow retrieval of the data with a single call.
        """
        if rebuild or not self._toc_json:
            if not rebuild:
                self._toc_json = scache.get_shared_cache_elem('toc_json')
            if rebuild or not self._toc_json:
                self._toc_json = json.dumps(self.get_toc(), ensure_ascii=False)
                scache.set_shared_cache_elem('toc_json', self._toc_json)
                self.set_last_cached_time()
        return self._toc_json

    def get_toc_tree(self, rebuild=False, mobile=False):
        """
        :param mobile: (Aug 30, 2021) Added as a patch after navigation redesign launch. Currently only adds
        'firstSection' to toc for mobile export. This field is no longer required on prod but is still required
        on mobile until the navigation redesign happens there.
        """
        if rebuild or not self._toc_tree:
            from sefaria.model.category import TocTree
            self._toc_tree = TocTree(self, mobile=mobile)
        self._toc_tree_is_ready = True
        return self._toc_tree

    def get_topic_toc(self, rebuild=False):
        """
        Returns dictionary representation of Topics ToC.
         """
        if rebuild or not self._topic_toc:
            if not rebuild:
                self._topic_toc = scache.get_shared_cache_elem('topic_toc')
            if rebuild or not self._topic_toc:
                self._topic_toc = self.get_topic_toc_json_recursive()
                scache.set_shared_cache_elem('topic_toc', self._topic_toc)
                self.set_last_cached_time()
        return self._topic_toc

    def get_topic_toc_json(self, rebuild=False):
        """
        Returns JSON representation of Topics ToC.
        :param rebuild: Boolean
        """
        if rebuild or not self._topic_toc_json:
            if not rebuild:
                self._topic_toc_json = scache.get_shared_cache_elem('topic_toc_json')
            if rebuild or not self._topic_toc_json:
                self._topic_toc_json = json.dumps(self.get_topic_toc(), ensure_ascii=False)
                scache.set_shared_cache_elem('topic_toc_json', self._topic_toc_json)
                self.set_last_cached_time()
        return self._topic_toc_json

    def get_topic_toc_json_recursive(self, topic=None, explored=None, with_descriptions=False):
        """
        Returns JSON representation of Topics ToC
        :param topic: Topic
        :param explored: Set
        :param with_descriptions: Boolean
        """
        from .topic import Topic, TopicSet, IntraTopicLinkSet
        explored = explored or set()
        unexplored_top_level = False    # example would be the first case of 'Holidays' encountered as it is top level,
                                        # this variable will allow us to force all top level categories to have children
        if topic is None:
            ts = TopicSet({"isTopLevelDisplay": True})
            children = [t.slug for t in ts]
            topic_json = {}
        else:
            children = [] if topic.slug in explored else [l.fromTopic for l in IntraTopicLinkSet({"linkType": "displays-under", "toTopic": topic.slug})]
            topic_json = {
                "slug": topic.slug,
                "shouldDisplay": True if len(children) > 0 else topic.should_display(),
                "en": topic.get_primary_title("en"),
                "he": topic.get_primary_title("he"),
                "displayOrder": getattr(topic, "displayOrder", 10000)
            }

            with_descriptions = True # TODO revisit for data size / performance
            if with_descriptions:
                if getattr(topic, "categoryDescription", False):
                    topic_json['categoryDescription'] = topic.categoryDescription
                description = getattr(topic, "description", None)
                if description is not None and getattr(topic, "description_published", False):
                    topic_json['description'] = description

            unexplored_top_level = getattr(topic, "isTopLevelDisplay", False) and getattr(topic, "slug",
                                                                                          None) not in explored
            explored.add(topic.slug)
        if len(children) > 0 or topic is None or unexplored_top_level:
            # make sure root gets children no matter what and make sure that unexplored top-level topics get children no matter what
            topic_json['children'] = []
        for child in children:
            child_topic = Topic().load({'slug': child})
            if child_topic is None:
                logger.warning("While building topic TOC, encountered non-existant topic slug: {}".format(child))
                continue
            topic_json['children'] += [self.get_topic_toc_json_recursive(child_topic, explored, with_descriptions)]
        if len(children) > 0:
            topic_json['children'].sort(key=lambda x: x['displayOrder'])
        if topic is None:
            return topic_json['children']
        return topic_json

    def build_topic_toc_category_mapping(self) -> dict:
        """
        Maps every slug in topic toc to its parent slug. This is usually the top level category, but in
        the case of laws it is the second-level category
        """
        topic_toc_category_mapping = {}
        topic_toc = self.get_topic_toc()
        discovered_slugs = set()
        topic_stack = [t for t in topic_toc]
        while len(topic_stack) > 0:
            curr_topic = topic_stack.pop()
            if curr_topic['slug'] in discovered_slugs: continue
            discovered_slugs.add(curr_topic['slug'])
            for child_topic in curr_topic.get('children', []):
                topic_stack += [child_topic]
                topic_toc_category_mapping[child_topic['slug']] = curr_topic['slug']
        return topic_toc_category_mapping

    def get_topic_toc_category_mapping(self, rebuild=False) -> dict:
        """
        Returns the category mapping as a dictionary for the topics ToC. Loads on Library startup.
        :param rebuild: Boolean
        """
        if rebuild or not self._topic_toc_category_mapping:
            if not rebuild:
                self._topic_toc_category_mapping = scache.get_shared_cache_elem('topic_toc_category_mapping')
            if rebuild or not self._topic_toc_category_mapping:
                self._topic_toc_category_mapping = self.build_topic_toc_category_mapping()
                scache.set_shared_cache_elem('topic_toc_category_mapping', self._topic_toc_category_mapping)
                self.set_last_cached_time()
        return self._topic_toc_category_mapping

    def get_search_filter_toc(self):
        """
        Returns TOC, modified  according to `Category.searchRoot` flags to correspond to the filters
        """
        from sefaria.model.category import TocTree, CategorySet, TocCategory
        toctree = TocTree(self)     # Don't use the cached one.  We're going to rejigger it.
        root = toctree.get_root()
        toc_roots = [x.lastPath for x in sorted(library.get_top_categories(full_records=True), key=lambda x: x.order)]
        reroots = CategorySet({"searchRoot": {"$exists": True}})

        # Get all the unique new roots, create nodes for them, and attach them to the tree
        new_root_titles = list({c.searchRoot for c in reroots})

        def root_title_sorter(t):
            # .split() to remove " Commentary"
            sort_key = t.split()[0]
            try:
                return toc_roots.index(sort_key)
            except ValueError:
                return 10000

        new_root_titles.sort(key=root_title_sorter)
        new_roots = {}
        for t in new_root_titles:
            tc = TocCategory()
            tc.add_title(t, "en", primary=True)
            tc.add_title(Term.normalize(t, "he"), "he", primary=True)
            tc.append_to(root)
            new_roots[t] = tc

        # Re-parent all of the nodes with "searchRoot"
        for cat in reroots:
            tocnode = toctree.lookup(cat.path)
            tocnode.detach()
            tocnode.append_to(new_roots[cat.searchRoot])

        # todo: return 'thin' param when search toc is retired.
        return [c.serialize(thin=True) for c in root.children]

    def get_topic_link_type(self, link_type):
        """
        Returns a TopicLinkType with a slug of link_type (parameter) if not already present
        :param link_type: String
        """
        from .topic import TopicLinkTypeSet
        if not self._topic_link_types:
            # pre-populate topic link types
            self._topic_link_types = {
                link_type.slug: link_type for link_type in TopicLinkTypeSet()
            }
        return self._topic_link_types.get(link_type, None)

    def get_topic_data_source(self, data_source):
        """
        Returns a TopicDataSource with the data_source (parameter) slug if not already present
        :param data_source: String
        """
        from .topic import TopicDataSourceSet
        if not self._topic_data_sources:
            # pre-populate topic data sources
            self._topic_data_sources = {
                data_source.slug: data_source for data_source in TopicDataSourceSet()
            }
        return self._topic_data_sources.get(data_source, None)

    def get_collections_in_library(self):
        """
        Calls itself on the _toc_tree attribute to get all the collections in the Library upon
        loading.
        """
        return self._toc_tree.get_collections_in_library()

    def build_full_auto_completer(self):
        """
        Builds full auto completer across people, topics, categories, parasha, users, and collections
        for each of the languages in the library.
        Sets internal boolean to True upon successful completion to indicate auto completer is ready.
        """
        from .autospell import AutoCompleter
        self._full_auto_completer = {
            lang: AutoCompleter(lang, library, include_people=True, include_topics=True, include_categories=True, include_parasha=False, include_users=True, include_collections=True) for lang in self.langs
        }

        for lang in self.langs:
            self._full_auto_completer[lang].set_other_lang_ac(self._full_auto_completer["he" if lang == "en" else "en"])
        self._full_auto_completer_is_ready = True

    def build_ref_auto_completer(self):
        """
        Builds the autocomplete for Refs across the languages in the library
        Sets internal boolean to True upon successful completion to indicate Ref auto completer is ready.
        """
        from .autospell import AutoCompleter
        self._ref_auto_completer = {
            lang: AutoCompleter(lang, library, include_people=False, include_categories=False, include_parasha=False) for lang in self.langs
        }

        for lang in self.langs:
            self._ref_auto_completer[lang].set_other_lang_ac(self._ref_auto_completer["he" if lang == "en" else "en"])
        self._ref_auto_completer_is_ready = True

    def build_lexicon_auto_completers(self):
        """
        Sets lexicon autocompleter for each lexicon in LexiconSet using a LexiconTrie
        Sets internal boolean to True upon successful completion to indicate auto completer is ready.

        """
        from .autospell import LexiconTrie
        from .lexicon import LexiconSet
        self._lexicon_auto_completer = {
            lexicon.name: LexiconTrie(lexicon.name) for lexicon in LexiconSet({'should_autocomplete': True})
        }
        self._lexicon_auto_completer_is_ready = True

    def build_cross_lexicon_auto_completer(self):
        """
        Builds the cross lexicon auto completer excluding titles
        Sets internal boolean to True upon successful completion to indicate auto completer is ready.
        """
        from .autospell import AutoCompleter
        self._cross_lexicon_auto_completer = AutoCompleter("he", library, include_titles=False, include_lexicons=True)
        self._cross_lexicon_auto_completer_is_ready = True

    def build_topic_auto_completer(self):
        """
        Builds the topic auto complete including topics with no sources
        """
        from .autospell import AutoCompleter
        self._topic_auto_completer = AutoCompleter("en", library, include_topics=True, include_titles=False, min_topics=0)
        self._topic_auto_completer_is_ready = True

    def topic_auto_completer(self):
        """
        Returns the topic auto completer. If the auto completer was not initially loaded,
        it rebuilds before returning, emitting warnings to the logger.
        """
        if self._topic_auto_completer is None:
            logger.warning("Failed to load topic auto completer. rebuilding")
            self.build_topic_auto_completer()
            logger.warning("Built topic auto completer")
        return self._topic_auto_completer

    def cross_lexicon_auto_completer(self):
        """
        Returns the cross lexicon auto completer. If the auto completer was not initially loaded,
        it rebuilds before returning, emitting warnings to the logger.
        """
        if self._cross_lexicon_auto_completer is None:
            logger.warning("Failed to load cross lexicon auto completer, rebuilding.")
            self.build_cross_lexicon_auto_completer()  # I worry that these could pile up.
            logger.warning("Built cross lexicon auto completer.")
        return self._cross_lexicon_auto_completer

    def lexicon_auto_completer(self, lexicon):
        """
        Returns the value of the lexicon auto completer map given a lexicon key. If the key
        is not present, it assumes the need to rebuild the lexicon_auto_completer and calls the build
        function with appropriate logger warnings before returning the desired result

        :param lexicon: String
        """
        try:
            return self._lexicon_auto_completer[lexicon]
        except KeyError:
            logger.warning("Failed to load {} auto completer, rebuilding.".format(lexicon))
            self.build_lexicon_auto_completers()  # I worry that these could pile up.
            logger.warning("Built {} auto completer.".format(lexicon))
            return self._lexicon_auto_completer[lexicon]

    def full_auto_completer(self, lang):
        try:
            return self._full_auto_completer[lang]
        except KeyError:
            logger.warning("Failed to load full {} auto completer, rebuilding.".format(lang))
            self.build_full_auto_completer()  # I worry that these could pile up.
            logger.warning("Built full {} auto completer.".format(lang))
            return self._full_auto_completer[lang]

    def ref_auto_completer(self, lang):
        try:
            return self._ref_auto_completer[lang]
        except KeyError:
            logger.warning("Failed to load {} ref auto completer, rebuilding.".format(lang))
            self.build_ref_auto_completer()  # I worry that these could pile up.
            logger.warning("Built {} ref auto completer.".format(lang))
            return self._ref_auto_completer[lang]

    def recount_index_in_toc(self, indx):
        # This is used in the case of a remotely triggered multiserver update
        if isinstance(indx, str):
            indx = Index().load({"title": indx})

        self.get_toc_tree().update_title(indx, recount=True)

        self.rebuild_toc(skip_toc_tree=True)

    def delete_category_from_toc(self, category):
        # This is used in the case of a remotely triggered multiserver update
        toc_node = self.get_toc_tree().lookup(category.path)
        if toc_node:
            self.get_toc_tree().remove_category(toc_node)

    def delete_index_from_toc(self, indx, categories = None):
        """
        :param indx: The Index object.  When called remotely, in multiserver mode, the string title of the index
        :param categories: Only explicitly passed when called remotely, in multiserver mode
        :return:
        """
        cats = categories or indx.categories
        title = indx.title if isinstance(indx, Index) else indx

        toc_node = self.get_toc_tree().lookup(cats, title)
        if toc_node:
            self.get_toc_tree().remove_index(toc_node)

        self.rebuild_toc(skip_toc_tree=True)

    def update_index_in_toc(self, indx, old_ref=None):
        """
        :param indx: The Index object.  When called remotely, in multiserver mode, the string title of the index
        :param old_ref:
        :return:
        """

        # This is used in the case of a remotely triggered multiserver update
        if isinstance(indx, str):
            indx = Index().load({"title": indx})

        self.get_toc_tree().update_title(indx, old_ref=old_ref, recount=False)

        self.rebuild_toc(skip_toc_tree=True)

    def get_index(self, bookname):
        """
        Factory - returns a :class:`Index` object that has the given bookname

        :param string bookname: Name of the book.
        :return:
        """
        # look for result in indices cache
        if not bookname:
            raise BookNameError("No book provided.")

        indx = self._index_map.get(bookname)
        if not indx:
            bookname = (bookname[0].upper() + bookname[1:]).replace("_", " ")  # todo: factor out method

            # todo: cache
            lang = "he" if has_tibetan(bookname) else "en"
            node = self._title_node_maps[lang].get(bookname)
            if node:
                indx = node.index

            if not indx:
                raise BookNameError("No book named '{}'.".format(bookname))

            self._index_map[bookname] = indx

        return indx

    def add_index_record_to_cache(self, index_object = None, rebuild = True):
        """
        Update library title dictionaries and caches with information from provided index.
        Index can be passed with primary title in `index_title` or as an object in `index_object`
        :param index_object: Index record
        :param rebuild: Perform a rebuild of derivative objects afterwards?  False only in cases of batch update.
        :return:
        """
        assert index_object, "Library.add_index_record_to_cache called without index"

        # This is used in the case of a remotely triggered multiserver update
        if isinstance(index_object, str):
            index_object = Index().load({"title": index_object})

        self._index_map[index_object.title] = index_object
        try:
            for lang in self.langs:
                title_dict = index_object.nodes.title_dict(lang)
                self._index_title_maps[lang][index_object.title] = list(title_dict.keys())
                self._title_node_maps[lang].update(title_dict)
        except IndexSchemaError as e:
            logger.error("Error in generating title node dictionary: {}".format(e))

        if rebuild:
            self._reset_index_derivative_objects()

    def remove_index_record_from_cache(self, index_object=None, old_title=None, rebuild = True):
        """
        Update provided index from library title dictionaries and caches
        :param index_object: In the local case - the index object to remove.  In the remote case, the name of the index object to remove.
        :param old_title: In the case of a title change - the old title of the Index record
        :param rebuild: Perform a rebuild of derivative objects afterwards?
        :return:
        """

        index_object_title = old_title if old_title else (index_object.title if isinstance(index_object, Index) else index_object)
        Ref.remove_index_from_cache(index_object_title)

        for lang in self.langs:
            simple_titles = self._index_title_maps[lang].get(index_object_title)
            if simple_titles:
                for key in simple_titles:
                    try:
                        del self._title_node_maps[lang][key]
                    except KeyError:
                        logger.warning("Tried to delete non-existent title '{}' of index record '{}' from title-node map".format(key, index_object_title))
                    try:
                        del self._index_map[key]
                    except KeyError:
                        pass
                del self._index_title_maps[lang][index_object_title]
            else:
                logger.warning("Failed to remove '{}' from {} index-title and title-node cache: nothing to remove".format(index_object_title, lang))
                return

        if rebuild:
            self._reset_index_derivative_objects()

    def refresh_index_record_in_cache(self, index_object, old_title = None):
        """
        Update library title dictionaries and caches for provided index
        :param index_object: In the local case - the index object to remove.  In the remote case, the name of the index object to remove.
        :param old_title: In the case of a title change - the old title of the Index record
        :return:
        """
        index_object_title = index_object.title if isinstance(index_object, Index) else index_object
        self.remove_index_record_from_cache(index_object, old_title=old_title, rebuild=False)
        new_index = Index().load({"title": index_object_title})
        assert new_index, "No Index record found for {}: {}".format(index_object.__class__.__name__, index_object_title)
        self.add_index_record_to_cache(new_index, rebuild=True)

    # todo: the for_js path here does not appear to be in use.
    # todo: Rename, as method not gauraunteed to return all titles
    def all_titles_regex_string(self, lang="en", with_terms=False, citing_only=False): #, for_js=False):
        """
        :param lang: "en" or "he"
        :param with_terms: Include terms in regex.  (Will have no effect if citing_only is True)
        :param citing_only: Match only those texts which have is_cited set to True
        :param for_js:
        :return:
        """
        key = lang
        if citing_only:
            key += "_citations"
        elif with_terms:
            key += "_terms"
        re_string = self._title_regex_strings.get(key)
        if not re_string:
            re_string = ""
            if citing_only:
                simple_books = list(map(re.escape, self.citing_title_list(lang)))
            else:
                simple_books = list(map(re.escape, self.full_title_list(lang, with_terms=with_terms)))
            simple_book_part = r'|'.join(sorted(simple_books, key=len, reverse=True))  # Match longer titles first

            # re_string += ur'(?:^|[ ([{>,-]+)' if for_js else u''  # Why don't we check for word boundaries internally as well?
            # re_string += ur'(?:\u05d5?(?:\u05d1|\u05de|\u05dc|\u05e9|\u05d8|\u05d8\u05e9)?)' if for_js and lang == "he" else u'' # likewise leading characters in Hebrew?
            # re_string += ur'(' if for_js else
            re_string = r'(?P<title>'
            re_string += simple_book_part
            re_string += r')'
            re_string += r'($|[:., <]+)'
            self._title_regex_strings[key] = re_string

        return re_string

    #WARNING: Do NOT put the compiled re2 object into redis.  It gets corrupted.
    def all_titles_regex(self, lang="en", with_terms=False, citing_only=False):
        """
        :return: A regular expression object that will match any known title in the library in the provided language
        :param lang: "en" or "he"
        :param bool with_terms: Default False.  If True, include shared titles ('terms'). (Will have no effect if citing_only is True)
        :param citing_only: Match only those texts which have is_cited set to True
        :raise: InputError: if lang == "he" and commentary == True

        Uses re2 if available.  See https://github.com/Sefaria/Sefaria-Project/wiki/Regular-Expression-Engines
        """
        if citing_only:
            key = "citing_titles_regex_" + lang
        else:
            key = "all_titles_regex_" + lang
            key += "_terms" if with_terms else ""
        reg = self._title_regexes.get(key)
        if not reg:
            re_string = self.all_titles_regex_string(lang, with_terms, citing_only)
            try:
                reg = re.compile(re_string, max_mem=512 * 1024 * 1024)
            except TypeError:
                reg = re.compile(re_string)
            self._title_regexes[key] = reg
        return reg

    def ref_list(self):
        """
        :return: list of all section-level Refs in the library
        """
        section_refs = []
        for indx in self.all_index_records():
            try:
                section_refs += indx.all_section_refs()
            except Exception as e:
                logger.warning("Failed to get section refs for {}: {}".format(getattr(indx, "title", "unknown index"), e))
        return section_refs

    def get_term_dict(self, lang="en"):
        """
        :return: dict of shared titles that have an explicit ref
        :param lang: "he" or "en"
        """
        # key = "term_dict_" + lang
        # term_dict = self.local_cache.get(key)
        term_dict = self._term_ref_maps.get(lang)
        if not term_dict:
            self.build_term_mappings()
            term_dict = self._term_ref_maps.get(lang)

        return term_dict

    def build_term_mappings(self):
        """
           Build simple and full term mappings
           A full term mapping has the term name as the key, and the term as the value.
           A simple term mapping has the term name as the key, and a dictionary containing the English and Hebrew
           primary titles for the terms as the value.
        """
        self._simple_term_mapping = {}
        self._full_term_mapping = {}
        for term in TermSet():
            self._full_term_mapping[term.name] = term
            self._simple_term_mapping[term.name] = {"en": term.get_primary_title("en"),
                                                    "he": term.get_primary_title("he")}
            if hasattr(term, "ref"):
                for lang in self.langs:
                    for title in term.get_titles(lang):
                        self._term_ref_maps[lang][title] = term.ref

    def get_simple_term_mapping(self, rebuild=False):
        if rebuild or not self._simple_term_mapping:
            if not rebuild:
                self._simple_term_mapping = scache.get_shared_cache_elem('term_mapping')
            if rebuild or not self._simple_term_mapping:
                self.build_term_mappings()
                scache.set_shared_cache_elem('term_mapping', self._simple_term_mapping)
                self.set_last_cached_time()
        return self._simple_term_mapping

    def get_simple_term_mapping_json(self, rebuild=False):
        """
        Returns JSON representation of terms.
        """
        if rebuild or not self._simple_term_mapping_json:
            if not rebuild:
                self._simple_term_mapping_json = scache.get_shared_cache_elem('term_mapping_json')
            if rebuild or not self._simple_term_mapping_json:
                self._simple_term_mapping_json = json.dumps(self.get_simple_term_mapping(rebuild=rebuild), ensure_ascii=False)
                scache.set_shared_cache_elem('term_mapping_json', self._simple_term_mapping_json)
                self.set_last_cached_time()
        return self._simple_term_mapping_json

    def get_term(self, term_name):
        """
        Returns the full term, if mapping not present, builds the full term mapping.
        :param term_name: String
        :returns: full Term (Mongo Record)
        """
        if not self._full_term_mapping:
            self.build_term_mappings()
        return self._full_term_mapping.get(term_name) if term_name in self._full_term_mapping else Term().load({"name": term_name})



    def get_topic(self, slug):
        """
        Returns a dictionary containing the keys "en" and "he".
        The "en" field has a value of the topic's English primary title, and the "he" field has a
        value of the topic's Hebrew primary title.
        :param slug: String
        :returns: topic map for the given slug Dictionary
        """
        return self._topic_mapping[slug]

    def get_topic_mapping(self, rebuild=False):
        """
        Returns the topic mapping if it exists, if not rebuilds it and returns
        :param rebuild: Boolean (optional, default set to False)
        """
        tm = self._topic_mapping
        if not tm or rebuild:
            tm = self._build_topic_mapping()
        return tm

    def _build_topic_mapping(self):
        """
        Builds the topic mapping. The topic mapping is a dictionary with keys, where each key
        is a slug of a topic.
        That key contains the value of another dictionary, with the keys "en" and "he".
        The "en" field has a value of the topic's English primary title, and the "he" field has a
        value of the topic's Hebrew primary title.
        :returns: topic map for the given slug Dictionary
        """
        from .topic import Topic, TopicSet
        self._topic_mapping = {t.slug: {"en": t.get_primary_title("en"), "he": t.get_primary_title("he")} for t in TopicSet()}
        return self._topic_mapping

    def get_ref_resolver(self, rebuild=False):
        resolver = self._ref_resolver
        if not resolver or rebuild:
            resolver = self.build_ref_resolver()
        return resolver

    def build_ref_resolver(self):
        from .linker.match_template import MatchTemplateTrie
        from .linker.ref_resolver import RefResolver, TermMatcher
        from sefaria.model.schema import NonUniqueTermSet
        from sefaria.helper.linker import load_spacy_model

        logger.info("Loading Spacy Model")

        root_nodes = list(filter(lambda n: getattr(n, 'match_templates', None) is not None, self.get_index_forest()))
        alone_nodes = reduce(lambda a, b: a + b.index.get_referenceable_alone_nodes(), root_nodes, [])
        non_unique_terms = NonUniqueTermSet()
        self._ref_resolver = RefResolver(
            {k: load_spacy_model(v) for k, v in RAW_REF_MODEL_BY_LANG_FILEPATH.items() if v is not None},
            {k: load_spacy_model(v) for k, v in RAW_REF_PART_MODEL_BY_LANG_FILEPATH.items() if v is not None},
            {
                "en": MatchTemplateTrie('en', nodes=(root_nodes + alone_nodes), scope='alone'),
                "he": MatchTemplateTrie('he', nodes=(root_nodes + alone_nodes), scope='alone')
            },
            {
                "en": TermMatcher('en', non_unique_terms),
                "he": TermMatcher('he', non_unique_terms),
            }
        )
        return self._ref_resolver

    def get_index_forest(self):
        """
        :return: list of root Index nodes.
        """
        root_nodes = [i.nodes for i in self.all_index_records()]
        return root_nodes

    def all_index_records(self):
        """
        Returns an array of all index records
        """
        return [self._index_map[k] for k in list(self._index_title_maps["en"].keys())]

    def get_title_node_dict(self, lang="en"):
        """
        :param lang: "he" or "en"
        :return:  dictionary of string titles and the nodes that they point to.

        Does not include bare commentator names, like *Rashi*.
        """
        return self._title_node_maps[lang]

    # todo: handle terms
    def get_schema_node(self, title, lang=None):
        """
        :param string title:
        :param lang: "en" or "he"
        :return: a particular SchemaNode that matches the provided title and language
        :rtype: :class:`sefaria.model.schema.SchemaNode`
        """
        if not lang:
            lang = "he" if has_tibetan(title) else "en"
        title = title.replace("_", " ")
        return self.get_title_node_dict(lang).get(title)

    def citing_title_list(self, lang="en"):
        """
        :param lang: "he" or "en"
        :return: list of all titles that can be recognized as an inline citation
        """
        key = "citing-{}".format(lang)
        titles = self._full_title_lists.get(key)
        if not titles:
            titles = []
            for i in IndexSet({"is_cited": True}):
                titles.extend(self._index_title_maps[lang][i.title])
            self._full_title_lists[key] = titles
        return titles

    def full_title_list(self, lang="en", with_terms=False):
        """
        :param lang: "he" or "en"
        :param with_terms: if True, includes shared titles ('terms')
        :return: list of strings of all possible titles
        """
        key = lang
        key += "_terms" if with_terms else ""
        titles = self._full_title_lists.get(key)
        if not titles:
            titles = list(self.get_title_node_dict(lang).keys())
            if with_terms:
                titles += list(self.get_term_dict(lang).keys())
            self._full_title_lists[key] = titles
        return titles

    def build_text_titles_json(self, lang="en"):
        """
        :return: JSON of full texts list, (cached)
        """
        title_list = self.full_title_list(lang=lang)
        if lang == "en":
            toc_titles = self.get_toc_tree().flatten()
            secondary_list = list(set(title_list) - set(toc_titles))
            title_list = toc_titles + secondary_list
        return title_list

    def get_text_titles_json(self, lang="en", rebuild=False):
        """
        Returns the json text title list
        :param lang: String (optional, default set to 'en')
        :param rebuild: Boolean (optional, default set to False)
        """
        if rebuild or not self._full_title_list_jsons.get(lang):
            if not rebuild:
                self._full_title_list_jsons[lang] = scache.get_shared_cache_elem('books_'+lang+'_json')
            if rebuild or not self._full_title_list_jsons.get(lang):
                title_list = self.build_text_titles_json(lang=lang)
                title_list_json = json.dumps(title_list, ensure_ascii=False)
                self._full_title_list_jsons[lang] = title_list_json
                scache.set_shared_cache_elem('books_' + lang, title_list)
                scache.set_shared_cache_elem('books_'+lang+'_json', title_list_json)
                self.set_last_cached_time()
        return self._full_title_list_jsons[lang]

    def reset_text_titles_cache(self):
        """
        Resets the text titles for all languages by clearing the existing titles from the cache.
        """
        for lang in self.langs:
            scache.delete_shared_cache_elem('books_' + lang)
            scache.delete_shared_cache_elem('books_' + lang + '_json')

    def get_text_categories(self):
        """
        :return: List of all known text categories.
        """
        return IndexSet().distinct("categories")

    def get_indexes_in_category(self, category, include_dependant=False, full_records=False):
        """
        :param string category: Name of category
        :param bool include_dependant: If true includes records of Commentary and Targum
        :param bool full_records: If True will return the actual :class: 'IndexSet' otherwise just the titles
        :return: :class:`IndexSet` of :class:`Index` records in the specified category
        """

        if not include_dependant:
            q = {"categories": category, 'dependence': {'$in': [False, None]}}
        else:
            q = {"categories": category}

        return IndexSet(q) if full_records else IndexSet(q).distinct("title")

    def get_indexes_in_category_path(self, path: list, include_dependant=False, full_records=False) -> Union[IndexSet, list]:
        """
        :param list path: list of category names, starting from root.
        :param bool include_dependant: If true includes records of Commentary and Targum
        :param bool full_records: If True will return the actual :class: 'IndexSet' otherwise just the titles
        :return: :class:`IndexSet` of :class:`Index` records in the specified category path
        """
        q = {} if include_dependant else {'dependence': {'$in': [False, None]}}
        for icat, cat in enumerate(path):
            q[f'categories.{icat}'] = cat

        return IndexSet(q) if full_records else IndexSet(q).distinct("title")

    def get_indexes_in_corpus(self, corpus: str, include_dependant=False, full_records=False) -> Union[IndexSet, list]:
        q = {'corpora': corpus}
        if not include_dependant:
            q['dependence'] = {'$in': [False, None]}
        return IndexSet(q) if full_records else IndexSet(q).distinct("title")

    def get_indices_by_collective_title(self, collective_title, full_records=False):
        q = {'collective_title': collective_title}
        return IndexSet(q) if full_records else IndexSet(q).distinct("title")

    # TODO: add category filtering here or in another method?
    def get_dependant_indices(self, book_title=None, dependence_type=None, structure_match=False, full_records=False):
        """
        Replacement for all get commentary title methods
        :param book_title: Title of the base text. If book_title is None, returns all matching dependent texts
        :param dependence_type: none, "Commentary" or "Targum" - generally used to get Commentary and leave out Targum.  If none, returns all indexes.
        :param structure_match: If True, returns records that follow the base text structure
        :param full_records: If True, returns an IndexSet, if False returns list of titles.
        :return: IndexSet or List of titles.
        """
        if dependence_type:
            q = {'dependence': dependence_type}
        else:
            q = {'dependence': {'$exists': True}}
        if book_title:
            q['base_text_titles'] = book_title
        if structure_match:  # get only indices who's "base_text_mapping" is one that indicates it has the similar underlying schema as the base
            from sefaria.helper.link import AbstractStructureAutoLinker
            from sefaria.utils.util import get_all_subclass_attribute
            q['base_text_mapping'] = {'$in': get_all_subclass_attribute(AbstractStructureAutoLinker, "class_key")}
        return IndexSet(q) if full_records else IndexSet(q).distinct("title")

    def get_virtual_books(self, rebuild=False):
        if rebuild or not self._virtual_books:
            if not rebuild:
                self._virtual_books = scache.get_shared_cache_elem('virtualBooks')
            if rebuild or not self._virtual_books:
                self.build_virtual_books()
                scache.set_shared_cache_elem('virtualBooks', self._virtual_books)
                self.set_last_cached_time()
        return self._virtual_books

    def build_virtual_books(self):
        self._virtual_books = [index.title for index in IndexSet({'lexiconName': {'$exists': True}})]
        return self._virtual_books

    def get_titles_in_string(self, s, lang=None, citing_only=False):
        """
        Returns the titles found in the string.

        :param s: The string to search
        :param lang: "en" or "he"
        :return list: titles found in the string
        """
        if not lang:
            lang = "he" if has_tibetan(s) else "en"
        return [m.group('title') for m in self.all_titles_regex(lang, citing_only=citing_only).finditer(s)]

    def get_refs_in_string(self, st, lang=None, citing_only=False):
        """
        Returns a list of Ref objects derived from string

        :param string st: the input string
        :param lang: "he" or "en"
        :param citing_only: boolean whether to use only records explicitly marked as being referenced in text.
        :return: list of :class:`Ref` objects
            Order is not guaranteed
        """
        # todo: only match titles of content nodes

        refs = []
        if lang is None:
            lang = "he" if has_tibetan(st) else "en"
        if lang == "he":
            from sefaria.utils.hebrew import strip_nikkud
            st = strip_nikkud(st)
            unique_titles = set(self.get_titles_in_string(st, lang, citing_only))
            for title in unique_titles:
                try:
                    res = self._build_all_refs_from_string(title, st)
                    refs += res
                except AssertionError as e:
                    logger.info("Skipping Schema Node: {}".format(title))
                except TypeError as e:
                    logger.info("Error finding ref for {} in: {}".format(title, st))

        else:  # lang == "en"
            for match in self.all_titles_regex(lang, citing_only=citing_only).finditer(st):
                title = match.group('title')
                if not title:
                    continue
                try:
                    res = self._build_ref_from_string(title, st[match.start():])  # Slice string from title start
                    refs += res
                except AssertionError as e:
                    logger.info("Skipping Schema Node: {}".format(title))
                except InputError as e:
                    logger.info("Input Error searching for refs in string: {}".format(e))
                except TypeError as e:
                    logger.info("Error finding ref for {} in: {}".format(title, st))

        return refs

    def get_regex_and_titles_for_ref_wrapping(self, st, lang, citing_only=False):
        """
        Returns a compiled regex and dictionary of title:node correspondences to match the references in this string

        :param string st: the input string
        :param lang: "he" or "en"
        :param citing_only: boolean whether to use only records explicitly marked as being referenced in text
        :return: Compiled regex, dict of title:node correspondences

        """
        unique_titles = set(self.get_titles_in_string(st, lang, citing_only))
        title_nodes = {title: self.get_schema_node(title,lang) for title in unique_titles}
        all_reg = self.get_multi_title_regex_string(unique_titles, lang)
        reg = regex.compile(all_reg, regex.VERBOSE) if all_reg else None
        return reg, title_nodes

    def get_wrapped_refs_string(self, st, lang=None, citing_only=False, reg=None, title_nodes=None):
        """
        Returns a string with the list of Ref objects derived from string wrapped in <a> tags

        :param string st: the input string
        :param lang: "he" or "en"
        :param citing_only: boolean whether to use only records explicitly marked as being referenced in text
        :return: string:
        """
        return self.apply_action_for_all_refs_in_string(st, self._wrap_ref_match, lang, citing_only, reg, title_nodes)

    def apply_action_for_all_refs_in_string(self, st, action, lang=None, citing_only=None, reg=None, title_nodes=None):
        """

        @param st:
        @param action: function of the form `(ref, regex_match) -> Optional[str]`. return value will be used to replace regex_match in `st` if returned.
        @param lang:
        @param citing_only:
        @param reg:
        @param title_nodes:
        @return:
        """
        # todo: only match titles of content nodes
        if lang is None:
            lang = "he" if has_tibetan(st) else "en"

        if reg is None or title_nodes is None:
            reg, title_nodes = self.get_regex_and_titles_for_ref_wrapping(st, lang, citing_only)

        if reg is not None:
            sub_action = partial(self._apply_action_for_ref_match, title_nodes, lang, action)
            if lang == "en":
                return reg.sub(sub_action, st)
            else:
                outer_regex_str = r"[({\[].+?[)}\]]"
                outer_regex = regex.compile(outer_regex_str, regex.VERBOSE)
                return outer_regex.sub(lambda match: reg.sub(sub_action, match.group(0)), st)
        return st

    def get_multi_title_regex_string(self, titles, lang, for_js=False, anchored=False):
        """
        Capture title has to be true.
        :param titles:
        :param lang:
        :param for_js:
        :param anchored:
        :return:
        """
        nodes_by_address_type = defaultdict(list)
        regex_components = []

        for title in titles:
            try:
                node = self.get_schema_node(title, lang)
                nodes_by_address_type[tuple(node.addressTypes)] += [(title, node)]
            except AttributeError as e:
                # This chatter fills up the logs:
                # logger.warning(u"Library._wrap_all_refs_in_string() failed to create regex for: {}.  {}".format(title, e))
                continue

        if lang == "en" or for_js:  # Javascript doesn't support look behinds.
            for address_tuple, title_node_tuples in list(nodes_by_address_type.items()):
                node = title_node_tuples[0][1]
                titles = "|".join([regex.escape(tup[0]) for tup in title_node_tuples])
                regex_components += [node.full_regex(titles, lang, for_js=for_js, match_range=True, compiled=False, anchored=anchored, capture_title=True, escape_titles=False)]
            return "|".join(regex_components)

        if lang == "he":
            full_regex = ""
            for address_tuple, title_node_tuples in list(nodes_by_address_type.items()):
                node = title_node_tuples[0][1]
                titles = "|".join([regex.escape(tup[0]) for tup in title_node_tuples])

                regex_components += [r"(?:{}".format(r"(?P<title>{})".format(titles))  \
                           + node.after_title_delimiter_re \
                           + node.address_regex(lang, for_js=for_js, match_range=True) + ")"]

            all_interal = "|".join(regex_components)
            if all_interal:
                full_regex = r"""(?:
                    """ + all_interal + r"""
                    )
                    (?=\W|$)                                        # look ahead for non-word char
                    """
            return full_regex

    # do we want to move this to the schema node? We'd still have to pass the title...
    def get_regex_string(self, title, lang, for_js=False, anchored=False, capture_title=False, parentheses=False):
        """
        Given a book title, this function returns a regex for a Ref.
        This works for references not in Sefaria format (i.e. "See Genesis 2 3" as opposed to "Genesis 2:3",
        as well as for references in Sefaria format.
        If the language is 'en', it calls the full_regex() function which returns the regex, whereas for 'he' we
        limit the regex creation to content inside parenthesis to limit false positives (i.e. the phrase שבת לא תעשה
        could be caught by mistake as Shabbat 31)
        :param title: String
        :param lang: 'en' or 'he'
        :param for_js: Boolean (default set to False, optional)
        :param anchored: Boolean (default set to False, optional)
        :param capture_title: Boolean (default set to False, optional)
        :param parentheses: Boolean (default set to False, optional)
        """
        node = self.get_schema_node(title, lang)
        assert isinstance(node, JaggedArrayNode)  # Assumes that node is a JaggedArrayNode

        if lang == "en" or for_js:
            return node.full_regex(title, lang, for_js=for_js, match_range=True, compiled=False, anchored=anchored, capture_title=capture_title, parentheses=parentheses)
        elif lang == "he":
            return r"""(?<=							# look behind for opening brace
                    [({]										# literal '(', brace,
                    [^})]*										# anything but a closing ) or brace
                )
                """ + r"{}".format(r"(?P<title>{})".format(regex.escape(title)) if capture_title else regex.escape(title)) \
                   + node.after_title_delimiter_re \
                   + node.address_regex(lang, for_js=for_js, match_range=True) \
                   + r"""
                (?=\W|$)                                        # look ahead for non-word char
                (?=												# look ahead for closing brace
                    [^({]*										# match of anything but an opening '(' or brace
                    [)}]										# zero-width: literal ')' or brace
                )"""

    def _get_ref_from_match(self, ref_match, node, lang):
        sections = []
        toSections = []
        gs = ref_match.groupdict()
        for i in range(0, node.depth):
            gname = "a{}".format(i)
            if gs.get(gname) is not None:
                sections.append(node._addressTypes[i].toNumber(lang, gs.get(gname)))

        curr_address_index = len(sections) - 1  # start from the lowest depth matched in `sections` and go backwards
        for i in range(node.depth-1, -1, -1):
            toGname = "ar{}".format(i)
            if gs.get(toGname):
                toSections.append(node._addressTypes[curr_address_index].toNumber(lang, gs.get(toGname), sections=sections[curr_address_index]))
                curr_address_index -= 1

        if len(toSections) == 0:
            toSections = sections
        elif len(toSections) > len(sections):
            raise InputError("Match {} invalid. Length of toSections is greater than length of sections: {} > {}".format(ref_match.group(0), len(toSections), len(sections)))
        else:
            # pad toSections until it reaches the length of sections.
            while len(toSections) < len(sections):
                toSections.append(sections[len(sections) - len(toSections) - 1])
            toSections.reverse()
        # return seems to ignore all previous logic...
        # leaving this function in case errors that were thrown in above logic act as validation?
        return Ref(ref_match.group())

    def _build_ref_from_string(self, title=None, st=None, lang="en"):
        """
        Build a Ref object given a title and a string.  The title is assumed to be at position 0 in the string.
        This is used primarily for English matching.  Hebrew matching is done with _build_all_refs_from_string()
        :param title: The title used in the text to refer to this Index node
        :param st: The source text for this reference
        :return: Ref
        """
        return self._internal_ref_from_string(title, st, lang, stIsAnchored=True)

    def _build_all_refs_from_string(self, title=None, st=None, lang="he"):
        """
        Build all Ref objects for title found in string.  By default, only match what is found between braces (as in Hebrew).
        This is used primarily for Hebrew matching.  English matching uses _build_ref_from_string()
        :param title: The title used in the text to refer to this Index node
        :param st: The source text for this reference
        :return: list of Refs
        """
        return self._internal_ref_from_string(title, st, lang)

    def _internal_ref_from_string(self, title=None, st=None, lang=None, stIsAnchored=False, return_locations = False):
        node = self.get_schema_node(title, lang)
        if not isinstance(node, JaggedArrayNode):
            # TODO fix when not JaggedArrayNode
            # Assumes that node is a JaggedArrayNode
            return None

        refs = []
        try:
            re_string = self.get_regex_string(title, lang, anchored=stIsAnchored)
        except AttributeError as e:
            logger.warning(
                "Library._internal_ref_from_string() failed to create regex for: {}.  {}".format(title, e))
            return refs

        reg = regex.compile(re_string, regex.VERBOSE)
        if stIsAnchored:
            m = reg.match(st)
            matches = [m] if m else []
        else:
            matches = reg.finditer(st)
        for ref_match in matches:
            try:
                res = (self._get_ref_from_match(ref_match, node, lang), ref_match.span()) if return_locations else self._get_ref_from_match(ref_match, node, lang)
                refs.append(res)
            except (InputError, ValueError) as e:
                continue
        return refs

    @staticmethod
    def _wrap_ref_match(ref, match):
        return '<a class ="refLink" href="/{}" data-ref="{}">{}</a>'.format(ref.url(), ref.normal(), match.group(0))

    def _apply_action_for_ref_match(self, title_node_dict, lang, action, match):
        try:
            gs = match.groupdict()
            assert gs.get("title") is not None
            node = title_node_dict[gs.get("title")]
            ref = self._get_ref_from_match(match, node, lang)
            replacement = action(ref, match)
            if replacement is None:
                return match.group(0)
            return replacement
        except InputError as e:
            logger.warning("Wrap Ref Warning: Ref:({}) {}".format(match.group(0), str(e)))
            return match.group(0)

    @staticmethod
    def get_wrapped_named_entities_string(links, s):
        """
        Parallel to library.get_wrapped_refs_string
        Returns `s` with every link in `links` wrapped in an a-tag
        """
        if len(links) == 0:
            return s
        links.sort(key=lambda x: x.charLevelData['startChar'])

        # replace all mentions with `dummy_char` so they can later be easily replaced using re.sub()
        # this ensures char locations are preserved
        dummy_char = "█"
        char_list = list(s)
        start_char_to_slug = {}
        for link in links:
            start = link.charLevelData['startChar']
            end = link.charLevelData['endChar']
            mention = s[start:end]
            if mention != link.charLevelData['text']:
                # dont link if current text at startChar:endChar doesn't match text on link
                continue
            start_char_to_slug[start] = (mention, link.toTopic, getattr(link, 'unambiguousToTopic', None))
            char_list[start:end] = list(dummy_char*(end-start))
        dummy_text = "".join(char_list)

        def repl(match):
            try:
                mention, slug, unambiguous_slug = start_char_to_slug[match.start()]
            except KeyError:
                return match.group()
            link_slug = unambiguous_slug or slug
            return f"""<a href="/topics/{link_slug}" class="namedEntityLink" data-slug="{slug}">{mention}</a>"""
        return re.sub(fr"{dummy_char}+", repl, dummy_text)

    def category_id_dict(self, toc=None, cat_head="", code_head=""):
        """Returns a dict of unique category ids based on the ToC, with the
           values being the category IDs.
            :param toc: ToC object (optional, default is None)
            :param cat_head: String, (optional, default is "" - an empty string)
            :param code_head: String, (optional, default is "" - an empty string)
        """
        if toc is None:
            if not self._category_id_dict:
                self._category_id_dict = self.category_id_dict(self.get_toc())
            return self._category_id_dict

        d = {}

        for i, c in enumerate(toc):
            name = c["category"] if "category" in c else c["title"]
            if cat_head:
                key = "/".join([cat_head, name])
                val = code_head + format(i, '03')
            else:
                key = name
                val = "A" + format(i, '03')

            d[key] = val
            if "contents" in c:
                d.update(self.category_id_dict(c["contents"], key, val))

        return d

    def simplify_toc(self, lang=None, toc_node=None, path=None):
        """
        Simplifies the table of contents (ToC)
        :param lang: 'en' or 'he', default is None (optional)
        :param toc_node: ToC Node, default is None (optional)
        :param path: Node Path, default is None (optional)
        """
        is_root = toc_node is None and path is None
        toc_node = toc_node if toc_node else self.get_toc()
        path = path if path else []
        simple_nodes = []
        for x in toc_node:
            node_name = x.get("category", None) or x.get("title", None)
            node_path = path + [node_name]
            simple_node = {
                "name": node_name,
                "path": node_path
            }
            if "category" in x:
                if "contents" not in x:
                    continue
                simple_node["type"] = "category"
                simple_node["children"] = self.simplify_toc(lang, x["contents"], node_path)
            elif "title" in x:
                query = {"title": x["title"]}
                if lang:
                    query["language"] = lang
                simple_node["type"] = "index"
                simple_node["children"] = [{
                    "name": "{} ({})".format(v.versionTitle, v.language),
                    "path": node_path + ["{} ({})".format(v.versionTitle, v.language)],
                    "size": v.word_count(),
                    "type": "version"
                } for v in VersionSet(query)]
            simple_nodes.append(simple_node)

        if is_root:
            return {
                "name": "Whole Library" + " ({})".format(lang if lang else ""),
                "path": [],
                "children": simple_nodes
            }
        else:
            return simple_nodes

    def word_count(self, ref_or_cat, lang="he", dependents_regex=None):
        """
        :param ref_or_cat:
        :param lang:
        :param dependents_regex: string - filter dependents by those that have this string (treat this as a category)
        :return:
        """
        if isinstance(ref_or_cat, Ref):
            return ref_or_cat.word_count(lang)
        try:
            return Ref(ref_or_cat).word_count(lang)
        except InputError:
            if dependents_regex:
                raw_ins = library.get_indexes_in_category(ref_or_cat, True)
                ins = filter(lambda s: re.search(dependents_regex,s), raw_ins)
            else:
                ins = library.get_indexes_in_category(ref_or_cat)
            return sum([Ref(r).word_count(lang) for r in ins])

    def is_initialized(self):
        """
        Returns True if the following fields are initialized
            * self._toc_tree
            * self._full_auto_completer
            * self._ref_auto_completer
            * self._lexicon_auto_completer
            * self._cross_lexicon_auto_completer
        """

        # Given how the object is initialized and will always be non-null,
        # I will likely have to add fields to the object to be changed once

        # Avoid allocation here since it will be called very frequently
        are_autocompleters_ready = self._full_auto_completer_is_ready and self._ref_auto_completer_is_ready and self._lexicon_auto_completer_is_ready and self._cross_lexicon_auto_completer_is_ready
        is_initialized = self._toc_tree_is_ready and (DISABLE_AUTOCOMPLETER or are_autocompleters_ready)
        if not is_initialized:
            logger.warning({"message": "Application not fully initialized", "Current State": {
                "toc_tree_is_ready": self._toc_tree_is_ready,
                "full_auto_completer_is_ready": self._full_auto_completer_is_ready,
                "ref_auto_completer_is_ready": self._ref_auto_completer_is_ready,
                "lexicon_auto_completer_is_ready": self._lexicon_auto_completer_is_ready,
                "cross_lexicon_auto_completer_is_ready": self._cross_lexicon_auto_completer_is_ready,
            }})
        return is_initialized

    @staticmethod
    def get_top_categories(full_records=False):
        from sefaria.model.category import CategorySet
        return CategorySet({'depth': 1}) if full_records else CategorySet({'depth': 1}).distinct('path')


library = Library()


def prepare_index_regex_for_dependency_process(index_object, as_list=False):
    """
    :return string: Regular Expression which will find any titles that match this index title exactly, or more specifically.

    Simplified version of Ref.regex()
    """
    patterns = []
    patterns.append(r"$")   # exact match
    if index_object.nodes.has_titled_continuation():
        patterns.append(r"({}).".format(r"|".join(index_object.nodes.title_separators)))
    if index_object.nodes.has_numeric_continuation():
        patterns.append(r":")   # more granualar, exact match followed by :
        patterns.append(r" \d") # extra granularity following space

    escaped_book = re.escape(index_object.title)
    if as_list:
        return [r"^{}{}".format(escaped_book, p) for p in patterns]
    else:
        return r"^%s(%s)" % (escaped_book, "|".join(patterns))


def process_index_title_change_in_versions(indx, **kwargs):
    VersionSet({"title": kwargs["old"]}).update({"title": kwargs["new"]})


def process_index_title_change_in_dependant_records(indx, **kwargs):
    dependent_indices = library.get_dependant_indices(kwargs["old"], full_records=True)
    for didx in dependent_indices:
        pos = didx.base_text_titles.index(kwargs["old"])
        didx.base_text_titles.pop(pos)
        didx.base_text_titles.insert(pos, kwargs["new"])
        didx.save()

def process_index_title_change_in_sheets(indx, **kwargs):
    print("Cascading refs in sheets {} to {}".format(kwargs['old'], kwargs['new']))

    regex_list = [pattern.replace(re.escape(kwargs["new"]), re.escape(kwargs["old"]))
                for pattern in Ref(kwargs["new"]).regex(as_list=True)]
    ref_clauses = [{"includedRefs": {"$regex": r}} for r in regex_list]
    query = {"$or": ref_clauses }
    sheets = db.sheets.find(query)
    for sheet in sheets:
        sheet["includedRefs"] = [r.replace(kwargs["old"], kwargs["new"], 1) if re.search('|'.join(regex_list), r) else r for r in sheet.get("includedRefs", [])]
        sheet["expandedRefs"] = Ref.expand_refs(sheet["includedRefs"])
        for source in sheet.get("sources", []):
            if "ref" in source:
                source["ref"] = source["ref"].replace(kwargs["old"], kwargs["new"], 1) if re.search('|'.join(regex_list), source["ref"]) else source["ref"]
        db.sheets.save(sheet)


def process_index_delete_in_versions(indx, **kwargs):
    VersionSet({"title": indx.title}).delete()


def process_index_title_change_in_core_cache(indx, **kwargs):
    old_title = kwargs["old"]

    library.refresh_index_record_in_cache(indx, old_title=old_title)
    library.reset_text_titles_cache()

    if MULTISERVER_ENABLED:
        server_coordinator.publish_event("library", "refresh_index_record_in_cache", [indx.title, old_title])
    elif USE_VARNISH:
        from sefaria.system.varnish.wrapper import invalidate_title
        invalidate_title(old_title)


def process_index_change_in_core_cache(indx, **kwargs):
    if kwargs.get("is_new"):
        library.add_index_record_to_cache(indx)
        library.reset_text_titles_cache()

        if MULTISERVER_ENABLED:
            server_coordinator.publish_event("library", "add_index_record_to_cache", [indx.title])

    else:
        library.refresh_index_record_in_cache(indx)
        library.reset_text_titles_cache()

        if MULTISERVER_ENABLED:
            server_coordinator.publish_event("library", "refresh_index_record_in_cache", [indx.title])
        elif USE_VARNISH:
            from sefaria.system.varnish.wrapper import invalidate_title
            invalidate_title(indx.title)


def process_index_change_in_toc(indx, **kwargs):
    old_ref = kwargs.get('orig_vals').get('title') if kwargs.get('orig_vals') else None
    library.update_index_in_toc(indx, old_ref=old_ref)

    if MULTISERVER_ENABLED:
        server_coordinator.publish_event("library", "update_index_in_toc", [indx.title, old_ref])


def process_index_delete_in_toc(indx, **kwargs):
    library.delete_index_from_toc(indx)

    if MULTISERVER_ENABLED:
        server_coordinator.publish_event("library", "delete_index_from_toc", [indx.title, indx.categories])


def process_index_delete_in_core_cache(indx, **kwargs):
    library.remove_index_record_from_cache(indx)
    library.reset_text_titles_cache()

    if MULTISERVER_ENABLED:
        server_coordinator.publish_event("library", "remove_index_record_from_cache", [indx.title])
    elif USE_VARNISH:
        from sefaria.system.varnish.wrapper import invalidate_title
        invalidate_title(indx.title)


def reset_simple_term_mapping(o, **kwargs):
    library.get_simple_term_mapping(rebuild=True)

    if MULTISERVER_ENABLED:
        server_coordinator.publish_event("library", "build_term_mappings")


def rebuild_library_after_category_change(*args, **kwargs):
    library.rebuild(include_toc=True)

    if MULTISERVER_ENABLED:
        server_coordinator.publish_event("library", "rebuild", [True])
