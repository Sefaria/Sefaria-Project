# -*- coding: utf-8 -*-
"""
text.py
"""

import logging
logger = logging.getLogger(__name__)

import regex
import copy
import bleach
import json

try:
    import re2 as re
    re.set_fallback_notification(re.FALLBACK_WARNING)
except ImportError:
    logging.warning("Failed to load 're2'.  Falling back to 're' for regular expression parsing. See https://github.com/blockspeiser/Sefaria-Project/wiki/Regular-Expression-Engines")
    import re

from . import abstract as abst

import sefaria.system.cache as scache
from sefaria.system.exceptions import InputError, BookNameError, IndexSchemaError
from sefaria.utils.talmud import section_to_daf, daf_to_section
from sefaria.utils.hebrew import is_hebrew, decode_hebrew_numeral, encode_hebrew_numeral, hebrew_term
from sefaria.utils.util import list_depth
import sefaria.datatype.jagged_array as ja


"""
                ------------------------
                 Terms and Term Schemes
                ------------------------
"""


class Term(abst.AbstractMongoRecord):
    """
    A Term is a shared title node.  It can be referenced and used by many different Index nodes.
    Examples:  Noah, Perek HaChovel, Even HaEzer
    Terms that use the same TermScheme can be ordered.
    """
    collection = 'term'
    track_pkeys = True
    pkeys = ["name"]
    title_group = None

    required_attrs = [
        "name",
        "titles"
    ]
    optional_attrs = [
        "scheme",
        "order",
        "ref"
    ]

    def _set_derived_attributes(self):
        self.title_group = TitleGroup(self.titles)

    def _normalize(self):
        self.titles = self.title_group.titles

class TermSet(abst.AbstractMongoSet):
    recordClass = Term


class TermScheme(abst.AbstractMongoRecord):
    """
    A TermScheme is a category of terms.
    Example: Parsha, Perek
    """
    collection = 'term_scheme'
    track_pkeys = True
    pkeys = ["name"]

    required_attrs = [
        "name"
    ]
    optional_attrs = [

    ]


class TermSchemeSet(abst.AbstractMongoSet):
    recordClass = TermScheme


"""
                ---------------------------------
                 Index Schema Trees - Core Nodes
                ---------------------------------
"""


def build_node(index=None, serial=None):
    """
    Build a SchemaNode tree from serialized form.  Called recursively.
    :param index: The Index object that this tree is rooted in.
    :param serial: The serialized form of the subtree
    :return: SchemaNode
    """
    if serial.get("nodes"):
        return SchemaStructureNode(index, serial)
    elif serial.get("nodeType"):
        try:
            klass = globals()[serial.get("nodeType")]
        except KeyError:
            raise IndexSchemaError("No matching class for nodeType {}".format(serial.get("nodeType")))
        return klass(index, serial, serial.get("nodeParameters"))
    else:
        raise IndexSchemaError("Schema node has neither 'nodes' nor 'nodeType'")


class TitleGroup(object):
    """
    A collection of titles.  Used for titles of SchemaNodes, for Maps, and for Terms
    """

    def __init__(self, serial=None):
        self.titles = []
        self._primary_title = {}
        if serial:
            self.load(serial)

    def load(self, serial=None):
        if serial:
            self.titles = serial

    def primary_title(self, lang="en"):
        """
        Return the primary title for this node in the language specified
        :param lang: "en" or "he"
        :return: The primary title string or None
        """
        if self._primary_title.get(lang) is None:
            for t in self.titles:
                if t.get("lang") == lang and t.get("primary"):
                    self._primary_title[lang] = t.get("text")
                    break
        if not self._primary_title.get(lang):
            self._primary_title[lang] = ""

        return self._primary_title.get(lang)

    def all_node_titles(self, lang="en"):
        """
        :param lang: "en" or "he"
        :return: list of strings - the titles of this node
        """
        return [t["text"] for t in self.titles if t["lang"] == lang]

    def remove_title(self, text, lang):
        self.titles = [t for t in self.titles if not (t["lang"] == lang and t["text"] == text)]
        return self

    def add_title(self, text, lang, primary=False, replace_primary=False, presentation="combined"):
        """
        :param text: Text of the title
        :param language:  Language code of the title (e.g. "en" or "he")
        :param primary: Is this a primary title?
        :param replace_primary: must be true to replace an existing primary title
        :param presentation: The "presentation" field of a title indicates how it combines with earlier titles. Possible values:
            "combined" - in referencing this node, earlier titles nodes are prepended to this one (default)
            "alone" - this node is reference by this title alone
            "both" - this node is addressable both in a combined and a alone form.
        :return: the object
        """
        if any([t for t in self.titles if t["text"] == text and t["lang"] == lang]):  #already there
            if not replace_primary:
                return
            else:  #update this title as primary: remove it, then re-add below
                self.remove_title(text, lang)
        d = {
                "text": text,
                "lang": lang
        }

        if primary:
            d["primary"] = True

        if presentation == "alone" or presentation == "both":
            d["presentation"] = presentation

        has_primary = any([x for x in self.titles if x["lang"] == lang and x.get("primary")])
        if has_primary and primary:
            if not replace_primary:
                raise IndexSchemaError("Node {} already has a primary title.".format(self.primary_title()))

            old_primary = self.primary_title(lang)
            self.titles = [t for t in self.titles if t["lang"] != lang or not t.get("primary")]
            self.titles.append({"text": old_primary, "lang": lang})
            self._primary_title[lang] = None

        self.titles.append(d)
        return self


class SchemaNode(object):
    """
    A node in an Index Schema tree.
    """
    delimiter_re = ur"[,.: ]+"  # this doesn't belong here.  Does this need to be an arg?

    def __init__(self, index=None, serial=None):
        """
        Construct a SchemaNode
        :param index: The Index object that this tree is rooted in.
        :param serial: The serialized form of this subtree
        :return:
        """
        #set default values
        self.children = []  # Is this enough?  Do we need a dict for addressing?
        self.parent = None
        self.default = False
        self.key = None
        self.sharedTitle = None
        self.index = index
        self.checkFirst = None
        self.titles = None
        self._address = []
        self._primary_title = {}
        self._full_title = {}

        self._init_titles()

        if not serial:
            return

        titles = serial.get("titles", None)
        if titles:
            self.title_group.load(serial=titles)

        self.__dict__.update(serial)
        try:
            del self.__dict__["titles"]
        except KeyError:
            pass

        self._process_terms()

        #if self.titles:
            #process titles into more digestable format
            #is it worth caching this on the term nodes?

    def validate(self):
        if not getattr(self, "key", None):
            raise IndexSchemaError("Schema node missing key")

        if getattr(self, "nodes", None) and (getattr(self, "nodeType", None) or getattr(self, "nodeParameters", None)):
            raise IndexSchemaError("Schema node {} must be either a structure node or a content node.".format(self.key))

        if not self.default and not self.sharedTitle and not self.get_titles():
            raise IndexSchemaError("Schema node {} must have titles, a shared title node, or be default".format(self.key))

        if self.default and (self.get_titles() or self.sharedTitle):
            raise IndexSchemaError("Schema node {} - default nodes can not have titles".format(self.key))

        if self.sharedTitle and Term().load({"name": self.sharedTitle}).titles != self.get_titles():
            raise IndexSchemaError("Schema node {} with sharedTitle can not have explicit titles".format(self.key))

        if not self.default and not self.primary_title("en"):
            raise IndexSchemaError("Schema node {} missing primary English title".format(self.key))

        #if not self.default and not self.primary_title("he"):
        #    raise IndexSchemaError("Schema node {} missing primary Hebrew title".format(self.key))

        if self.default and self.key != "default":
            raise IndexSchemaError("'default' nodes need to have key name 'default'")

    def create_content(self, callback=None, *args, **kwargs):
        """
        Tree visitor for building content trees based on this Index tree - used for counts and versions
        Callback is called for content nodes only.
        :param callback:
        :return:
        """
        pass

    def create_skeleton(self):
        return self.create_content(None)

    def visit_content(self, callback, *contents, **kwargs):
        """
        Tree visitor for traversing content nodes of existing content trees based on this Index tree and passing them to callback.
        Outputs a content tree.
        Callback is called for content nodes only.
        :param contents: one tree or many
        :param callback:
        :return:
        """
        pass

    def visit_structure(self, callback, content, **kwargs):
        """
        Tree visitor for traversing an existing structure ndoes of content trees based on this Index and passing them to callback.
        Traverses from bottom up, with intention that this be used to aggregate content from content nodes up.
        Modifies contents in place.
        :param callback:
        :param args:
        :param kwargs:
        :return:
        """
        pass

    def get_content_nodes(self):
        """
        :return: list of all content nodes
        """
        pass

    '''         Title Group pass through methods    '''
    def _init_titles(self):
        self.title_group = TitleGroup()

    def get_titles(self):
        return getattr(self.title_group, "titles", None)

    def primary_title(self, lang="en"):
        """
        Return the primary title for this node in the language specified
        :param lang: "en" or "he"
        :return: The primary title string or None
        """
        return self.title_group.primary_title(lang)

    def all_node_titles(self, lang="en"):
        """
        :param lang: "en" or "he"
        :return: list of strings - the titles of this node
        """
        return self.title_group.all_node_titles(lang)

    def remove_title(self, text, lang):
        return self.title_group.remove_title(text, lang)

    def add_title(self, text, lang, primary=False, replace_primary=False, presentation="combined"):
        """
        :param text: Text of the title
        :param language:  Language code of the title (e.g. "en" or "he")
        :param primary: Is this a primary title?
        :param replace_primary: must be true to replace an existing primary title
        :param presentation: The "presentation" field of a title indicates how it combines with earlier titles. Possible values:
            "combined" - in referencing this node, earlier titles nodes are prepended to this one (default)
            "alone" - this node is reference by this title alone
            "both" - this node is addressable both in a combined and a alone form.
        :return: the object
        """
        return self.title_group.add_title(text, lang, primary, replace_primary, presentation)


    '''         Title Composition Methods       '''
    def all_tree_titles(self, lang="en"):
        """
        :param lang: "en" or "he"
        :return: list of strings - all possible titles within this subtree
        """
        return self.title_dict(lang).keys()

    def title_dict(self, lang="en", baselist=[]):
        """
        Recursive function that generates a map from title to node
        :param node: the node to start from
        :param lang: "en" or "he"
        :param baselist: list of starting strings that lead to this node
        :return: map from title to node
        """
        title_dict = {}
        thisnode = self

        #this happens on the node
        #if node.hasTitleScheme():
        #        this_node_titles = node.getSchemeTitles(lang)
        #else:

        this_node_titles = [title["text"] for title in self.get_titles() if title["lang"] == lang and title.get("presentation") != "alone"]
        if baselist:
            node_title_list = [baseName + ", " + title for baseName in baselist for title in this_node_titles]
        else:
            node_title_list = this_node_titles

        alone_node_titles = [title["text"] for title in self.get_titles() if title["lang"] == lang and title.get("presentation") == "alone" or title.get("presentation") == "both"]
        node_title_list += alone_node_titles

        if self.has_children():
            for child in self.children:
                if child.is_default():
                    thisnode = child
                else:
                    title_dict.update(child.title_dict(lang, node_title_list))

        for title in node_title_list:
            title_dict[title] = thisnode

        return title_dict

    def full_title(self, lang="en"):
        """
        :param lang: "en" or "he"
        :return string: The full title of this node, from the root node.
        """
        if not self._full_title.get(lang):
            if self.parent:
                self._full_title[lang] = self.parent.full_title(lang) + ", " + self.primary_title(lang)
            else:
                self._full_title[lang] = self.primary_title(lang)
        return self._full_title[lang]

    def add_shared_term(self, term):
        self.sharedTitle = term
        self._process_terms()

    def _process_terms(self):
        if self.sharedTitle:
            try:
                term = Term().load({"name": self.sharedTitle})
                self.title_group = term.title_group
            except Exception, e:
                raise IndexSchemaError("Failed to load term named {}. {}".format(self.sharedTitle, e))

    def serialize(self, callback=None):
        """
        :param callback: function applied to dictionary beforce it's returned.  Invoked on concrete nodes, not the abstract level.
        :return string: serialization of the subtree rooted in this node
        """
        d = {}
        d["key"] = self.key
        if self.default:
            d["default"] = True
        elif self.sharedTitle:
            d["sharedTitle"] = self.sharedTitle
        else:
            d["titles"] = self.get_titles()
        if self.checkFirst:
            d["checkFirst"] = self.checkFirst
        return d

    def regex(self, lang):
        """
        :return: string - regular expression part to match references for this node
        """
        return ""

    def append(self, node):
        """
        Append node to this node
        :param node: the node to be appended to this node
        :return:
        """
        self.children.append(node)
        node.parent = self
        return self

    def append_to(self, node):
        """
        Append this node to another node
        :param node: the node to append this node to
        :return:
        """
        node.append(self)
        return self

    def has_children(self):
        """
        :return bool: True if this node has children
        """
        return bool(self.children)

    #used?
    def siblings(self):
        """
        :return list: The sibling nodes of this node
        """
        if self.parent:
            return [x for x in self.parent.children if x is not self]
        else:
            return None

    #http://stackoverflow.com/a/14692747/213042
    #http://stackoverflow.com/a/16300379/213042
    def address(self):
        """
        Returns a list of keys to uniquely identify and to access this node.
        :return list:
        """
        if not self._address:
            if self.parent:
                self._address = self.parent.address() + [self.key]
            else:
                self._address = [self.key]

        return self._address

    def version_address(self):
        """
        In a version storage context, the first key is not used.  Traversal starts from position 1.
        :return:
        """
        return self.address()[1:]

    def is_default(self):
        """
        Is this node a default node, meaning, do references to its parent cascade to this node?
        :return bool:
        """
        return self.default

    def is_flat(self):
        """
        Is this node a flat tree, with no parents or children?
        :return bool:
        """
        return not self.parent and not self.children

    """ String Representations """
    def __str__(self):
        return self.full_title("en")

    def __repr__(self):  # Wanted to use orig_tref, but repr can not include Unicode
        return self.__class__.__name__ + "('" + self.full_title("en") + "')"

    def __eq__(self, other):
        return self.address() == other.address()

    def __ne__(self, other):
        return not self.__eq__(other)


class SchemaStructureNode(SchemaNode):
    def __init__(self, index=None, serial=None):
        super(SchemaStructureNode, self).__init__(index, serial)
        if getattr(self, "nodes", None) is not None:
            for node in self.nodes:
                self.append(build_node(index, node))
            del self.nodes

    def validate(self):
        super(SchemaStructureNode, self).validate()
        if self.has_children() and len([c for c in self.children if c.default]) > 1:
            raise IndexSchemaError("Schema Structure Node {} has more than one default child.".format(self.key))
        for c in self.children:
            c.validate()

    def serialize(self, callback=None):
        d = super(SchemaStructureNode, self).serialize(callback)
        d["nodes"] = []
        for n in self.children:
            d["nodes"].append(n.serialize(callback))
        if callback:
            callback(d)
        return d

    def create_content(self, callback=None, *args, **kwargs):
        return {node.key: node.create_content(callback, *args, **kwargs) for node in self.children}

    def visit_content(self, callback, *contents, **kwargs):
        dict = {}
        for node in self.children:
            # todo: abstract out or put in helper the below reduce
            c = [tree[node.key] for tree in contents]
            dict[node.key] = node.visit_content(callback, *c, **kwargs)
        return dict

    def visit_structure(self, callback, content, **kwargs):
        for node in self.children:
            node.visit_structure(callback, content)
        callback(self, content.content_node(self), **kwargs)
        return dict

    def get_content_nodes(self):
        nodes = []
        for node in self.children:
            nodes += node.get_content_nodes
        return nodes


class SchemaContentNode(SchemaNode):
    required_param_keys = []
    optional_param_keys = []

    def __init__(self, index=None, serial=None, parameters=None):
        if parameters:
            for key, value in parameters.items():
                setattr(self, key, value)
        super(SchemaContentNode, self).__init__(index, serial)

    def validate(self):
        super(SchemaContentNode, self).validate()
        for k in self.required_param_keys:
            if getattr(self, k, None) is None:
                raise IndexSchemaError("Missing Parameter '{}' in {} '{}'".format(k, self.__class__.__name__, self.key))

    def serialize(self, callback=None):
        d = super(SchemaContentNode, self).serialize(callback)
        d["nodeType"] = self.__class__.__name__
        if self.required_param_keys + self.optional_param_keys:
            d["nodeParameters"] = {k: getattr(self, k) for k in self.required_param_keys + self.optional_param_keys if getattr(self, k, None) is not None}
        if callback:
            callback(d)
        return d

    def create_content(self, callback=None, *args, **kwargs):
        if not callback:
            return None
        return callback(self, *args, **kwargs)

    def visit_content(self, callback, *contents, **kwargs):
        return self.create_content(callback, *contents, **kwargs)

    def visit_structure(self, callback, *contents, **kwargs):
        return

    def get_content_nodes(self):
        return [self]

    def append(self, node):
        raise IndexSchemaError("Can not append to ContentNode {}".format(self.key or "root"))


"""
                ------------------------------------
                 Index Schema Trees - Content Nodes
                ------------------------------------
"""

class JaggedArrayNode(SchemaContentNode):
    required_param_keys = ["depth", "addressTypes", "sectionNames"]
    optional_param_keys = ["lengths"]

    def __init__(self, index=None, serial=None, parameters=None):
        """
        depth: Integer depth of this JaggedArray
        address_types: A list of length (depth), with string values indicating class names for address types for each level
        section_names: A list of length (depth), with string values of section names for each level
        e.g.:
        {
          "depth": 2,
          "addressTypes": ["Integer","Integer"],
          "sectionNames": ["Chapter","Verse"],
          "lengths": [12, 122]
        }
        """
        super(JaggedArrayNode, self).__init__(index, serial, parameters)
        self._addressTypes = []
        for i, atype in enumerate(getattr(self, "addressTypes", [])):
            try:
                klass = globals()["Address" + atype]
            except KeyError:
                raise IndexSchemaError("No matching class for addressType {}".format(atype))

            if i == 0 and getattr(self, "lengths", None) and len(self.lengths) > 0:
                self._addressTypes.append(klass(i, self.lengths[i]))
            else:
                self._addressTypes.append(klass(i))

    def address_class(self, depth):
        return self._addressTypes[depth]

    def validate(self):
        super(JaggedArrayNode, self).validate()
        for p in ["addressTypes", "sectionNames"]:
            if len(getattr(self, p)) != self.depth:
                raise IndexSchemaError("Parameter {} in {} {} does not have depth {}".format(p, self.__class__.__name__, self.key, self.depth))

    def regex(self, lang, **kwargs):
        reg = self._addressTypes[0].regex(lang, "a0", **kwargs)

        if not self._addressTypes[0].stop_parsing(lang):
            for i in range(1, self.depth):
                reg += u"(" + self.delimiter_re + self._addressTypes[i].regex(lang, "a{}".format(i), **kwargs) + u")"
                if not kwargs.get("strict", False):
                    reg += u"?"

        reg += ur"(?=\W|$)"
        return reg


class JaggedArrayCommentatorNode(JaggedArrayNode):
    """
    Given a commentatory record and a content node, build a content node for this commentator on this node.
    Assumes: content node is a Jagged_Array_node
    This relationship between this and the CommentatorIndex class needs to be sharpened.  Currently assumes flat structure.
    """
    connector = {
            "en": " on ",
            "he": u" על "
        }

    def __init__(self, commentor_index, basenode):
        assert commentor_index.is_commentary(), "Non-commentator index {} passed to JaggedArrayCommentatorNode".format(commentor_index.title)
        self.basenode = basenode
        parameters = {
            "addressTypes": basenode.addressTypes + ["Integer"],
            "sectionNames": basenode.sectionNames + ["Comment"],
            "depth": basenode.depth + 1
        }
        if getattr(basenode, "lengths", None):
            parameters["lengths"] = basenode.lengths
        super(JaggedArrayCommentatorNode, self).__init__(commentor_index, {}, parameters)

        self.key = self.full_title("en")

        for lang in ["he", "en"]:
            self.title_group.add_title(self.full_title(lang), lang, primary=True)
            for t in self.all_node_titles(lang):
                self.title_group.add_title(t, lang)

    def full_title(self, lang):
        base = self.basenode.full_title(lang)
        if lang == "en":
            cname = self.index.commentator
        elif lang == "he" and getattr(self.index, "heCommentator", None):
            cname = self.index.heCommentator
        else:
            logger.warning("No Hebrew title for {}".format(self.index.commentator))
            return base
        return cname + self.connector[lang] + base

    def all_node_titles(self, lang="en"):
        baselist = self.basenode.all_node_titles(lang)
        if lang == "en":
            cnames = self.index.c_index.titleVariants
        elif lang == "he":
            cnames = getattr(self.index.c_index, "heTitleVariants", None)
            if not cnames:
                return baselist
        return [c + self.connector[lang] + base for c in cnames for base in baselist]

    def all_tree_titles(self, lang="en"):
        baselist = self.basenode.all_tree_titles(lang)
        if lang == "en":
            cnames = self.index.c_index.titleVariants
        elif lang == "he":
            cnames = getattr(self.index.c_index, "heTitleVariants", None)
            if not cnames:
                return baselist
        return [c + self.connector[lang] + base for c in cnames for base in baselist]

    def primary_title(self, lang="en"):
        return self.full_title(lang)


class StringNode(JaggedArrayNode):
    def __init__(self, index=None, serial=None, parameters=None):
        super(StringNode, self).__init__(index, serial, parameters)
        self.depth = 0
        self.addressTypes = []
        self.sectionNames = []

    def serialize(self, callback=None):
        d = super(StringNode, self).serialize(callback)
        d["nodeType"] = "JaggedArrayNode"
        return d
"""
                ------------------------------------
                 Index Schema Trees - Address Types
                ------------------------------------
"""


class AddressType(object):
    """
    Defines a scheme for referencing and addressing a level of a Jagged Array.
    Used by JaggedArrayNode
    """
    section_patterns = {
        'he': None,
        'en': None
    }

    def __init__(self, order, length=None):
        self.order = order
        self.length = length

    def regex(self, lang, group_id=None, **kwargs):
        """
        The regular expression part that matches this address reference, wrapped with section names, if provided
        :param lang: "en" or "he"
        :param group_id: The id of the regular expression group the this match will be catured in
        :param kwargs: 'strict' kwarg indicates that section names are required to match
        :return string: regex component
        """
        try:
            if self.section_patterns[lang]:
                strict = kwargs.get("strict", False)
                reg = self.section_patterns[lang]
                if not strict:
                    reg += u"?"
                reg += self._core_regex(lang, group_id)
                return reg
            else:
                return self._core_regex(lang, group_id)
        except KeyError:
            raise Exception("Unknown Language passed to AddressType: {}".format(lang))

    def _core_regex(self, lang, group_id=None):
        """
        The regular expression part that matches this address reference
        :param lang: "en" or "he"
        :param group_id: The id of the regular expression group the this match will be catured in
        :return string: regex component
        """
        pass

    @staticmethod
    def hebrew_number_regex():
        """
        Regular expression component to capture a number expressed in Hebrew letters
        :return string:
        """
        return ur"""                                    # 1 of 3 styles:
        ((?=\p{Hebrew}+(?:"|\u05f4|'')\p{Hebrew})    # (1: ") Lookahead:  At least one letter, followed by double-quote, two single quotes, or gershayim, followed by  one letter
                \u05ea*(?:"|\u05f4|'')?				    # Many Tavs (400), maybe dbl quote
                [\u05e7-\u05ea]?(?:"|\u05f4|'')?	    # One or zero kuf-tav (100-400), maybe dbl quote
                [\u05d8-\u05e6]?(?:"|\u05f4|'')?	    # One or zero tet-tzaddi (9-90), maybe dbl quote
                [\u05d0-\u05d8]?					    # One or zero alef-tet (1-9)															#
            |(?=\p{Hebrew})						    # (2: no punc) Lookahead: at least one Hebrew letter
                \u05ea*								    # Many Tavs (400)
                [\u05e7-\u05ea]?					    # One or zero kuf-tav (100-400)
                [\u05d8-\u05e6]?					    # One or zero tet-tzaddi (9-90)
                [\u05d0-\u05d8]?					    # One or zero alef-tet (1-9)
            |\p{Hebrew}['\u05f3]					    # (3: ') single letter, followed by a single quote or geresh
        )"""

    def stop_parsing(self, lang):
        """
        If this is true, the regular expression will stop parsing at this address level for this language
        :param lang: "en" or "he"
        :return bool:
        """
        return False

    def toIndex(self, lang, s):
        """
        Return the array index indicated by s in this address scheme
        :param s: The address component
        :param lang: "en" or "he"
        :return int:
        """
        pass

    def format_count(self, name, number):
        return {name: number}

    """
    def toString(self, lang, i):
        return i
    """

class AddressTalmud(AddressType):
    section_patterns = {
        "en": None,
        "he": ur"(\u05d3[\u05e3\u05e4\u05f3']\s+)"			# Daf, spelled with peh, peh sofit, geresh, or single quote
    }

    def _core_regex(self, lang, group_id=None):
        if group_id:
            reg = ur"(?P<" + group_id + ur">"
        else:
            reg = ur"("

        if lang == "en":
            reg += ur"\d+[ab]?)"
        elif lang == "he":
            reg += self.hebrew_number_regex() + ur'''([.:]|[,\s]+(?:\u05e2(?:"|\u05f4|''))?[\u05d0\u05d1])?)'''

        return reg

    def stop_parsing(self, lang):
        if lang == "he":
            return True
        return False

    def toIndex(self, lang, s):
        if lang == "en":
            try:
                if s[-1] in ["a", "b"]:
                    amud = s[-1]
                    daf = int(s[:-1])
                else:
                    amud = "a"
                    daf = int(s)
            except ValueError:
                raise InputError(u"Couldn't parse Talmud reference: {}".format(s))

            if self.length and daf > self.length:
                #todo: Catch this above and put the book name on it.  Proably change Exception type.
                raise InputError(u"{} exceeds max of {} dafs.".format(daf, self.length))

            indx = daf * 2
            if amud == "a":
                indx -= 1
            return indx
        elif lang == "he":
            num = re.split("[.:,\s]", s)[0]
            daf = decode_hebrew_numeral(num) * 2
            if s[-1] == ":" or (
                    s[-1] == u"\u05d1"    #bet
                        and
                    ((len(s) > 2 and s[-2] in ", ")  # simple bet
                     or (len(s) > 4 and s[-3] == u'\u05e2')  # ayin"bet
                     or (len(s) > 5 and s[-4] == u"\u05e2")  # ayin''bet
                    )
            ):
                return daf  # amud B
            return daf - 1

            #if s[-1] == "." or (s[-1] == u"\u05d0" and len(s) > 2 and s[-2] in ",\s"):

    @staticmethod
    def toStr(lang, i):
        i += 1
        daf = i / 2

        if lang == "en":
            if i > daf * 2:
                daf = "%db" % daf
            else:
                daf = "%da" % daf

        elif lang == "he":
            if i > daf * 2:
                daf = ("%s " % encode_hebrew_numeral(daf)) + u"\u05D1"
            else:
                daf = ("%s " % encode_hebrew_numeral(daf)) + u"\u05D0"

        return daf

    def format_count(self, name, number):
        if name == "Daf":
            return {
                "Amud": number,
                "Daf": number / 2
            }
        else: #shouldn't get here
            return {name: number}


class AddressInteger(AddressType):
    def _core_regex(self, lang, group_id=None):
        if group_id:
            reg = ur"(?P<" + group_id + ur">"
        else:
            reg = ur"("

        if lang == "en":
            reg += ur"\d+)"
        elif lang == "he":
            reg += self.hebrew_number_regex() + ur")"

        return reg

    def toIndex(self, lang, s):
        if lang == "en":
            return int(s)
        elif lang == "he":
            return decode_hebrew_numeral(s)


class AddressPerek(AddressInteger):
    section_patterns = {
        "en": None,
        "he": ur"""(?:
            \u05e4(?:"|\u05f4|'')?                  # Peh (for 'perek') maybe followed by a quote of some sort
            |\u05e4\u05e8\u05e7\s*                  # or 'perek' spelled out, followed by space
        )"""
    }


class AddressMishnah(AddressInteger):
    section_patterns = {
        "en": None,
        "he": ur"""(?:
            (?:\u05de\u05e9\u05e0\u05d4\s)			# Mishna spelled out, with a space after
            |(?:\u05de(?:"|\u05f4|'')?)				# or Mem (for 'mishna') maybe followed by a quote of some sort
        )"""
    }
"""
                ----------------------------------
                 Index, IndexSet, CommentaryIndex
                ----------------------------------
"""


class AbstractIndex(object):
    pass


class Index(abst.AbstractMongoRecord, AbstractIndex):
    collection = 'index'
    history_noun = 'index'
    criteria_field = 'title'
    criteria_override_field = 'oldTitle'  # used when primary attribute changes. field that holds old value.
    second_save = True
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
        "maps",               # optional for old style and new
        "mapSchemes",         # optional for new style
        "order",              # optional for old style and new
        "length",             # optional for old style
        "lengths",            # optional for old style
        "transliteratedTitle" # optional for old style
    ]

    def is_new_style(self):
        return bool(getattr(self, "nodes", None))

    def contents(self, support_v2=False):
        if not getattr(self, "nodes", None) or support_v2:
            return super(Index, self).contents()
        return self.legacy_form()

    def _saveable_attrs(self):
        d = {k: getattr(self, k) for k in self._saveable_attr_keys() if hasattr(self, k)}
        if getattr(self, "nodes", None):
            d["schema"] = self.nodes.serialize()
        return d

    def is_commentary(self):
        return self.categories[0] == "Commentary"

    def all_titles(self, lang):
        if self.nodes:
            return self.nodes.all_tree_titles(lang)
        else:
            return None  # Handle commentary case differently?

    def get_title(self, lang="en"):
        if self.is_new_style():
            return self.nodes.primary_title(lang)
        else:
            if lang == "en":
                return self.title
            else:
                return getattr(self, "heTitle", None)

    #todo: handle lang
    def get_maps(self):
        """
        Returns both those maps explicitly defined on this node and those derived from a term scheme
        """
        return getattr(self, "maps", [])
        #todo: term schemes

    def load_from_dict(self, d, is_init=False):
        if not d.get("categories"):
            raise InputError(u"Please provide category for Index record.")

        # Data is being loaded from dict in old format, rewrite to new format
        # Assumption is that d has a complete title collection
        if "schema" not in d and d["categories"][0] != "Commentary":
            node = getattr(self, "nodes", None)
            if node:
                node._init_titles()
            else:
                node = JaggedArrayNode()

            node.key = d.get("title")

            sn = d.pop("sectionNames", None)
            if sn:
                node.sectionNames = sn
                node.depth = len(node.sectionNames)
            else:
                raise InputError(u"Please specify section names for Index record.")

            if d["categories"][0] == "Talmud":
                node.addressTypes = ["Talmud", "Integer"]
                if d["categories"][1] == "Bavli" and d.get("heTitle"):
                    node.checkFirst = {"he": u"משנה" + " " + d.get("heTitle")}
            elif d["categories"][0] == "Mishnah":
                node.addressTypes = ["Perek", "Mishnah"]
            else:
                node.addressTypes = ["Integer" for x in range(node.depth)]

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

    def _set_derived_attributes(self):
        if getattr(self, "schema", None):
            self.nodes = build_node(self, self.schema)
            self.nodes.validate()
        else:
            self.nodes = None

    def _normalize(self):
        self.title = self.title.strip()
        self.title = self.title[0].upper() + self.title[1:]

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
        if any((c in '.-\\/') for c in self.title):
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
                for title in self.all_titles(lang):
                    if self.all_titles(lang).count(title) > 1:
                        raise InputError(u'The title {} occurs twice in this Index record'.format(title))
                    existing = library.get_schema_node(title, lang)
                    if existing and not self.same_record(existing.index) and existing.index.title != self.pkeys_orig_values.get("title"):
                        raise InputError(u'A text called "{}" already exists.'.format(title))

        # Make sure all title variants are unique
        if getattr(self, "titleVariants", None):
            for variant in self.titleVariants:
                existing = Index().load({"titleVariants": variant})
                if existing and not self.same_record(existing) and existing.title != self.pkeys_orig_values.get("title"):
                    #if not getattr(self, "oldTitle", None) or existing.title != self.oldTitle:
                    raise InputError(u'A text called "{}" already exists.'.format(variant))

        return True

    def _prepare_second_save(self):
        if getattr(self, "maps", None) is None:
            self.maps = []
        for i in range(len(self.maps)):
            nref = Ref(self.maps[i]["to"]).normal()
            if not nref:
                raise InputError(u"Couldn't understand text reference: '{}'.".format(self.maps[i]["to"]))
            lang = "en" #todo: get rid of this assumption
            existing = library.get_schema_node(self.maps[i]["from"], lang)
            if existing and not self.same_record(existing.index) and existing.index.title != self.pkeys_orig_values.get("title"):
                raise InputError(u"'{}' cannot be a shorthand name: a text with this title already exisits.".format(nref))
            self.maps[i]["to"] = nref

    def toc_contents(self):
        toc_contents_dict = {
            "title": self.get_title(),
            "heTitle": self.get_title("he"),
            "categories": self.categories
        }
        if hasattr(self,"order"):
            toc_contents_dict["order"] = self.order
        return toc_contents_dict



    def legacy_form(self):
        """
        :return: Returns an Index object as a flat dictionary, in version one form.
        :raise: Expction if the Index can not be expressed in the old form
        """
        if not self.nodes.is_flat():
            raise InputError("Index record {} can not be converted to legacy API form".format(self.title))

        d = {
            "title": self.title,
            "categories": self.categories,
            "titleVariants": self.nodes.all_node_titles("en"),
            "sectionNames": self.nodes.sectionNames,
            "heSectionNames": map(hebrew_term, self.nodes.sectionNames),
            "textDepth": len(self.nodes.sectionNames)
        }

        if getattr(self, "maps", None):
            d["maps"] = self.maps  #keep an eye on this.  Format likely to change.
        if getattr(self, "order", None):
            d["order"] = self.order
        if getattr(self.nodes, "lengths", None):
            d["lengths"] = self.nodes.lengths
            d["length"] = self.nodes.lengths[0]
        if self.nodes.primary_title("he"):
            d["heTitle"] = self.nodes.primary_title("he")
        if self.nodes.all_node_titles("he"):
            d["heTitleVariants"] = self.nodes.all_node_titles("he")
        else:
            d["heTitleVariants"] = []

        return d


class IndexSet(abst.AbstractMongoSet):
    recordClass = Index


class CommentaryIndex(AbstractIndex):
    """
    A virtual Index for commentary Versions.
    """
    def __init__(self, commentor_name, book_name):
        """
        :param commentor_name: A title variant of a commentator :class:Index record
        :param book_name:  A title variant of a book :class:Index record
        :return:
        """
        self.c_index = Index().load({
            "titleVariants": commentor_name,
            "categories.0": "Commentary"
        })
        if not self.c_index:
            raise BookNameError(u"No commentor named '{}'.".format(commentor_name))

        self.b_index = get_index(book_name)

        if not self.b_index:
            raise BookNameError(u"No book named '{}'.".format(book_name))

        if self.b_index.is_commentary():
            raise BookNameError(u"We don't yet support nested commentaries '{} on {}'.".format(commentor_name, book_name))


        # This whole dance is a bit of a mess.
        # Todo: see if we can clean it up a bit
        # could expose the b_index and c_index records to consumers of this object, and forget the renaming
        self.__dict__.update(self.c_index.contents())
        self.commentaryBook = self.b_index.get_title()
        self.commentaryCategories = self.b_index.categories
        self.categories = ["Commentary"] + self.b_index.categories + [self.b_index.get_title()]
        self.title = self.title + " on " + self.b_index.get_title()
        self.commentator = commentor_name
        if getattr(self, "heTitle", None):
            self.heCommentator = self.heBook = self.heTitle # why both?

        #todo: this assumes flat structure
        self.nodes = JaggedArrayCommentatorNode(self, self.b_index.nodes)
        self.schema = self.nodes.serialize()
        self.titleVariants = self.nodes.all_node_titles("en")
        self.heTitle = self.nodes.primary_title("he")
        self.heTitleVariants = self.nodes.all_node_titles("he")
        if getattr(self.nodes, "lengths", None):   #seems superfluous w/ nodes above
            self.length = self.nodes.lengths[0]

    def is_commentary(self):
        return True

    def copy(self):
        #todo: this doesn't seem to be used.
        #todo: make this quicker, by utilizing copy methods of the composed objects
        return copy.deepcopy(self)

    def toc_contents(self):
        return {
            "title": self.title,
            "heTitle": getattr(self, "heTitle", None),
            "categories": self.categories
        }

    def contents(self, support_v2=False):
        attrs = copy.copy(vars(self))
        del attrs["c_index"]
        del attrs["b_index"]
        del attrs["nodes"]
        if not support_v2:
            attrs["sectionNames"]   = self.nodes.sectionNames
            attrs["heSectionNames"] = map(hebrew_term, self.nodes.sectionNames)
            attrs["textDepth"]      = len(self.nodes.sectionNames)
            del attrs["schema"]

        return attrs


def get_index(bookname):
    """
    Factory - returns either an :class:Index object or a :class:CommentaryIndex object
    :param bookname: Name of the book or commentary on book.
    :return:
    """
    # look for result in indices cache
    if not bookname:
        raise BookNameError("No book provided.")

    cached_result = scache.get_index(bookname)
    if cached_result:
        return cached_result

    bookname = (bookname[0].upper() + bookname[1:]).replace("_", " ")  #todo: factor out method

    #todo: cache
    node = library.get_schema_node(bookname)
    if node:
        i = node.index
        scache.set_index(bookname, i)
        return i

    # "commenter" on "book"
    # todo: handle hebrew x on y format (do we need this?)
    pattern = r'(?P<commentor>.*) on (?P<book>.*)'
    m = regex.match(pattern, bookname)
    if m:
        i = CommentaryIndex(m.group('commentor'), m.group('book'))
        scache.set_index(bookname, i)
        return i

    #simple commentary record
    c_index = Index().load({
            "titleVariants": bookname,
            "categories.0": "Commentary"
        })
    if c_index:
        return c_index

    raise BookNameError(u"No book named '{}'.".format(bookname))



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

    #TODO: test me
    def sub_content(self, key_list=[], indx_list=[], value=None):
        """
        Get's or sets values deep within the content of this version.
        This returns the result by reference, NOT by value.
        http://stackoverflow.com/questions/27339165/slice-nested-list-at-variable-depth
        :param key_list: The node keys to traverse to get to the content node
        :param indx_list: The indexes of the subsection to get/set
        :param value: The value to set.  If present, the method acts as a setter.  If None, it acts as a getter.
        """
        ja = reduce(lambda d, k: d[k], key_list, self.get_content())
        if indx_list:
            sa = reduce(lambda a, i: a[i], indx_list[:-1], ja)
            if value is not None:
                sa[indx_list[-1]] = value
            return sa[indx_list[-1]]
        else:
            if value is not None:
                ja[:] = value
            return ja


class AbstractTextRecord(object):
    """
    Currently assumes that text is JA
    """
    text_attr = "chapter"
    ALLOWED_TAGS = ("i", "b", "br", "u", "strong", "em", "big", "small")

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
        return ja.JaggedTextArray(getattr(self, self.text_attr, None))

    @classmethod
    def sanitize_text(cls, t):
        if isinstance(t, list):
            for i, v in enumerate(t):
                t[i] = TextChunk.sanitize_text(v)
        elif isinstance(t, basestring):
            t = bleach.clean(t, tags=cls.ALLOWED_TAGS)
        else:
            return False
        return t

    def _sanitize(self):
        setattr(self, self.text_attr,
                self.sanitize_text(getattr(self, self.text_attr, None))
        )


class Version(abst.AbstractMongoRecord, AbstractTextRecord, AbstractSchemaContent):
    """
    A version of a text.
    Relates to a complete single record from the texts collection
    """
    history_noun = 'text'
    collection = 'texts'
    content_attr = "chapter"
    track_pkeys = True
    pkeys = ["versionTitle"]

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

    def _validate(self):
        assert super(Version, self)._validate()
        """
        Old style database text record have a field called 'chapter'
        Version records in the wild have a field called 'text', and not always a field called 'chapter'
        """
        return True

    def _normalize(self):
        pass


class VersionSet(abst.AbstractMongoSet):
    recordClass = Version

    def __init__(self, query={}, page=0, limit=0, sort=[["priority", -1], ["_id", 1]], proj=None):
        super(VersionSet, self).__init__(query, page, limit, sort, proj)

    def word_count(self):
        return sum([v.word_count() for v in self])

    def char_count(self):
        return sum([v.char_count() for v in self])

    def verse_count(self):
        return sum([v.verse_count() for v in self])

    def merge(self, attr="chapter"):
        """
        Returns merged result, but does not change underlying data
        """
        for v in self:
            if not getattr(v, "versionTitle", None):
                logger.error("No version title for Version: {}".format(vars(v)))
        return merge_texts([getattr(v, attr, []) for v in self], [getattr(v, "versionTitle", None) for v in self])


# used in VersionSet.merge(), merge_text_versions(), text_from_cur(), and export.export_merged()
# todo: move this to JaggedTextArray class
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
    text_attr = "text"

    def __init__(self, oref, lang="en", vtitle=None):
        """
        :param oref:
        :type oref: Ref
        :param lang: "he" or "en"
        :param vtitle:
        :return:
        """
        self._oref = oref
        self._ref_depth = len(oref.sections)
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
            v = Version().load({"title": oref.book, "language": lang, "versionTitle": vtitle}, oref.part_projection())
            if v:
                self._versions += [v]
                self.text = self._original_text = self.trim_text(getattr(v, oref.storage_address(), None))
        elif lang:
            vset = VersionSet(oref.condition_query(lang), proj=oref.part_projection())

            if vset.count() == 0:
                return
            if vset.count() == 1:
                v = vset[0]
                self._versions += [v]
                self.text = self.trim_text(getattr(v, oref.storage_address(), None))
                #todo: Should this instance, and the non-merge below, be made saveable?
            else:  # multiple versions available, merge
                merged_text, sources = vset.merge(oref.storage_address())  #todo: For commentaries, this merges the whole chapter.  It may show up as merged, even if our part is not merged.
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

    def is_empty(self):
        return bool(self.text)

    def save(self):
        assert self._saveable, u"Tried to save a read-only text: {}".format(self._oref.normal())
        assert not self._oref.is_range(), u"Only non-range references can be saved: {}".format(self._oref.normal())
        #may support simple ranges in the future.
        #self._oref.is_range() and self._oref.range_index() == len(self._oref.sections) - 1
        if self.text == self._original_text:
            logger.warning(u"Aborted save of {}. No change in text.".format(self._oref.normal()))
            return False

        self._validate()
        self._sanitize()
        self._trim_ending_whitespace()

        if not self.version():
            self.full_version = Version(
                {
                    "chapter": [],
                    "versionTitle": self.vtitle,
                    "versionSource": self.versionSource,
                    "language": self.lang,
                    "title": self._oref.book
                }
            )
        else:
            self.full_version = Version().load({"title": self._oref.book, "language": self.lang, "versionTitle": self.vtitle})
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
        self.text = ja.JaggedTextArray(self.text).trim_ending_whitespace().array()

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
                .format(self._oref.book, self._oref.index_node.depth, self._oref.normal(), implied_depth)
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
                    if i == 0 and len(txt):
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


class TextFamily(object):
    """
    A text with its translations and optionally the commentary on it.  Mirrors the construction of the old get_text() method.
    The TextFamily.contents() method will return a dictionary in the same format that was provided by get_text().
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


    def __init__(self, oref, context=1, commentary=True, version=None, lang=None, pad=True):
        if pad:
            oref = oref.padded_ref()
        self.ref = oref.normal()
        self.text = None
        self.he = None
        self._lang = lang
        self._original_oref = oref
        self._context_oref = None
        self._chunks = {}
        self._inode = oref.index_node
        assert isinstance(self._inode, JaggedArrayNode), "TextFamily only works with JaggedArray nodes"  # todo: handle structure nodes?

        for i in range(0, context):
            oref = oref.context_ref()
        self._context_oref = oref

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
            # but only if you care enough to get commentary also (hack)
            self.versions = oref.version_list()

    def contents(self):
        """ Ramaining:
        spanning
        """
        d = {k: getattr(self, k) for k in vars(self).keys() if k[0] != "_"}

        d["textDepth"] = getattr(self._inode, "depth", None)
        d["sectionNames"] = getattr(self._inode, "sectionNames", None)
        if getattr(self._inode, "lengths", None):
            d["lengths"] = getattr(self._inode, "lengths")
            if len(d["lengths"]):
                d["length"] = d["lengths"][0]
        elif getattr(self._inode, "length", None):
            d["length"] = getattr(self._inode, "length")
        d["textDepth"] = self._inode.depth
        d["heTitle"] = self._inode.full_title("he")
        d["titleVariants"] = self._inode.all_tree_titles("en")
        d["heTitleVariants"] = self._inode.all_tree_titles("he")

        for attr in ["categories", "order", "maps"]:
            d[attr] = getattr(self._inode.index, attr, "")
        for attr in ["book", "type"]:
            d[attr] = getattr(self._original_oref, attr)
        for attr in ["sections", "toSections"]:
            d[attr] = getattr(self._original_oref, attr)[:]
        if self._context_oref.is_commentary():
            for attr in ["commentaryBook", "commentaryCategories", "commentator", "heCommentator"]:
                d[attr] = getattr(self._inode.index, attr, "")

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

        # replace ints with daf strings (3->"2a") if text is Talmud or commentary on Talmud
        if self._context_oref.is_talmud():
            daf = d["sections"][0]
            d["sections"][0] = AddressTalmud.toStr("en", daf)
            d["title"] = d["book"] + " " + d["sections"][0]
            if "heTitle" in d:
                d["heBook"] = d["heTitle"]
                d["heTitle"] = d["heTitle"] + " " + AddressTalmud.toStr("he", daf)
            if d["type"] == "Commentary" and len(d["sections"]) > 1:
                d["title"] = "%s Line %d" % (d["title"], d["sections"][1])
            if "toSections" in d:
                d["toSections"] = [d["sections"][0]] + d["toSections"][1:]

        elif self._context_oref.is_commentary():
            dep = len(d["sections"]) if len(d["sections"]) < 2 else 2
            d["title"] = d["book"] + " " + ":".join(["%s" % s for s in d["sections"][:dep]])

        return d


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

'''
def process_index_title_change_in_counts(indx, **kwargs):
    count.CountSet({"title": kwargs["old"]}).update({"title": kwargs["new"]})
    if indx.is_commentary():  # and "commentaryBook" not in d:  # looks useless
        commentator_re = "^(%s) on " % kwargs["old"]
    else:
        commentators = IndexSet({"categories.0": "Commentary"}).distinct("title")
        commentator_re = ur"^({}) on {}".format("|".join(commentators), kwargs["old"])
    old_titles = count.CountSet({"title": {"$regex": commentator_re}}).distinct("title")
    old_new = [(title, title.replace(kwargs["old"], kwargs["new"], 1)) for title in old_titles]
    for pair in old_new:
        count.CountSet({"title": pair[0]}).update({"title": pair[1]})
'''

"""
                    -------------------
                           Refs
                    -------------------

"""


class RefCachingType(type):
    """
    Metaclass for Ref class.
    Caches all Ref isntances according to the string they were instanciated with and their normal form.
    Returns cached instance on instanciation if either instanciation string or normal form are matched.
    """

    def __init__(cls, name, parents, dct):
        super(RefCachingType, cls).__init__(name, parents, dct)
        cls.__cache = {}

    def cache_size(cls):
        return len(cls.__cache)

    def cache_dump(cls):
        return [(a, repr(b)) for (a, b) in cls.__cache.iteritems()]

    def _raw_cache(cls):
        return cls.__cache

    def clear_cache(cls):
        cls.__cache = {}

    def __call__(cls, *args, **kwargs):
        if len(args) == 1:
            tref = args[0]
        else:
            tref = kwargs.get("tref")

        obj_arg = kwargs.get("_obj")

        if tref:
            if tref in cls.__cache:
                return cls.__cache[tref]
            else:
                result = super(RefCachingType, cls).__call__(*args, **kwargs)
                if result.normal() in cls.__cache:
                    #del result  #  Do we need this to keep memory clean?
                    cls.__cache[tref] = cls.__cache[result.normal()]
                    return cls.__cache[result.normal()]
                cls.__cache[result.normal()] = result
                cls.__cache[tref] = result
                return result
        elif obj_arg:
            result = super(RefCachingType, cls).__call__(*args, **kwargs)
            if result.normal() in cls.__cache:
                #del result  #  Do we need this to keep memory clean?
                return cls.__cache[result.normal()]
            cls.__cache[result.normal()] = result
            return result
        else:  # Default.  Shouldn't be used.
            return super(RefCachingType, cls).__call__(*args, **kwargs)


class Ref(object):
    """
        Current attr, old attr - def
        tref, ref - the original string reference
        book, book - a string name of the text
        index.sectionNames, sectionNames - an array of strings naming the kinds of sections in this text (Chapter, Verse)
        index.textDepth, textDepth - an integer denote the number of sections named in sectionNames
        sections, sections - an array of ints giving the requested sections numbers
        toSections, toSections - an array of ints giving the requested sections at the end of a range
        * next, prev - an dictionary with the ref and labels for the next and previous sections
        index.categories, categories - an array of categories for this text
        type, type - the highest level category for this text
    """

    __metaclass__ = RefCachingType

    def __init__(self, tref=None, _obj=None):
        """
        Object is initialized with either tref - a textual reference, or _obj - a complete dict composing the Ref data
        The _obj argument is used internally.
        title is for when Ref is being used in the process of extracting Refs from text
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
        self._spanned_refs = []
        self._ranged_refs = []
        self._range_depth = None
        self._range_index = None

    def _validate(self):
        if not self.is_talmud():
            checks = [self.sections, self.toSections]
            for check in checks:
                if getattr(self.index_node, "lengths", None) and len(check):
                    if check[0] > self.index_node.lengths[0]:
                        raise InputError(u"{} only has {} {}s.".format(self.book, self.index_node.lengths[0], self.index_node.sectionNames[0]))

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

    def __init_tref(self):
        parts = [s.strip() for s in self.tref.split("-")]
        if len(parts) > 2:
            raise InputError(u"Couldn't understand ref '{}' (too many -'s).".format(self.tref))

        base = parts[0]
        title = None

        match = library.all_titles_regex(self._lang).match(base)
        if match:
            title = match.group('title')
            self.index_node = library.get_schema_node(title, self._lang)

            if not self.index_node:  # try to find a map
                new_tref = library.get_map_dict().get(title)
                if new_tref:
                    self.tref = new_tref
                    self.__init_tref()
                    return
                else:
                    raise InputError("Failed to find a record for {}".format(base))

            if getattr(self.index_node, "checkFirst", None) and self.index_node.checkFirst.get(self._lang):
                try:
                    check_node = library.get_schema_node(self.index_node.checkFirst[self._lang], self._lang)
                    re_string = '^' + regex.escape(title) + check_node.delimiter_re + check_node.regex(self._lang, strict=True)
                    reg = regex.compile(re_string, regex.VERBOSE)
                    self.sections = self.__get_sections(reg, base)
                except InputError: # Regex doesn't work
                    pass
                except AttributeError: # Can't find node for check_node
                    pass
                else:
                    self.index_node = check_node

            self.index = self.index_node.index
            self.book = self.index_node.full_title("en")

        elif self._lang == "en":  # Check for a Commentator
            match = library.all_titles_regex(self._lang, commentary=True).match(base)
            if match:
                title = match.group('title')
                self.index = get_index(title)
                self.book = title
                commentee_node = library.get_schema_node(match.group("commentee"))
                self.index_node = JaggedArrayCommentatorNode(self.index, commentee_node)
                if not self.index.is_commentary():
                    raise InputError(u"Unrecognized non-commentary Index record: {}".format(base))
                if not getattr(self.index, "commentaryBook", None):
                    raise InputError(u"Please specify a text that {} comments on.".format(self.index.title))
            else:
                raise InputError(u"Unrecognized Index record: {}".format(base))

        if title is None:
            raise InputError(u"Could not resolve reference: {}".format(self.tref))

        if title == base:  # Bare book.
            self.type = self.index_node.index.categories[0]
            if self.index_node.is_default():  # Without any further specification, match the parent of the fall-through node
                self.index_node = self.index_node.parent
                self.book = self.index_node.full_title("en")
            return

        re_string = '^' + regex.escape(title) + self.index_node.delimiter_re + self.index_node.regex(self._lang)
        reg = regex.compile(re_string, regex.VERBOSE)

        self.sections = self.__get_sections(reg, base)
        self.type = self.index_node.index.categories[0]

        self.toSections = self.sections[:]

        if self._lang == "en" and len(parts) == 2:  # we still don't support he ranges
            if self.index_node.addressTypes[0] == "Talmud":
                self.__parse_talmud_range(parts[1])
            else:
                range_part = parts[1].split(".")  #more generic seperator?
                delta = len(self.sections) - len(range_part)
                for i in range(delta, len(self.sections)):
                    try:
                        self.toSections[i] = int(range_part[i - delta])
                    except ValueError:
                        raise InputError(u"Couldn't understand text sections: '{}'.".format(self.tref))

    def __get_sections(self, reg, tref):
        sections = []
        ref_match = reg.match(tref)
        if not ref_match:
            raise InputError(u"Can not parse ref: {}".format(tref))

        gs = ref_match.groupdict()
        for i in range(0, self.index_node.depth):
            gname = u"a{}".format(i)
            if gs.get(gname) is not None:
                sections.append(self.index_node._addressTypes[i].toIndex(self._lang, gs.get(gname)))
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
        return self.normal() == other.normal()

    def __ne__(self, other):
        return not self.__eq__(other)

    @staticmethod
    def is_ref(tref):
        try:
            Ref(tref)
            return True
        except InputError:
            return False

    def is_talmud(self):
        return self.type == "Talmud" or (self.type == "Commentary" and getattr(self.index, "commentaryCategories", None) and self.index.commentaryCategories[0] == "Talmud")

    def is_commentary(self):
        return self.type == "Commentary"

    def is_range(self):
        return self.sections != self.toSections

    def range_size(self):
        return self.toSections[-1] - self.sections[-1] + 1

    def range_index(self):
        if not self._range_index:
            self._set_range_data()
        return self._range_index

    def range_depth(self):
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
        Returns True if the Ref spans across text sections.
        Shabbat 13a-b - True, Shabbat 13a:3-14 - False
        Job 4:3-5:3 - True, Job 4:5-18 - False
        """
        return self.span_size() > 1

    def span_size(self):
        if self.index_node.depth == 1:
            # text of depth 1 can't be spanning
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

    def is_section_level(self):
        return len(self.sections) == self.index_node.depth - 1

    def is_segment_level(self):
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

    def section_ref(self):
        if self.is_section_level():
            return self
        return self.padded_ref().context_ref()

    def top_section_ref(self):
        return self.padded_ref().context_ref(self.index_node.depth - 1)

    def next_section_ref(self):
        if not self._next:
            self._next = self._iter_text_section()
        return self._next

    def prev_section_ref(self):
        if not self._prev:
            self._prev = self._iter_text_section(False)
        return self._prev

    def recalibrate_next_prev_refs(self, add_self=True):
        next_ref = self.next_section_ref()
        prev_ref = self.prev_section_ref()
        if next_ref:
            next_ref._prev = self if add_self else prev_ref
        if prev_ref:
            prev_ref._next = self if add_self else next_ref


    #Don't store results on Ref cache - state objects change, and don't yet propogate to this Cache
    def get_state_node(self):
        from . import version_state
        return version_state.VersionState(self.book).state_node(self.index_node)

    def get_state_ja(self, lang="all"):
        return self.get_state_node().ja(lang)

    def is_text_fully_available(self, lang):
        """
	    Returns True if at least one complete version of ref is available in lang.
    	"""
        sja = self.get_state_ja(lang)
        subarray = sja.subarray_with_ref(self)
        return subarray.is_full()

    def is_text_translated(self):
        return self.is_text_fully_available("en")

    def _iter_text_section(self, forward=True, depth_up=1):
        """
        Used to iterate forwards or backwards to the next available ref in a text
        :param pRef: the ref object
        :param dir: direction to iterate
        :depth_up: if we want to traverse the text at a higher level than most granular. defaults to one level above
        :return: a ref
        """

        if self.index_node.depth <= depth_up:  # if there is only one level of text, don't even waste time iterating.
            return None

        #arrays are 0 based. text sections are 1 based. so shift the numbers back.
        starting_points = [s - 1 for s in self.sections[:self.index_node.depth - depth_up]]

        #start from the next one
        if len(starting_points) > 0:
            starting_points[-1] += 1 if forward else -1

        #let the counts obj calculate the correct place to go.
        c = self.get_state_node().ja("all", "availableTexts")
        new_section = c.next_index(starting_points) if forward else c.prev_index(starting_points)

        # we are also scaling back the sections to the level ABOVE the lowest section type (eg, for bible we want chapter, not verse)
        if new_section:
            d = self._core_dict()
            d["toSections"] = d["sections"] = [(s + 1) for s in new_section[:-depth_up]]
            return Ref(_obj=d)
        else:
            return None

    def subref(self, subsection):
        assert self.index_node.depth > len(self.sections), u"Tried to get subref of bottom level ref: {}".format(self.normal())
        assert not self.is_range(), u"Tried to get subref of ranged ref".format(self.normal())

        d = self._core_dict()
        d["sections"] += [subsection]
        d["toSections"] += [subsection]
        return Ref(_obj=d)

    def context_ref(self, level=1):
        """
        :return: Ref object that is more general than this Ref.
        * level: how many levels to 'zoom out' from the most specific possible ref
            e.g., with context=1, "Genesis 4:5" -> "Genesis 4"
        This does not change a refernce that is less specific than or equally specific to the level given
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
        :return: Ref object with 1s inserted to make the ref specific to the section level
        e.g.: "Genesis" --> "Genesis 1"
        This does not change a reference that is specific to the section or segment level.
        """
        if not self._padded:
            if not getattr(self, "index_node", None):
                raise Exception(u"No index_node found {}".format(vars(self)))
            if len(self.sections) >= self.index_node.depth - 1:
                return self

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

    def split_spanning_ref(self):
        """
        Returns a list of refs that do not span sections which corresponds
        to the spanning ref in pRef.
        Shabbat 13b-14b -> ["Shabbat 13b", "Shabbat 14a", "Shabbat 14b"]

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

                        for i in range(self.range_index() + 1, ref_depth):
                            d["sections"] += [1]
                            d["toSections"] += [self.get_state_ja().sub_array_length([s - 1 for s in d["toSections"][0:i]])]
                    if d["toSections"][-1]:  # to filter out, e.g. non-existant Rashi's, where the last index is 0
                        refs.append(Ref(_obj=d))

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
        Returns a list of refs corresponding to each point in the range of refs
        Does not work for spanning refs
        """
        if not self._ranged_refs:
            if not self.is_range():
                return [self]
            if self.is_spanning():
                raise InputError(u"Can not get range of spanning ref: {}".format(self))


            results = []

            for s in range(self.sections[-1], self.toSections[-1] + 1):
                d = self._core_dict()
                d["sections"][-1] = s
                d["toSections"][-1] = s
                results.append(Ref(_obj=d))

            self._ranged_refs = results
        return self._ranged_refs

    def regex(self):
        """
        Returns a string for a Regular Expression which will find any refs that match
        'ref' exactly, or more specificly than 'ref'
        E.g., "Genesis 1" yields an RE that match "Genesis 1" and "Genesis 1:3"
        """
        #todo: explore edge cases - book name alone, full ref to segment level
        patterns = []
        normals = [r.normal() for r in self.range_list()] if self.is_range() else [self.normal()]

        for r in normals:
            sections = re.sub("^%s" % re.escape(self.book), '', r)
            patterns.append("%s$" % sections)   # exact match
            patterns.append("%s:" % sections)   # more granualar, exact match followed by :
            patterns.append("%s \d" % sections) # extra granularity following space

        return "^%s(%s)" % (re.escape(self.book), "|".join(patterns))

    """ Methods for working with Versions and VersionSets """
    def storage_address(self):
        return ".".join(["chapter"] + self.index_node.address()[1:])

    def part_projection(self):
        """
        Returns the slice and storage address to return top-level sections for Versions of this ref
        Used as:
            Version().load({...},oref.part_projection())
        :return:
        """
        # todo: special case string 0
        if self.index_node.depth <= 1 or not self.sections:
            return {"_id": 0}
        else:
            skip = self.sections[0] - 1
            limit = 1 if not self.is_spanning() else self.toSections[0] - self.sections[0] + 1
            slce = {"$slice": [skip, limit]}
            return {"_id": 0, self.storage_address(): slce}

    def condition_query(self, lang=None):
        """
        Return condition to select only versions with content in the place that we're selecting.
        Used as:
            VersionSet({"title": oref.book}.update(oref.condition_query()),
                            proj={"_id": 0, storage_addr: slce})
        :return:
        """
        d = {
            "title": self.book,
        }
        if lang:
            d.update({"language": lang})

        condition_addr = self.storage_address()
        if not self.sections:
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
        return VersionSet(self.condition_query(lang))

    def version_list(self):
        """
        Returns a list of available text versions matching this ref
        """
        vlist = []
        for v in self.versionset():
            vlist.append({
                "versionTitle": v.versionTitle,
                 "language": v.language
            })
        return vlist

    """ String Representations """
    def __str__(self):
        return self.normal()

    def __repr__(self):  # Wanted to use orig_tref, but repr can not include Unicode
        return self.__class__.__name__ + "('" + str(self.normal()) + "')"

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

    def he_normal(self):
        if not self._he_normal:

            self._he_normal = self.index_node.full_title("he")
            if not self._he_normal:  # Missing Hebrew titles
                self._he_normal = self.normal()
                return self._he_normal

            if self.type == "Commentary" and not getattr(self.index, "commentaryCategories", None):
                return self._he_normal

            elif self.is_talmud():
                self._he_normal += u" " + section_to_daf(self.sections[0], lang="he") if len(self.sections) > 0 else ""
                self._he_normal += u"," + u",".join([str(s) for s in self.sections[1:]]) if len(self.sections) > 1 else ""

            else:
                sects = u":".join([encode_hebrew_numeral(s) for s in self.sections])
                if len(sects):
                    self._he_normal += u" " + sects

            for i in range(len(self.sections)):
                if not self.sections[i] == self.toSections[i]:
                    if i == 0 and self.is_talmud():
                        self._he_normal += u"-{}".format((u",".join([str(s) for s in [section_to_daf(self.toSections[0], lang="he")] + self.toSections[i + 1:]])))
                    else:
                        self._he_normal += u"-{}".format(u":".join([encode_hebrew_numeral(s) for s in self.toSections[i:]]))
                    break

        return self._he_normal

    def normal(self):
        if not self._normal:
            self._normal = self.book

            if self.type == "Commentary" and not getattr(self.index, "commentaryCategories", None):
                return self._normal

            elif self.is_talmud():
                self._normal += " " + section_to_daf(self.sections[0]) if len(self.sections) > 0 else ""
                self._normal += ":" + ":".join([str(s) for s in self.sections[1:]]) if len(self.sections) > 1 else ""

            else:
                sects = ":".join([str(s) for s in self.sections])
                if len(sects):
                    self._normal += " " + sects

            for i in range(len(self.sections)):
                if not self.sections[i] == self.toSections[i]:
                    if i == 0 and self.is_talmud():
                        self._normal += "-{}".format((":".join([str(s) for s in [section_to_daf(self.toSections[0])] + self.toSections[i + 1:]])))
                    else:
                        self._normal += "-{}".format(":".join([str(s) for s in self.toSections[i:]]))
                    break

        return self._normal

    def text(self, lang="en", vtitle=None):
        return TextChunk(self, lang, vtitle)

    def url(self):
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
        from . import LinkSet
        return LinkSet(self)


class Library(object):
    """
    A highest level class, for methods that work across the entire collection of texts.
    This is instanciated once, and essentially works as a singleton.
    Perhaps in the future, there will be multiple libraries...
    """

    local_cache = {}

    #WARNING: Do NOT put the compiled re2 object into redis.  It gets corrupted.
    def all_titles_regex(self, lang="en", commentary=False):
        """
        A regular expression that will match any known title in the library in the provided language
        Uses re2 if available.  See https://github.com/blockspeiser/Sefaria-Project/wiki/Regular-Expression-Engines
        :param lang: "en" or "he"
        :param commentary bool: Default False.  If True, matches commentary records only.  If False matches simple records only.
        :return: regex object
        :raise InputError: if lang == "he" and commentary == True
        """
        key = "all_titles_regex_" + lang
        key += "_commentary" if commentary else ""
        reg = self.local_cache.get(key)
        if not reg:
            simple_books = map(re.escape, self.full_title_list(lang, with_commentators=False))
            simple_book_part = u'|'.join(sorted(simple_books, key=len, reverse=True))  # Match longer titles first

            reg = u'(?P<title>'
            if not commentary:
                reg += simple_book_part
            else:
                if lang == "he":
                    raise InputError("No support for Hebrew Commentatory Ref Objects")
                first_part = u'|'.join(map(re.escape, self.get_commentator_titles(with_variants=True)))
                reg += u"(?P<commentor>" + first_part + u") on (?P<commentee>" + simple_book_part + u")"
            reg += u')'
            reg += ur'($|[:., ]+)'
            try:
                reg = re.compile(reg, max_mem= 256 * 1024 * 1024)
            except TypeError:
                reg = re.compile(reg)
            self.local_cache[key] = reg
        return reg

    def full_title_list(self, lang="en", with_commentators=True, with_commentary=False):
        """ Returns a list of strings of all possible titles, including maps
        If with_commentators is True, includes the commentator names, with variants, but not the cross-product with books.
        If with_commentary is True, includes all existing "X on Y" type commentary records
        """
        key = "full_title_list_" + lang
        key += "_commentators" if with_commentators else ""
        key += "_commentary" if with_commentary else ""
        titles = scache.get_cache_elem(key)
        if not titles:
            titles = self.get_title_node_dict(lang, with_commentary=with_commentary).keys()
            titles += self.get_map_dict().keys()
            if with_commentators:
                titles += self.get_commentator_titles(lang, with_variants=True)
            scache.set_cache_elem(key, titles)
        return titles

    def ref_list(self):
        from version_state import VersionStateSet
        return [r.normal() for r in VersionStateSet().all_refs()]

    #todo: how do we handle language here?
    def get_map_dict(self):
        """ Returns a dictionary of maps - {from: to} """
        maps = {}
        for i in IndexSet():
            if i.is_commentary():
                continue
            for m in i.get_maps():  # both simple maps & those derived from term schemes
                maps[m["from"]] = m["to"]
        return maps

    # todo: commentary nodes - hairy because right now there's the JA assumption on commentary nodes
    # should be able to use get_index_forest(with_commentary=True)
    def get_content_nodes(self, with_commentary=False):
        """
        :return: list of all content nodes in the library
        """
        nodes = []
        forest = self.get_index_forest(with_commentary=with_commentary)
        for tree in forest:
            nodes += tree.get_content_nodes()
        return nodes

    def get_index_forest(self, titleBased = False, with_commentary=False):
        """
        Returns a list of root Index nodes.
        :param titleBased: If true, texts with presentation 'alone' are passed as root level nodes
        """
        root_nodes = []
        for i in IndexSet():
            if i.is_commentary():
                continue
            root_nodes.append(i.nodes)
        if with_commentary:
            ctitles = self.get_commentary_version_titles()
            for title in ctitles:
                i = get_index(title)
                root_nodes.append(i.nodes)
        if titleBased:
            #todo: handle 'alone' nodes
            pass

        return root_nodes

    def get_title_node_dict(self, lang="en", with_commentary=False):
        """
        Returns a dictionary of string titles and the nodes that they point to.
        Does not include any map names.
        Does not include commentator names.
        If with_commentary is set, includes "X on Y" types nodes
        """
        key = "title_node_dict_" + lang
        key += "_commentary" if with_commentary else ""
        title_dict = self.local_cache.get(key)
        if not title_dict:
            title_dict = scache.get_cache_elem(key)
            self.local_cache[key] = title_dict
        if not title_dict:
            title_dict = {}
            trees = self.get_index_forest(titleBased=True, with_commentary=with_commentary)
            for tree in trees:
                title_dict.update(tree.title_dict(lang))
            scache.set_cache_elem(key, title_dict)
            self.local_cache[key] = title_dict
        return title_dict

    #todo: handle maps
    def get_schema_node(self, title, lang=None):
        """
        Returns a particular schema node that matches the provided title and language
        :param title string:
        :param lang: "en" or "he"
        :return:
        :rtype: SchemaNode
        """
        if not lang:
            lang = "he" if is_hebrew(title) else "en"
        return self.get_title_node_dict(lang).get(title)

    #todo: This wants some thought...
    def get_commentary_schema_node(self, title, lang="en"): #only supports "en"
        match = self.all_titles_regex(lang, commentary=True).match(title)
        if match:
            title = match.group('title')
            index = get_index(title)
            commentee_node = library.get_schema_node(match.group("commentee"))
            return JaggedArrayCommentatorNode(index, commentee_node)
        return None

    def get_text_titles_json(self):
        """
        Returns JSON of full texts list, keeps cached
        """
        if not scache.get_cache_elem('texts_titles_json'):
            scache.set_cache_elem('texts_titles_json', json.dumps(self.full_title_list(with_commentary=True)))

        return scache.get_cache_elem('texts_titles_json')

    def get_text_categories(self):
        """
        :return: List of all known text categories.
        """
        return IndexSet().distinct("categories")

    def get_commentator_titles(self, lang="en", with_variants=False):
        """
        Returns list of commentary titles.  By default returns canonical English commentator titles.
        :return: List of canonical English commentator titles
        """
        args = {
            ("en", False): "title",
            ("en", True): "titleVariants",
            ("he", False): "heTitle",
            ("he", True): "heTitleVariants"
        }
        return IndexSet({"categories.0": "Commentary"}).distinct(args[(lang, with_variants)])

    def get_commentary_version_titles(self, commentators=None):
        """
        :return: a list of text titles that exist in the DB which are commentaries.
        """
        return self.get_commentary_versions(commentators).distinct("title")

    def get_commentary_versions(self, commentators=None):
        """ Returns a VersionSet of commentary texts
        """
        if isinstance(commentators, basestring):
            commentators = [commentators]
        if not commentators:
            commentators = self.get_commentator_titles()
        commentary_re = ur"^({}) on ".format("|".join(commentators))
        return VersionSet({"title": {"$regex": commentary_re}})

    def get_commentary_versions_on_book(self, book=None):
        """ Return VersionSet of versions that comment on 'book' """
        assert book
        commentators = self.get_commentator_titles()
        commentary_re = ur"^({}) on {}".format("|".join(commentators), book)
        return VersionSet({"title": {"$regex": commentary_re}})

    def get_commentary_version_titles_on_book(self, book):
        return self.get_commentary_versions_on_book(book).distinct("title")

    def get_titles_in_string(self, s, lang=None):
        """
        Returns the titles found in the string.
        :param s: The string to search
        :param lang: "en" or "he"
        :return list:
        """
        if not lang:
            lang = "he" if is_hebrew(s) else "en"
        if lang=="en":
            #todo: combine into one regex
            return [m.group('title') for m in self.all_titles_regex(lang, commentary=True).finditer(s)] + [m.group('title') for m in self.all_titles_regex(lang, commentary=False).finditer(s)]
        elif lang=="he":
            return [m.group('title') for m in self.all_titles_regex(lang, commentary=False).finditer(s)]

    def get_refs_in_string(self, st, lang=None):
        """
        Returns an array of Ref objects derived from string
        :param st:
        :return:
        """
        refs = []
        if lang is None:
            lang = "he" if is_hebrew(st) else "en"
        if lang == "he":
            unique_titles = {title: 1 for title in self.get_titles_in_string(st, lang)}
            for title in unique_titles.iterkeys():
                res = self._build_all_refs_from_string(title, st)
                refs += res
        else:  # lang == "en"
            for match in self.all_titles_regex(lang, commentary=False).finditer(st):
                title = match.group('title')
                res = self._build_ref_from_string(title, st[match.start():])  # Slice string from title start
                refs += res
        return refs

    def _build_ref_from_string(self, title=None, st=None, lang="en"):
        """
        Build a Ref object given a title and a string.  The title is assumed to be at position 0 in the string.
        This is used primarily for English matching.  Hebrew matching is done with _build_all_refs_from_string()
        :param title: The title used in the text to refer to this Index node
        :param st: The source text for this reference
        :return: Ref
        """
        node = self.get_schema_node(title, lang)

        re_string = '^' + regex.escape(title) + node.delimiter_re + node.regex(lang)
        reg = regex.compile(re_string, regex.VERBOSE)
        ref_match = reg.match(st)
        if ref_match:
            sections = []
            gs = ref_match.groupdict()
            for i in range(0, node.depth):
                gname = u"a{}".format(i)
                if gs.get(gname) is not None:
                    sections.append(node._addressTypes[i].toIndex(lang, gs.get(gname)))

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

    def _build_all_refs_from_string(self, title=None, st=None, lang="he"):
        """
        Build all Ref objects for title found in string.  By default, only match what is found between braces (as in Hebrew).
        This is used primarily for Hebrew matching.  English matching uses _build_ref_from_string()
        :param title: The title used in the text to refer to this Index node
        :param st: The source text for this reference
        :return: list of Refs
        """
        node = self.get_schema_node(title, lang)

        refs = []
        re_string = ur"""(?<=							# look behind for opening brace
                [({]										# literal '(', brace,
                [^})]*										# anything but a closing ) or brace
            )
            """ + regex.escape(title) + node.delimiter_re + node.regex(lang) + ur"""
            (?=												# look ahead for closing brace
                [^({]*										# match of anything but an opening '(' or brace
                [)}]										# zero-width: literal ')' or brace
            )"""
        #node.regex(lang)
        reg = regex.compile(re_string, regex.VERBOSE)
        for ref_match in reg.finditer(st):
            sections = []
            gs = ref_match.groupdict()
            for i in range(0, node.depth):
                gname = u"a{}".format(i)
                if gs.get(gname) is not None:
                    sections.append(node._addressTypes[i].toIndex(lang, gs.get(gname)))

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

library = Library()
