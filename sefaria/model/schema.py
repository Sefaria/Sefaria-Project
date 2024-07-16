# -*- coding: utf-8 -*-
import copy
import dataclasses
from typing import Optional, List

import structlog
from functools import reduce

from sefaria.system.decorators import conditional_graceful_exception
from ..utils.tibetan import tib_to_int, int_to_tib

logger = structlog.get_logger(__name__)

try:
    import re2 as re

    re.set_fallback_notification(re.FALLBACK_WARNING)
except ImportError:
    logger.warning(
        "Failed to load 're2'.  Falling back to 're' for regular expression parsing. See https://github.com/Sefaria/Sefaria-Project/wiki/Regular-Expression-Engines")
    import re

import regex
from . import abstract as abst
from sefaria.system.database import db
from sefaria.model.lexicon import LexiconEntrySet
from sefaria.system.exceptions import InputError, IndexSchemaError, DictionaryEntryNotFoundError, SheetNotFoundError
from sefaria.utils.hebrew import hebrew_term
"""
                -----------------------------------------
                 Titles, Terms, and Term Schemes
                -----------------------------------------
"""


class TitleGroup(object):
    """
    A collection of titles.  Used for titles of SchemaNodes and for Terms
    """
    langs = ["en", "he"]

    # Attributes required in each title
    required_attrs = [
        "lang",
        "text"
    ]

    # Attributes optional in each title
    optional_attrs = [
        "primary",
        "presentation",
        "transliteration",  # bool flag to indicate if title is transliteration
        "disambiguation",  # str to help disambiguate this title from other similar titles (often on other objects)
        "fromTerm"  # bool flag to indicate if title originated from term (used in topics)
    ]

    def __init__(self, serial=None):
        self.titles = []
        self._primary_title = {}
        if serial:
            self.load(serial)

    def validate(self):
        for lang in self.langs:
            if not self.primary_title(lang):
                raise InputError("Title Group must have a {} primary title".format(lang))
        if len(self.all_titles()) > len(list(set(self.all_titles()))):
            raise InputError("There are duplicate titles in this object's title group")
        for title in self.titles:
            if not set(title.keys()) == set(self.required_attrs) and not set(title.keys()) <= set(
                    self.required_attrs + self.optional_attrs):
                raise InputError("Title Group titles must only contain the following keys: {}".format(
                    self.required_attrs + self.optional_attrs))
        if '-' in self.primary_title("en"):
            raise InputError("Primary English title may not contain hyphens.")
        # if not all(ord(c) < 128 for c in self.primary_title("en")):
        #     raise InputError("Primary English title may not contain non-ascii characters")

    def load(self, serial=None):
        if serial:
            self.titles = serial

    def copy(self):
        return self.__class__(copy.deepcopy(self.titles))

    def primary_title(self, lang="en"):
        """
        Return the primary title for this node in the language specified
        :param lang: "en" or "he"
        :return: The primary title string or None
        """
        if not self._primary_title.get(lang):
            for t in self.titles:
                if t.get("lang") == lang and t.get("primary"):
                    self._primary_title[lang] = t.get("text")
                    break
        if not self._primary_title.get(lang):
            self._primary_title[lang] = ""

        return self._primary_title.get(lang)

    def get_title_attr(self, title, lang, attr):
        """
        Get attribute `attr` for title `title`.
        For example, get attribute 'transliteration' for a certain title
        :param title: str
        :param lang: en or he
        :param attr: str
        :return: value of attribute `attr`
        """
        for t in self.titles:
            if t.get('lang') == lang and t.get('text') == title:
                return t.get(attr, None)

    def all_titles(self, lang=None):
        """
        :param lang: "en" or "he"
        :return: list of strings - the titles of this node
        """
        if lang is None:
            return [t["text"] for t in self.titles]
        return [t["text"] for t in self.titles if t["lang"] == lang]

    def secondary_titles(self, lang=None):
        if lang is None:
            raise Exception("TitleGroup.secondary_titles() needs a lang")
        return [t for t in self.all_titles(lang) if t != self.primary_title(lang)]

    def remove_title(self, text, lang):
        is_primary = len([t for t in self.titles if (t["lang"] == lang and t["text"] == text and t.get('primary'))])
        if is_primary:
            self._primary_title[lang] = None
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
        if any([t for t in self.titles if t["text"] == text and t["lang"] == lang]):  # already there
            if not replace_primary:
                return
            else:  # update this title as primary: remove it, then re-add below
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


class AbstractTitledObject(object):

    def add_primary_titles(self, en_title, he_title):
        self.add_title(en_title, 'en', primary=True)
        self.add_title(he_title, 'he', primary=True)

    def add_title(self, text, lang, primary=False, replace_primary=False):
        """
        :param text: Text of the title
        :param language:  Language code of the title (e.g. "en" or "he")
        :param primary: Is this a primary title?
        :param replace_primary: must be true to replace an existing primary title
        :return: the object
        """
        return self.title_group.add_title(text, lang, primary, replace_primary)

    def remove_title(self, text, lang):
        return self.title_group.remove_title(text, lang)

    def get_titles_object(self):
        return getattr(self.title_group, "titles", None)

    def get_titles(self, lang=None):
        return self.title_group.all_titles(lang)

    def get_primary_title(self, lang='en'):
        return self.title_group.primary_title(lang)

    def has_title(self, title, lang="en"):
        return title in self.get_titles(lang)


class AbstractTitledOrTermedObject(AbstractTitledObject):
    def _init_title_defaults(self):
        # To be called at initialization time
        self.title_group = TitleGroup()

    def _load_title_group(self):
        if getattr(self, "titles", None):
            self.title_group.load(serial=self.titles)
            del self.__dict__["titles"]

        self._process_terms()

    @conditional_graceful_exception()
    def _process_terms(self):
        # To be called after raw data load
        from sefaria.model import library

        if self.sharedTitle:
            term = library.get_term(self.sharedTitle)
            try:
                self.title_group = term.title_group
            except AttributeError:
                raise IndexError("Failed to load term named {}.".format(self.sharedTitle))

    def add_shared_term(self, term):
        self.sharedTitle = term
        self._process_terms()

    def remove_shared_term(self, term):
        if self.sharedTitle == term:
            self.sharedTitle = None
            self.title_group = self.title_group.copy()
            return 1


class Term(abst.AbstractMongoRecord, AbstractTitledObject):
    """
    A Term is a shared title node.  It can be referenced and used by many different Index nodes.
    Examples:  Noah, HaChovel
    Terms that use the same TermScheme can be ordered.
    """
    collection = 'term'
    track_pkeys = True
    pkeys = ["name"]
    title_group = None
    history_noun = "term"

    required_attrs = [
        "name",
        "titles"
    ]
    optional_attrs = [
        "scheme",
        "order",
        "ref",
        "good_to_promote",
        "category",
        "description"
    ]

    def load_by_title(self, title):
        query = {'titles.text': title}
        return self.load(query=query)

    def _set_derived_attributes(self):
        self.set_titles(getattr(self, "titles", None))

    def set_titles(self, titles):
        self.title_group = TitleGroup(titles)

    def _normalize(self):
        self.titles = self.title_group.titles

    def _validate(self):
        super(Term, self)._validate()
        # do not allow duplicates:
        for title in self.get_titles():
            other_term = Term().load_by_title(title)
            if other_term and not self.same_record(other_term):
                raise InputError("A Term with the title {} in it already exists".format(title))
        self.title_group.validate()
        if self.name != self.get_primary_title():
            raise InputError("Term name {} does not match primary title {}".format(self.name, self.get_primary_title()))

    @staticmethod
    def normalize(term, lang="en"):
        """ Returns the primary title for of 'term' if it exists in the terms collection
        otherwise return 'term' unchanged """
        t = Term().load_by_title(term)
        return t.get_primary_title(lang=lang) if t else term


class TermSet(abst.AbstractMongoSet):
    recordClass = Term


class TermScheme(abst.AbstractMongoRecord):
    """
    A TermScheme is a category of terms.
    Example: Parasha, Perek
    """
    collection = 'term_scheme'
    track_pkeys = True
    pkeys = ["name"]

    required_attrs = [
        "name"
    ]
    optional_attrs = [

    ]

    def get_terms(self):
        return TermSet({"scheme": self.name})


class TermSchemeSet(abst.AbstractMongoSet):
    recordClass = TermScheme


class NonUniqueTerm(abst.SluggedAbstractMongoRecord, AbstractTitledObject):
    """
    The successor of the old `Term` class
    Doesn't require titles to be globally unique
    """
    cacheable = True
    collection = "non_unique_terms"
    required_attrs = [
        "slug",
        "titles"
    ]
    slug_fields = ['slug']
    title_group = None

    def _normalize(self):
        super()._normalize()
        self.titles = self.title_group.titles

    def set_titles(self, titles):
        self.title_group = TitleGroup(titles)

    def _set_derived_attributes(self):
        self.set_titles(getattr(self, "titles", None))

    def __repr__(self):
        return f'{self.__class__.__name__}.init("{self.slug}")'

    def __eq__(self, other):
        return isinstance(other, self.__class__) and self.__hash__() == other.__hash__()

    def __hash__(self):
        return hash(self.slug)

    def __ne__(self, other):
        return not self.__eq__(other)


class NonUniqueTermSet(abst.AbstractMongoSet):
    recordClass = NonUniqueTerm


"""
                ---------------------------------
                 Index Schema Trees - Core Nodes
                ---------------------------------
"""


def deserialize_tree(serial=None, **kwargs):
    """
    Build a :class:`TreeNode` tree from serialized form.  Called recursively.
    :param serial: The serialized form of the subtree
    :param kwargs: keyword argument 'struct_class' specifies the class to use as the default structure node class.
    Keyword argument 'leaf_class' specifies the class to use as the default leaf node class.
    keyword argument 'children_attr' specifies the attribute where children are contained. Defaults to "nodes"
        Note the attribute of TreeNode class with the same name and function.
    Other keyword arguments are passed through to the node constructors.
    :return: :class:`TreeNode`
    """
    if kwargs.get("additional_classes"):
        for klass in kwargs.get("additional_classes"):
            globals()[klass.__name__] = klass

    klass = None
    if serial.get("nodeType"):
        try:
            klass = globals()[serial.get("nodeType")]
        except KeyError:
            raise IndexSchemaError("No matching class for nodeType {}".format(serial.get("nodeType")))

    if serial.get(kwargs.get("children_attr", "nodes")) or (
            kwargs.get("struct_title_attr") and serial.get(kwargs.get("struct_title_attr"))):
        # Structure class - use explicitly defined 'nodeType', code overide 'struct_class', or default SchemaNode
        struct_class = klass or kwargs.get("struct_class", SchemaNode)
        return struct_class(serial, **kwargs)
    elif klass:
        return klass(serial, **kwargs)
    elif kwargs.get("leaf_class"):
        return kwargs.get("leaf_class")(serial, **kwargs)
    else:
        raise IndexSchemaError(
            "Schema node has neither 'nodes' nor 'nodeType' and 'leaf_class' not provided: {}".format(serial))


class TreeNode(object):
    """
    A single node in a tree.
    These trees are hierarchies - each node can have 1 or 0 parents.
    In this class, node relationships, node navigation, and general serialization are handled.
    """
    required_param_keys = []
    optional_param_keys = []
    default_children_attr = "nodes"

    def __init__(self, serial=None, **kwargs):
        self.children_attr = kwargs.get("children_attr", self.default_children_attr)
        self._init_defaults()
        if not serial:
            return
        self.__dict__.update(serial)
        if getattr(self, self.children_attr, None) is not None:
            for node in getattr(self, self.children_attr):
                self.append(deserialize_tree(node, **kwargs))
            delattr(self, self.children_attr)

    def _init_defaults(self):
        self.children = []  # Is this enough?  Do we need a dict for addressing?
        self.parent = None
        self._leaf_nodes = []

    def validate(self):
        for k in self.required_param_keys:
            if getattr(self, k, None) is None:
                raise IndexSchemaError("Missing Parameter '{}' in {}".format(k, self.__class__.__name__))
        for c in self.children:
            c.validate()

    def append(self, node):
        """
        Append node to this node
        :param node: the node to be appended to this node
        :return:
        """
        self.children.append(node)
        node.parent = self
        return self

    def replace(self, node):
        """
        Replace self with `node`
        :param node:
        :return:
        """
        parent = self.parent
        assert parent

        parent.children = [c if c != self else node for c in parent.children]

        node.parent = parent
        self.parent = None

    def detach(self):
        parent = self.parent
        assert parent
        parent.children = [c for c in parent.children if c != self]
        self.parent = None

    def append_to(self, node):
        """
        Append this node to another node
        :param node: the node to append this node to
        :return:
        """
        node.append(self)
        return self

    # todo: replace with a direct call to self.children for speed
    def has_children(self):
        """
        :return bool: True if this node has children
        """
        return bool(self.children)

    # todo: replace with a direct call to `not self.children for speed`
    def is_leaf(self):
        return not self.children

    def siblings(self):
        """
        :return list: The sibling nodes of this node
        """
        if self.parent:
            return [x for x in self.parent.children if x is not self]
        else:
            return None

    def root(self):
        if not self.parent:
            return self
        return self.parent.root()

    def first_child(self):
        if not self.children:
            return None
        return self.children[0]

    def last_child(self):
        if not self.children:
            return None
        return self.children[-1]

    def first_leaf(self):
        if not self.children:  # is leaf
            return self
        return self.first_child().first_leaf()

    def last_leaf(self):
        if not self.children:  # is leaf
            return self
        return self.last_child().last_leaf()

    def _prev_in_list(self, l):
        if not self.parent:
            return None
        prev = None
        for x in l:
            if x is self:
                return prev
            prev = x

    def _next_in_list(self, l):
        match = False
        for x in l:
            if match:
                return x
            if x is self:
                match = True
                continue
        return None

    def prev_sibling(self):
        if not self.parent:
            return None
        return self._prev_in_list(self.parent.children)

    def next_sibling(self):
        if not self.parent:
            return None
        return self._next_in_list(self.parent.children)

    # Currently assumes being called from leaf node - could integrate a call to first_leaf/last_leaf
    def next_leaf(self):
        return self._next_in_list(self.root().get_leaf_nodes())

    # Currently assumes being called from leaf node - could integrate a call to first_leaf/last_leaf
    def prev_leaf(self):
        return self._prev_in_list(self.root().get_leaf_nodes())

    def ancestors(self):
        if not self.parent:
            return []
        return self.parent.ancestors() + [self.parent]

    def is_ancestor_of(self, other_node):
        return any(self == anc for anc in other_node.ancestors())

    def is_root(self):
        return not self.parent

    def is_flat(self):
        """
        Is this node a flat tree, with no parents or children?
        :return bool:
        """
        return not self.parent and not self.children

    def traverse_tree(self, callback, **kwargs):
        """
        Traverse tree, invoking callback at each node, with kwargs as arguments
        :param callback:
        :param kwargs:
        :return:
        """
        callback(self, **kwargs)
        for child in self.children:
            child.traverse_tree(callback, **kwargs)

    def traverse_to_string(self, callback, depth=0, **kwargs):
        st = callback(self, depth, **kwargs)
        st += "".join([child.traverse_to_string(callback, depth + 1, **kwargs) for child in self.children])
        return st

    def traverse_to_json(self, callback, depth=0, **kwargs):
        js = callback(self, depth, **kwargs)
        if self.children:
            js[getattr(self, "children_attr")] = [child.traverse_to_json(callback, depth + 1, **kwargs) for child in
                                                  self.children]
        return js

    def traverse_to_list(self, callback, depth=0, **kwargs):
        listy = callback(self, depth, **kwargs)
        if self.children:
            listy += reduce(lambda a, b: a + b,
                            [child.traverse_to_list(callback, depth + 1, **kwargs) for child in self.children], [])
        return listy

    def serialize(self, **kwargs):
        d = {}
        if self.children:
            d[self.children_attr] = [n.serialize(**kwargs) for n in self.children]

        # Only output nodeType and nodeParameters if there is at least one param. This seems like it may not remain a good measure.
        params = {k: getattr(self, k) for k in self.required_param_keys + self.optional_param_keys if
                  getattr(self, k, None) is not None}
        if any(params):
            d["nodeType"] = self.__class__.__name__
            d.update(params)

        return d

    def copy(self, callback=None):
        children_serial = []
        for child in self.children:
            children_serial.append(child.copy(callback).serialize())
        serial = copy.deepcopy(self.serialize())
        if self.children_attr in serial:
            serial[self.children_attr] = children_serial
        new_node = self.__class__(serial)
        if callback:
            new_node = callback(new_node)
        return new_node

    def all_children(self):
        return self.traverse_to_list(lambda n, i: [n])[1:]

    def get_leaf_nodes_to_depth(self, max_depth=None):
        """
        :param max_depth: How many levels below this one to traverse.
        1 returns only this node's children, 0 returns only this node.
        """
        assert max_depth is not None
        leaves = []

        if not self.children:
            return [self]
        elif max_depth > 0:
            for node in self.children:
                if not node.children:
                    leaves += [node]
                else:
                    leaves += node.get_leaf_nodes_to_depth(max_depth=max_depth - 1)
        return leaves

    def get_leaf_nodes(self):
        """
        :return:
        """
        if not self._leaf_nodes:
            if not self.children:
                self._leaf_nodes = [self]
            else:
                for node in self.children:
                    if not node.children:
                        self._leaf_nodes += [node]
                    else:
                        self._leaf_nodes += node.get_leaf_nodes()
        return self._leaf_nodes

    def get_child_order(self, child):
        """
        Intention is to call this on the root node of a schema, in order to get the order of a child node.
        :param child: TreeNode
        :return: Integer
        """
        if child.parent and child.parent.is_virtual:
            return child.parent.get_child_order(child)
        return self.all_children().index(child) + 1


class TitledTreeNode(TreeNode, AbstractTitledOrTermedObject):
    """
    A tree node that has a collection of titles - as contained in a TitleGroup instance.
    In this class, node titles, terms, 'default', and combined titles are handled.
    """

    after_title_delimiter_re = r"(?:[,.:\s]|(?:to|\u05d5?\u05d1?(?:\u05e1\u05d5\u05e3|\u05e8\u05d9\u05e9)))+"  # should be an arg?  \r\n are for html matches
    after_address_delimiter_ref = r"[,.:\s]+"
    title_separators = [", "]
    MATCH_TEMPLATE_ALONE_SCOPES = {'any', 'alone'}

    def __init__(self, serial=None, **kwargs):
        super(TitledTreeNode, self).__init__(serial, **kwargs)
        self._load_title_group()

    def _init_defaults(self):
        super(TitledTreeNode, self)._init_defaults()
        self.default = False
        self._primary_title = {}
        self._full_title = {}
        self._full_titles = {}

        self._init_title_defaults()
        self.sharedTitle = None

    def all_tree_titles(self, lang="en"):
        """
        :param lang: "en" or "he"
        :return: list of strings - all possible titles within this subtree
        """
        return list(self.title_dict(lang).keys())

    def title_dict(self, lang="en", baselist=None):
        """
        Recursive function that generates a map from title to node
        :param node: the node to start from
        :param lang: "en" or "he"
        :param baselist: list of starting strings that lead to this node
        :return: map from title to node
        """
        if baselist is None:
            baselist = []

        title_dict = {}
        thisnode = self

        this_node_titles = [title["text"] for title in self.get_titles_object() if
                            title["lang"] == lang and title.get("presentation") != "alone"]
        if (not len(this_node_titles)) and (not self.is_default()):
            error = 'No "{}" title found for schema node: "{}"'.format(lang, self.key)
            error += ', child of "{}"'.format(self.parent.full_title("en")) if self.parent else ""
            raise IndexSchemaError(error)
        if baselist:
            if self.is_default():
                node_title_list = baselist  # doesn't add any titles of its own
            else:
                node_title_list = [baseName + sep + title for baseName in baselist for sep in self.title_separators for
                                   title in this_node_titles]
        else:
            node_title_list = this_node_titles

        alone_node_titles = [title["text"] for title in self.get_titles_object() if
                             title["lang"] == lang and title.get("presentation") == "alone" or title.get(
                                 "presentation") == "both"]
        node_title_list += alone_node_titles

        for child in self.children:
            if child.default:
                thisnode = child
            title_dict.update(child.title_dict(lang, node_title_list))

        for title in node_title_list:
            title_dict[title] = thisnode

        return title_dict

    def full_titles(self, lang="en"):
        if not self._full_titles.get(lang):
            if self.parent:
                self._full_titles[lang] = [parent + sep + local
                                           for parent in self.parent.full_titles(lang)
                                           for sep in self.title_separators
                                           for local in self.all_node_titles(lang)]
            else:
                self._full_titles[lang] = self.all_node_titles(lang)
        return self._full_titles[lang]

    def full_title(self, lang="en", force_update=False):
        """
        :param lang: "en" or "he"
        :return string: The full title of this node, from the root node.
        """
        if not self._full_title.get(lang) or force_update:
            if self.is_default():
                self._full_title[lang] = self.parent.full_title(lang, force_update)
            elif self.parent:
                self._full_title[lang] = self.parent.full_title(lang, force_update) + ", " + self.primary_title(lang)
            else:
                self._full_title[lang] = self.primary_title(lang)
        return self._full_title[lang]

    # todo: replace with a direct call to self.default for speed
    def is_default(self):
        """
        Is this node a default node, meaning, do references to its parent cascade to this node?
        :return bool:
        """
        return self.default

    def has_default_child(self):
        return any([c for c in self.children if c.is_default()])

    def get_default_child(self):
        for child in self.children:
            if child.is_default():
                return child
        return None

    def get_child_by_key(self, key):
        for child in self.children:
            if hasattr(child, 'key') and child.key == key:
                return child

    def has_titled_continuation(self):
        """
        :return: True if any normal forms of this node continue with a title.  Used in regex building.
        """
        return any([c for c in self.children if not c.is_default()])

    def has_numeric_continuation(self):
        """
        True if any of the normal forms of this node continue with numbers.  Used in regex building.
        Overridden in subclasses.
        :return:
        """
        # overidden in subclasses
        for child in self.children:
            if child.is_default():
                if child.has_numeric_continuation():
                    return True
        return False

    def primary_title(self, lang="en"):
        # Retained for backwards compatability.  Could be factored out.
        """
        Return the primary title for this node in the language specified
        :param lang: "en" or "he"
        :return: The primary title string or None
        """
        return self.get_primary_title(lang)

    def all_node_titles(self, lang="en"):
        # Retained for backwards compatability.  Could be factored out.
        """
        :param lang: "en" or "he"
        :return: list of strings - the titles of this node
        """
        return self.get_titles(lang)

    def add_title(self, text, lang, primary=False, replace_primary=False, presentation="combined"):
        """
        :param text: Text of the title
        :param lang:  Language code of the title (e.g. "en" or "he")
        :param primary: Is this a primary title?
        :param replace_primary: must be true to replace an existing primary title
        :param presentation: The "presentation" field of a title indicates how it combines with earlier titles. Possible values:
            "combined" - in referencing this node, earlier titles nodes are prepended to this one (default)
            "alone" - this node is reference by this title alone
            "both" - this node is addressable both in a combined and a alone form.
        :return: the object
        """
        return self.title_group.add_title(text, lang, primary, replace_primary, presentation)

    def get_match_template_trie(self, lang: str):
        from .linker.match_template import MatchTemplateTrie
        return MatchTemplateTrie(lang, nodes=[self], scope='combined')

    def validate(self):
        super(TitledTreeNode, self).validate()

        if not self.default and not self.sharedTitle and not self.get_titles_object():
            raise IndexSchemaError("Schema node {} must have titles, a shared title node, or be default".format(self))

        if self.default and (self.get_titles_object() or self.sharedTitle):
            raise IndexSchemaError("Schema node {} - default nodes can not have titles".format(self))

        if not self.default:
            try:
                self.title_group.validate()
            except InputError as e:
                raise IndexSchemaError("Schema node {} has invalid titles: {}".format(self, e))

        if self.children and len([c for c in self.children if c.default]) > 1:
            raise IndexSchemaError("Schema Structure Node {} has more than one default child.".format(self.key))

        if self.sharedTitle and Term().load({"name": self.sharedTitle}).titles != self.get_titles_object():
            raise IndexSchemaError("Schema node {} with sharedTitle can not have explicit titles".format(self))

        # disable this check while data is still not conforming to validation
        if not self.sharedTitle and False:
            special_book_cases = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Judges"]
            for title in self.title_group.titles:
                title = title["text"]
                if self.get_primary_title() in special_book_cases:
                    break
                term = Term().load_by_title(title)
                if term:
                    if "scheme" in list(vars(term).keys()):
                        if vars(term)["scheme"] == "Parasha":
                            raise InputError(
                                "Nodes that represent Parashot must contain the corresponding sharedTitles.")

        # if not self.default and not self.primary_title("he"):
        #    raise IndexSchemaError("Schema node {} missing primary Hebrew title".format(self.key))

    def serialize(self, **kwargs):
        d = super(TitledTreeNode, self).serialize(**kwargs)
        if self.default:
            d["default"] = True
        else:
            if self.sharedTitle:
                d["sharedTitle"] = self.sharedTitle
            if not self.sharedTitle or kwargs.get("expand_shared"):
                d["titles"] = self.get_titles_object()
        if kwargs.get("expand_titles"):
            d["title"] = self.title_group.primary_title("en")
            d["heTitle"] = self.title_group.primary_title("he")
        return d

    def get_match_templates(self):
        from .linker.match_template import MatchTemplate
        for raw_match_template in getattr(self, 'match_templates', []):
            yield MatchTemplate(**raw_match_template)

    def has_scope_alone_match_template(self):
        """
        @return: True if `self` has any match template that has scope = "alone" OR scope = "any"
        """
        return any(template.scope in self.MATCH_TEMPLATE_ALONE_SCOPES for template in self.get_match_templates())

    def get_referenceable_alone_nodes(self):
        """
        Currently almost exact copy of function with same name in Index
        See docstring there
        @return:
        """
        alone_nodes = []
        for child in self.children:
            if child.has_scope_alone_match_template():
                alone_nodes += [child]
            alone_nodes += child.get_referenceable_alone_nodes()
        return alone_nodes

    """ String Representations """

    def __str__(self):
        return self.full_title("en")

    def __repr__(self):
        # Wanted to use orig_tref, but repr can not include Unicode
        # add `repr` around `full_title()` in case there's unicode in the output
        return self.__class__.__name__ + "(" + repr(self.full_title("en")) + ")"


"""
                --------------------------------
                 Alternate Structure Tree Nodes
                --------------------------------
"""


class NumberedTitledTreeNode(TitledTreeNode):
    """
    A :class:`TreeNode` that can address its :class:`TreeNode` children by Integer, or other :class:`AddressType`.
    """
    required_param_keys = ["depth", "addressTypes", "sectionNames"]
    optional_param_keys = ["lengths"]

    def __init__(self, serial=None, **kwargs):
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
        super(NumberedTitledTreeNode, self).__init__(serial, **kwargs)

        # Anything else in this __init__ needs to be reflected in JaggedArrayNode.__init__
        self._regexes = {}
        self._init_address_classes()

    def _init_address_classes(self):
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

    def validate(self):
        super(NumberedTitledTreeNode, self).validate()
        for p in ["addressTypes", "sectionNames"]:
            if len(getattr(self, p)) != self.depth:
                raise IndexSchemaError(
                    "Parameter {} in {} {} does not have depth {}".format(p, self.__class__.__name__, self.key,
                                                                          self.depth))

        for sec in getattr(self, 'sectionNames', []):
            if any((c in '.-\\/') for c in sec):
                raise InputError("Text Structure names may not contain periods, hyphens or slashes.")

    def address_class(self, depth):
        return self._addressTypes[depth]

    def full_regex(self, title, lang, anchored=True, compiled=True, capture_title=False, escape_titles=True, **kwargs):
        """
        :return: Regex object. If kwargs[for_js] == True, returns the Regex string
        :param for_js: Defaults to False
        :param match_range: Defaults to False
        :param strict: Only match string where all address components match
        :param terminated: Only match string that contains just a valid ref

        A call to `full_regex("Bereishit", "en", for_js=True)` returns the follow regex, expanded here for clarity :
        ```
        Bereishit                       # title
        [,.: \r\n]+                     # a separator (self.after_title_delimiter_re)
        (?:                             # Either:
            (?:                         # 1)
                (\d+)                   # Digits
                (                       # and maybe
                    [,.: \r\n]+         # a separator
                    (\d+)               # and more digits
                )?
            )
            |                           # Or:
            (?:                         # 2: The same
                [[({]                   # With beginning
                (\d+)
                (
                    [,.: \r\n]+
                    (\d+)
                )?
                [])}]                   # and ending brackets or parens or braces around the numeric portion
            )
        )
        (?=                             # and then either
            [.,;?! })<]                 # some kind of delimiting character coming after
            |                           # or
            $                           # the end of the string
        )
        ```
        Different address type / language combinations produce different internal regexes in the innermost portions of the above, where the comments say 'digits'.

        """
        parentheses = kwargs.get("parentheses", False)
        prefixes = 'בכ|וב|וה|וכ|ול|ומ|וש|כב|ככ|כל|כמ|כש|לכ|מב|מה|מכ|מל|מש|שב|שה|שכ|של|שמ|ב|כ|ל|מ|ש|ה|ו|ד' if lang == 'he' else ''
        prefix_group = rf'(?:{prefixes})?'
        key = (title, lang, anchored, compiled, kwargs.get("for_js"), kwargs.get("match_range"), kwargs.get("strict"),
               kwargs.get("terminated"), kwargs.get("escape_titles"), parentheses)
        if not self._regexes.get(key):
            if anchored:
                reg = r"^"
            elif parentheses:
                parens_lookbehind = r'(?<=[(\[](?:[^)\]]*?\s)?'
                if kwargs.get("for_js"):
                    reg = rf"{parens_lookbehind}){prefix_group}"  # prefix group should be outside lookbehind in js to be consistent with when parentheses == False
                else:
                    reg = rf"{parens_lookbehind}{prefix_group})"
            else:
                word_break_group = r'(?:^|\s|\(|\[|-|/)'  # r'(?:^|\s|\(|\[)'
                if kwargs.get("for_js"):
                    reg = rf"{word_break_group}{prefix_group}"  # safari still does not support lookbehinds (although this issue shows they're working on it https://bugs.webkit.org/show_bug.cgi?id=174931)
                else:
                    reg = rf"(?<={word_break_group}{prefix_group})"
            title_block = regex.escape(title) if escape_titles else title
            if kwargs.get("for_js"):
                reg += r"("  # use capture group to distinguish prefixes from captured ref
            reg += r"(?P<title>" + title_block + r")" if capture_title else title_block
            reg += self.after_title_delimiter_re
            addr_regex = self.address_regex(lang, **kwargs)
            reg += r'(?:(?:' + addr_regex + r')|(?:[\[({]' + addr_regex + r'[\])}]))'  # Match expressions with internal parentheses around the address portion
            if kwargs.get("for_js"):
                reg += r")"  # use capture group to distinguish prefixes from captured ref
            if parentheses:
                reg += r"(?=(?:[)\]])|(?:[.,:;?!\s<][^\])]*?[)\]]))"
            else:
                reg += r"(?=[-/.,:;?!\s})\]<]|$)" if kwargs.get("for_js") else r"(?=\W|$)" if not kwargs.get(
                    "terminated") else r"$"
            self._regexes[key] = regex.compile(reg, regex.VERBOSE) if compiled else reg
        return self._regexes[key]

    def address_regex(self, lang, **kwargs):
        group = "a0"
        reg = self._addressTypes[0].regex(lang, group, **kwargs)
        for i in range(1, self.depth):
            group = "a{}".format(i)
            reg += "(" + self.after_address_delimiter_ref + self._addressTypes[i].regex(lang, group, **kwargs) + ")"
            if not kwargs.get("strict", False):
                reg += "?"

        if kwargs.get("match_range"):
            # TODO there is a potential error with this regex. it fills in toSections starting from highest depth and going to lowest.
            # TODO Really, the depths should be filled in the opposite order, but it's difficult to write a regex to match.
            # TODO However, most false positives will be filtered out in library._get_ref_from_match()

            reg += r"(?:\s*([-\u2010-\u2015\u05be]|to)\s*"  # maybe there's a dash (either n or m dash) and a range
            reg += r"(?=\S)"  # must be followed by something (Lookahead)
            group = "ar0"
            reg += self._addressTypes[0].regex(lang, group, **kwargs)
            reg += "?"
            for i in range(1, self.depth):
                reg += r"(?:(?:" + self.after_address_delimiter_ref + r")?"
                group = "ar{}".format(i)
                reg += "(" + self._addressTypes[i].regex(lang, group, **kwargs) + ")"
                # assuming strict isn't relevant on ranges  # if not kwargs.get("strict", False):
                reg += ")?"
            reg += r")?"  # end range clause
        return reg

    def sectionString(self, sections, lang="en", title=True, full_title=False):
        assert len(sections) <= self.depth

        ret = ""
        if title:
            ret += self.full_title(lang) if full_title else self.primary_title(lang)
            ret += " "
        strs = []
        for i in range(len(sections)):
            strs.append(self.address_class(i).toStr(lang, sections[i]))
        ret += ":".join(strs)

        return ret

    def add_structure(self, section_names, address_types=None):
        self.depth = len(section_names)
        self.sectionNames = section_names
        if address_types is None:
            self.addressTypes = [sec if globals().get("Address{}".format(sec), None) else 'Integer' for sec in
                                 section_names]
        else:
            self.addressTypes = address_types

    def serialize(self, **kwargs):
        d = super(NumberedTitledTreeNode, self).serialize(**kwargs)
        if kwargs.get("translate_sections"):
            d["heSectionNames"] = list(map(hebrew_term, self.sectionNames))
        return d

    def is_segment_level_dibur_hamatchil(self) -> bool:
        return getattr(self, 'isSegmentLevelDiburHamatchil', False)


class ArrayMapNode(NumberedTitledTreeNode):
    """
    A :class:`TreeNode` that contains jagged arrays of references.
    Used as the leaf node of alternate structures of Index records.
    (e.g., Parsha structures of chapter/verse stored Tanach, or Perek structures of Daf/Line stored Talmud)
    """
    required_param_keys = ["depth", "wholeRef"]
    optional_param_keys = ["lengths", "addressTypes", "sectionNames", "refs", "includeSections", "startingAddress",
                           "match_templates", "numeric_equivalent", "referenceableSections",
                           "isSegmentLevelDiburHamatchil", "diburHamatchilRegexes", 'referenceable', "addresses",
                           "skipped_addresses"]  # "addressTypes", "sectionNames", "refs" are not required for depth 0, but are required for depth 1 +
    has_key = False  # This is not used as schema for content

    def get_ref_from_sections(self, sections):
        if not sections:
            return self.wholeRef
        return reduce(lambda a, i: a[i], [s - 1 for s in sections], self.refs)

    def serialize(self, **kwargs):
        d = super(ArrayMapNode, self).serialize(**kwargs)
        if kwargs.get("expand_refs"):
            if getattr(self, "includeSections", False):
                # We assume that with "includeSections", we're going from depth 0 to depth 1, and expanding "wholeRef"
                from . import text

                refs = text.Ref(self.wholeRef).split_spanning_ref()
                first, last = refs[0], refs[-1]
                offset = first.sections[-2] - 1 if first.is_segment_level() else first.sections[-1] - 1

                d["refs"] = [r.normal() for r in refs]
                d["addressTypes"] = first.index_node.addressTypes[-2:-1]
                d["sectionNames"] = first.index_node.sectionNames[-2:-1]
                d["depth"] += 1
                d["offset"] = offset
            elif getattr(self, "startingAddress", False):
                d["offset"] = self.address_class(0).toIndex("en", self.startingAddress)
            if (kwargs.get("include_previews", False)):
                d["wholeRefPreview"] = self.expand_ref(self.wholeRef, kwargs.get("he_text_ja"),
                                                       kwargs.get("en_text_ja"))
                if d.get("refs"):
                    d["refsPreview"] = []
                    for r in d["refs"]:
                        d["refsPreview"].append(self.expand_ref(r, kwargs.get("he_text_ja"), kwargs.get("en_text_ja")))
                else:
                    d["refsPreview"] = None
        return d

    # Move this over to Ref and cache it?
    def expand_ref(self, tref, he_text_ja=None, en_text_ja=None):
        from . import text
        from sefaria.utils.util import text_preview

        oref = text.Ref(tref)
        if oref.is_spanning():
            oref = oref.first_spanned_ref()
        if he_text_ja is None and en_text_ja is None:
            t = text.TextFamily(oref, context=0, pad=False, commentary=False)
            preview = text_preview(t.text, t.he) if (t.text or t.he) else []
        else:
            preview = text_preview(en_text_ja.subarray_with_ref(oref).array(),
                                   he_text_ja.subarray_with_ref(oref).array())

        return preview

    def validate(self):
        if getattr(self, "depth", None) is None:
            raise IndexSchemaError("Missing Parameter 'depth' in {}".format(self.__class__.__name__))
        if self.depth == 0:
            TitledTreeNode.validate(
                self)  # Skip over NumberedTitledTreeNode validation, which requires fields we don't have
        elif self.depth > 0:
            for k in ["addressTypes", "sectionNames", "refs"]:
                if getattr(self, k, None) is None:
                    raise IndexSchemaError("Missing Parameter '{}' in {}".format(k, self.__class__.__name__))
            super(ArrayMapNode, self).validate()

    def ref(self):
        from . import text
        return text.Ref(self.wholeRef)


"""
                -------------------------
                 Index Schema Tree Nodes
                -------------------------
"""


class SchemaNode(TitledTreeNode):
    """
    A node in an Index Schema tree.
    Schema nodes form trees which define a storage format.
    At this level, keys, storage addresses, and recursive content constructors are defined.
    Conceptually, there are two types of Schema node:
    - Schema Structure Nodes define nodes which have child nodes, and do not store content.
    - Schema Content Nodes define nodes which store content, and do not have child nodes
    The two are both handled by this class, with calls to "if self.children" to distinguishing behavior.

    """
    is_virtual = False
    optional_param_keys = ["match_templates", "numeric_equivalent", "ref_resolver_context_swaps", 'referenceable']

    def __init__(self, serial=None, **kwargs):
        """
        Construct a SchemaNode
        :param serial: The serialized form of this subtree
        :param kwargs: "index": The Index object that this tree is rooted in.
        :return:
        """
        super(SchemaNode, self).__init__(serial, **kwargs)
        self.index = kwargs.get("index", None)

    def _init_defaults(self):
        super(SchemaNode, self)._init_defaults()
        self.key = None
        self.checkFirst = None
        self._address = []

    def validate(self):
        super(SchemaNode, self).validate()

        # if not all(ord(c) < 128 for c in self.title_group.primary_title("en")):
        #     raise InputError("Primary English title may not contain non-ascii characters")

        if not getattr(self, "key", None):
            raise IndexSchemaError("Schema node missing key")

        if "." in self.key:  # Mongo doesn't like . in keys
            raise IndexSchemaError("'.' is not allowed in key names.")

        if self.default and self.key != "default":
            raise IndexSchemaError("'default' nodes need to have key name 'default'")

    def concrete_children(self):
        return [c for c in self.children if not c.is_virtual]

    def create_content(self, callback=None, *args, **kwargs):
        """
        Tree visitor for building content trees based on this Index tree - used for counts and versions
        Callback is called for content nodes only.
        :param callback:
        :return:
        """
        if self.concrete_children():
            return {node.key: node.create_content(callback, *args, **kwargs) for node in self.concrete_children()}
        else:
            if not callback:
                return None
            return callback(self, *args, **kwargs)

    def create_skeleton(self):
        return self.create_content(lambda n: [])

    def add_primary_titles(self, en_title, he_title, key_as_title=True):
        self.add_title(en_title, 'en', primary=True)
        self.add_title(he_title, 'he', primary=True)
        if key_as_title:
            self.key = en_title

    def visit_content(self, callback, *contents, **kwargs):
        """
        Tree visitor for traversing content nodes of existing content trees based on this Index tree and passing them to callback.
        Outputs a content tree.
        Callback is called for content nodes only.
        :param contents: one tree or many
        :param callback:
        :return:
        """
        if self.children:
            dict = {}
            for node in self.concrete_children():
                # todo: abstract out or put in helper the below reduce
                c = [tree[node.key] for tree in contents]
                dict[node.key] = node.visit_content(callback, *c, **kwargs)
            return dict
        else:
            return self.create_content(callback, *contents, **kwargs)

    def visit_structure(self, callback, content, **kwargs):
        """
        Tree visitor for traversing existing structure nodes of content trees based on this Index and passing them to callback.
        Traverses from bottom up, with intention that this be used to aggregate content from content nodes up.
        Modifies contents in place.
        :param callback:
        :param args:
        :param kwargs:
        :return:
        """
        if self.concrete_children():
            for node in self.concrete_children():
                node.visit_structure(callback, content)
            callback(self, content.content_node(self), **kwargs)

    def as_index_contents(self):
        res = self.index.contents(raw=True)
        res["title"] = self.full_title("en")
        res["heTitle"] = self.full_title("he")
        res['schema'] = self.serialize(expand_shared=True, expand_titles=True, translate_sections=True)
        res["titleVariants"] = self.full_titles("en")
        if self.all_node_titles("he"):
            res["heTitleVariants"] = self.full_titles("he")
        if self.index.has_alt_structures():
            res['alts'] = {}
            if not self.children:  # preload text and pass it down to the preview generation
                from . import text
                he_text_ja = text.TextChunk(self.ref(), "he").ja()
                en_text_ja = text.TextChunk(self.ref(), "en").ja()
            else:
                he_text_ja = en_text_ja = None
            for key, struct in self.index.get_alt_structures().items():
                res['alts'][key] = struct.serialize(expand_shared=True, expand_refs=True, he_text_ja=he_text_ja,
                                                    en_text_ja=en_text_ja, expand_titles=True)
            del res['alt_structs']
        return res

    def serialize(self, **kwargs):
        """
        :param callback: function applied to dictionary before it's returned.  Invoked on concrete nodes, not the abstract level.
        :return string: serialization of the subtree rooted in this node
        """
        d = super(SchemaNode, self).serialize(**kwargs)
        d["key"] = self.key
        if getattr(self, "checkFirst", None) is not None:
            d["checkFirst"] = self.checkFirst
        return d

    # http://stackoverflow.com/a/14692747/213042
    # http://stackoverflow.com/a/16300379/213042
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

    def ref(self, force_update=False):
        from . import text
        d = {
            "index": self.index,
            "book": self.full_title("en", force_update=force_update),
            "primary_category": self.index.get_primary_category(),
            "index_node": self,
            "sections": [],
            "toSections": []
        }
        return text.Ref(_obj=d)

    def first_section_ref(self):
        if self.children:
            return self.ref()
        return self.ref().padded_ref()

    def last_section_ref(self):
        if self.children:
            return self.ref()

        from . import version_state
        from . import text

        sn = version_state.StateNode(snode=self)
        sections = [i + 1 for i in sn.ja("all").last_index(self.depth - 1)]

        d = self.ref()._core_dict()
        d["sections"] = sections
        d["toSections"] = sections
        return text.Ref(_obj=d)

    def find_string(self, regex_str, cleaner=lambda x: x, strict=True, lang='he', vtitle=None):
        """
        See TextChunk.text_index_map
        :param regex_str:
        :param cleaner:
        :param strict:
        :param lang:
        :param vtitle:
        :return:
        """

        def traverse(node):
            matches = []
            if node.children:
                for child in node.children:
                    temp_matches = traverse(child)
                    matches += temp_matches
            else:
                return node.ref().text(lang=lang, vtitle=vtitle).find_string(regex_str, cleaner=cleaner, strict=strict)

        return traverse(self)

    def text_index_map(self, tokenizer=lambda x: re.split(r'\s+', x), strict=True, lang='he', vtitle=None):
        """
        See TextChunk.text_index_map
        :param tokenizer:
        :param strict:
        :param lang:
        :return:
        """

        def traverse(node, callback, offset=0):
            index_list, ref_list, temp_offset = callback(node)
            if node.children:
                for child in node.children:
                    temp_index_list, temp_ref_list, temp_offset = traverse(child, callback, offset)
                    index_list += temp_index_list
                    ref_list += temp_ref_list
                    offset = temp_offset
            else:
                index_list = [i + offset for i in index_list]
                offset += temp_offset
            return index_list, ref_list, offset

        def callback(node):
            if not node.children:
                index_list, ref_list, total_len = node.ref().text(lang=lang, vtitle=vtitle).text_index_map(tokenizer,
                                                                                                           strict=strict)
                return index_list, ref_list, total_len
            else:
                return [], [], 0

        index_list, ref_list, _ = traverse(self, callback)
        return index_list, ref_list

    def nodes_missing_content(self):
        """
        Used to identify nodes in the tree that have no content
        :return: (bool-> True if node is missing content, list)
        The list is a list of nodes that represent the root of an "empty" tree. If a SchemaNode has three children where
        all three are missing content, only the parent SchemaNode will be in the list.
        """
        if self.is_leaf():
            if self.ref().text('en').is_empty() and self.ref().text('he').is_empty():
                return True, [self]
            else:
                return False, []

        children_results = [child.nodes_missing_content() for child in self.children]

        # If all my children are empty nodes, I am an empty node. Since I am the root of an empty tree, I add myself
        # to the list of empty nodes instead of my children
        if all([result[0] for result in children_results]):
            return True, [self]
        else:
            return False, reduce(lambda x, y: x + y, [result[1] for result in children_results])

    def all_children(self):
        return self.traverse_to_list(lambda n, i: list(n.all_children()) if n.is_virtual else [n])[1:]

    def __eq__(self, other):
        return self.address() == other.address()

    def __ne__(self, other):
        return not self.__eq__(other)


class JaggedArrayNode(SchemaNode, NumberedTitledTreeNode):
    """
    A :class:`SchemaNode` that defines JaggedArray content and can be addressed by :class:`AddressType`
    Used both for:
    - Structure Nodes whose children can be addressed by Integer or other :class:`AddressType`
    - Content Nodes that define the schema for JaggedArray stored content
    """
    optional_param_keys = SchemaNode.optional_param_keys + ["lengths", "toc_zoom", "referenceableSections",
                                                            "isSegmentLevelDiburHamatchil", "diburHamatchilRegexes",
                                                            'index_offsets_by_depth']

    def __init__(self, serial=None, **kwargs):
        # call SchemaContentNode.__init__, then the additional parts from NumberedTitledTreeNode.__init__
        SchemaNode.__init__(self, serial, **kwargs)

        # Below are the elements of NumberedTitledTreeNode that go beyond SchemaNode init.
        self._regexes = {}
        self._init_address_classes()

    def validate(self):
        # this is minorly repetitious, at the top tip of the diamond inheritance.
        SchemaNode.validate(self)
        NumberedTitledTreeNode.validate(self)
        self.check_index_offsets_by_depth()

    def check_index_offsets_by_depth(self):
        if hasattr(self, 'index_offsets_by_depth'):
            assert all(int(num) <= self.depth for num in self.index_offsets_by_depth)

            def check_offsets(to_check, depth=0):
                if depth == 0:
                    assert isinstance(to_check, int)
                else:
                    for array in to_check:
                        check_offsets(array, depth - 1)

            for k, v in self.index_offsets_by_depth.items():
                check_offsets(v, int(k) - 1)

    def has_numeric_continuation(self):
        return True

    def as_index_contents(self):
        res = super(JaggedArrayNode, self).as_index_contents()
        res["sectionNames"] = self.sectionNames
        res["depth"] = self.depth
        return res

    @staticmethod
    def get_index_offset(section_indexes, index_offsets_by_depth):
        current_depth = len(section_indexes) + 1
        if not index_offsets_by_depth or str(current_depth) not in index_offsets_by_depth:
            return 0
        return reduce(lambda x, y: x[y], section_indexes, index_offsets_by_depth[str(current_depth)])

    def trim_index_offsets_by_sections(self, sections, toSections, depths=None):
        """
        Trims `self.index_offsets_by_depth` according to `sections` and `toSections`
        @param sections:
        @param toSections:
        @param depths:
        @return:
        """
        index_offsets_by_depth = copy.deepcopy(getattr(self, 'index_offsets_by_depth', {}))
        if index_offsets_by_depth and sections:
            if not depths:
                depths = sorted([int(x) for x in index_offsets_by_depth.keys()])
            for depth in depths:
                if depth == 1:
                    continue
                if len(sections) > depth - 2:
                    for d in range(depth, max(depths) + 1):
                        last = reduce(lambda x, _: x[-1], range(depth - 2), index_offsets_by_depth[str(d)])
                        del last[toSections[depth - 2]:]
                        first = reduce(lambda x, _: x[0], range(depth - 2), index_offsets_by_depth[str(d)])
                        del first[:sections[depth - 2] - 1]
        return index_offsets_by_depth


class StringNode(JaggedArrayNode):
    """
    A :class:`JaggedArrayNode` with depth 0 - effectively defining a string.
    """

    def __init__(self, serial=None, **kwargs):
        super(StringNode, self).__init__(serial, **kwargs)
        self.depth = 0
        self.addressTypes = []
        self.sectionNames = []

    def serialize(self, **kwargs):
        d = super(StringNode, self).serialize(**kwargs)
        d["nodeType"] = "JaggedArrayNode"
        return d


"""
                -------------------------------------
                 Index Schema Tree Nodes - Virtual
                -------------------------------------
"""


class VirtualNode(TitledTreeNode):
    is_virtual = True  # False on SchemaNode
    entry_class = None

    def __init__(self, serial=None, **kwargs):
        """
        Abstract superclass for SchemaNodes that are not backed by Versions.
        :param serial:
        :param kwargs:
        """
        super(VirtualNode, self).__init__(serial, **kwargs)
        self.index = kwargs.get("index", None)

    def _init_defaults(self):
        super(VirtualNode, self)._init_defaults()
        self.index = None

    def address(self):
        return self.parent.address()

    def create_dynamic_node(self, title, tref):
        return self.entry_class(self, title, tref)

    def first_child(self):
        pass

    def last_child(self):
        pass

    def supports_language(self, lang):
        raise Exception("supports_language needs to be overriden by subclasses")


class DictionaryEntryNode(TitledTreeNode):
    is_virtual = True

    def __init__(self, parent, title=None, tref=None, word=None, lexicon_entry=None):
        """
        A schema node created on the fly, in memory, to correspond to a dictionary entry.
        Created by a DictionaryNode object.
        Can be instantiated with title+tref or word
        :param parent:
        :param title:
        :param tref:
        :param word:
        :param lexicon_entry: LexiconEntry. if you pass this param and don't pass title, tref or word, then this will bootstrap the DictionaryEntryNode and avoid an extra mongo call
        """
        if title and tref:
            self.title = title
            self._ref_regex = regex.compile("^" + regex.escape(title) + r"[, _]*(\S[^0-9.]*)(?:[. ](\d+))?$")
            self._match = self._ref_regex.match(tref)
            self.word = self._match.group(1) or ""
        elif word:
            self.word = word
        elif lexicon_entry:
            self.lexicon_entry = lexicon_entry
            self.has_word_match = bool(self.lexicon_entry)
            self.word = self.lexicon_entry.headword

        super(DictionaryEntryNode, self).__init__({
            "titles": [{
                "lang": "he",
                "text": self.word,
                "primary": True
            },
                {
                    "lang": "en",
                    "text": self.word,
                    "primary": True
                }]
        })

        self.parent = parent
        self.index = self.parent.index
        self.sectionNames = ["Line"]  # Hacky hack
        self.depth = 1
        self.addressTypes = ["Integer"]
        self._addressTypes = [AddressInteger(0)]

        if self.word:
            self.lexicon_entry = self.parent.dictionaryClass().load(
                {"parent_lexicon": self.parent.lexiconName, "headword": self.word})
            self.has_word_match = bool(self.lexicon_entry)

        if not self.word or not self.has_word_match:
            raise DictionaryEntryNotFoundError("Word not found in {}".format(self.parent.full_title()),
                                               self.parent.lexiconName, self.parent.full_title(), self.word)

    def __eq__(self, other):
        return self.address() == other.address()

    def __ne__(self, other):
        return not self.__eq__(other)

    def has_numeric_continuation(self):
        return True

    def has_titled_continuation(self):
        return False

    def get_sections(self):
        s = self._match.group(2)
        return [int(s)] if s else []

    def address_class(self, depth):
        return self._addressTypes[depth]

    def get_index_title(self):
        return self.parent.lexicon.index_title

    def get_version_title(self, lang):
        return self.parent.lexicon.version_title

    def get_text(self):
        if not self.has_word_match:
            return ["No Entry for {}".format(self.word)]

        return self.lexicon_entry.as_strings()

    def address(self):
        return self.parent.address() + [self.word]

    def prev_sibling(self):
        return self.prev_leaf()

    def next_sibling(self):
        return self.next_leaf()

    # Currently assumes being called from leaf node
    def next_leaf(self):
        if not self.has_word_match:
            return None
        try:
            return self.__class__(parent=self.parent, word=self.lexicon_entry.next_hw)
        except AttributeError:
            return None

    # Currently assumes being called from leaf node
    def prev_leaf(self):
        if not self.has_word_match:
            return None
        try:
            return self.__class__(parent=self.parent, word=self.lexicon_entry.prev_hw)
        except AttributeError:
            return None

    # This is identical to SchemaNode.ref().  Inherit?
    def ref(self):
        from . import text
        d = {
            "index": self.index,
            "book": self.full_title("en"),
            "primary_category": self.index.get_primary_category(),
            "index_node": self,
            "sections": [],
            "toSections": []
        }
        return text.Ref(_obj=d)


class DictionaryNode(VirtualNode):
    """
    A schema node corresponding to the entirety of a dictionary.
    The parent of DictionaryEntryNode objects, which represent individual entries
    """
    required_param_keys = ["lexiconName", "firstWord", "lastWord"]
    optional_param_keys = ["headwordMap"]
    entry_class = DictionaryEntryNode

    def __init__(self, serial=None, **kwargs):
        """
        Construct a SchemaNode
        :param serial: The serialized form of this subtree
        :param kwargs: "index": The Index object that this tree is rooted in.
        :return:
        """
        super(DictionaryNode, self).__init__(serial, **kwargs)

        from .lexicon import LexiconEntrySubClassMapping, Lexicon

        self.lexicon = Lexicon().load({"name": self.lexiconName})

        try:
            self.dictionaryClass = LexiconEntrySubClassMapping.lexicon_class_map[self.lexiconName]

        except KeyError:
            raise IndexSchemaError("No matching class for {} in DictionaryNode".format(self.lexiconName))

    def _init_defaults(self):
        super(DictionaryNode, self)._init_defaults()

    def validate(self):
        super(DictionaryNode, self).validate()

    def first_child(self):
        try:
            return self.entry_class(self, word=self.firstWord)
        except DictionaryEntryNotFoundError:
            return None

    def last_child(self):
        try:
            return self.entry_class(self, word=self.lastWord)
        except DictionaryEntryNotFoundError:
            return None

    def all_children(self):
        lexicon_entry_set = LexiconEntrySet({"parent_lexicon": self.lexiconName})
        for lexicon_entry in lexicon_entry_set:
            yield self.entry_class(self, lexicon_entry=lexicon_entry)

    def serialize(self, **kwargs):
        """
        :return string: serialization of the subtree rooted in this node
        """
        d = super(DictionaryNode, self).serialize(**kwargs)
        d["nodeType"] = "DictionaryNode"
        d["lexiconName"] = self.lexiconName
        d["headwordMap"] = self.headwordMap
        d["firstWord"] = self.firstWord
        d["lastWord"] = self.lastWord
        return d

    def get_child_order(self, child):
        if isinstance(child, DictionaryEntryNode):
            if hasattr(child.lexicon_entry, "rid"):
                return str(child.lexicon_entry.rid)
            else:
                return child.word
        else:
            return ""

    # This is identical to SchemaNode.ref() and DictionaryEntryNode.ref().  Inherit?
    def ref(self):
        from . import text
        d = {
            "index": self.index,
            "book": self.full_title("en"),
            "primary_category": self.index.get_primary_category(),
            "index_node": self,
            "sections": [],
            "toSections": []
        }
        return text.Ref(_obj=d)

    def supports_language(self, lang):
        return lang == self.lexicon.version_lang


class SheetNode(NumberedTitledTreeNode):
    is_virtual = True
    supported_languages = ["en", "he"]

    def __init__(self, sheet_library_node, title=None, tref=None):
        """
        A node created on the fly, in memory, to correspond to a sheet.
        In the case of sheets, the dynamic nodes created present as the root node, with section info.
        :param parent:
        :param title:
        :param tref:
        :param word:
        """
        assert title and tref

        self.title = title
        self.parent = None
        self.depth = 2
        self.sectionNames = ["Sheet", "Segment"]
        self.addressTypes = ["Integer", "Integer"]
        self.index = sheet_library_node.index
        super(SheetNode, self).__init__(None)

        self._sheetLibraryNode = sheet_library_node
        self.title_group = sheet_library_node.title_group

        self._ref_regex = regex.compile("^" + regex.escape(
            title) + self.after_title_delimiter_re + "([0-9]+)(?:" + self.after_address_delimiter_ref + "([0-9]+)|$)")
        self._match = self._ref_regex.match(tref)
        if not self._match:
            raise InputError("Could not find sheet ID in sheet ref")
        self.sheetId = int(self._match.group(1))
        if not self.sheetId:
            raise Exception

        self.nodeId = int(self._match.group(2)) if self._match.group(2) else None
        self._sections = [self.sheetId] + ([self.nodeId] if self.nodeId else [])

        self.sheet_object = db.sheets.find_one({"id": int(self.sheetId)})
        if not self.sheet_object:
            raise SheetNotFoundError

    def has_numeric_continuation(self):
        return False  # What about section level?

    def has_titled_continuation(self):
        return False

    def get_sections(self):
        return self._sections

    def get_index_title(self):
        return self.index.title

    def get_version_title(self, lang):
        return "Dummy"

    def return_text_from_sheet_source(self, source):
        if source.get("text"):
            return (source.get("text"))
        elif source.get("outsideText"):
            return (source.get("outsideText"))
        elif source.get("outsideBiText"):
            return (source.get("outsideBiText"))
        elif source.get("comment"):
            return (source.get("comment"))
        elif source.get("media"):
            return (source.get("media"))

    def get_text(self):
        text = []
        for source in self.sheet_object.get("sources"):
            if self.nodeId:
                if self.nodeId == source.get("node"):
                    text.append(self.return_text_from_sheet_source(source))
                    break
            else:
                text.append(self.return_text_from_sheet_source(source))

        return text

    # def address(self):
    #    return self.parent.address() + [self.sheetId]

    def prev_sibling(self):
        return None

    def next_sibling(self):
        return None

    def next_leaf(self):
        return None

    def prev_leaf(self):
        return None

    def ref(self):
        from . import text
        d = {
            "index": self.index,
            "book": self.full_title("en"),
            "primary_category": self.index.get_primary_category(),
            "index_node": self,
            "sections": self._sections,
            "toSections": self._sections[:]
        }
        return text.Ref(_obj=d)


class SheetLibraryNode(VirtualNode):
    entry_class = SheetNode

    # These tree walking methods are needed, currently, so that VersionState doesn't get upset.
    # Seems like there must be a better way to do an end run around VersionState
    def create_content(self, callback=None, *args, **kwargs):
        if not callback:
            return None
        return callback(self, *args, **kwargs)

    def visit_content(self, callback, *contents, **kwargs):
        return self.create_content(callback, *contents, **kwargs)

    def visit_structure(self, callback, content, **kwargs):
        pass

    def serialize(self, **kwargs):
        """
        :return string: serialization of the subtree rooted in this node
        """
        d = super(SheetLibraryNode, self).serialize(**kwargs)
        d["nodeType"] = "SheetLibraryNode"
        return d

    def supports_language(self, lang):
        return True


"""
{
    "title" : "Sheet",
    "schema" : {
        "titles" : [
            {
                "text" : "דף",
                "primary" : true,
                "lang" : "he"
            },
            {
                "text" : "Sheet",
                "primary" : true,
                "lang" : "en"
            }
        ],
        nodes: [{
            "default" : true,
            "nodeType" : "SheetLibraryNode"
        }]
    }
    "category": ["_unlisted"]    #!!!!!
}

"""

"""
                ------------------------------------
                 Index Schema Trees - Address Types
                ------------------------------------
"""


class AddressType(object):
    """
    Defines a scheme for referencing and addressing a level of a Jagged Array.
    Used by :class:`NumberedTitledTreeNode`
    """
    special_cases = {}
    section_patterns = {
        'he': None,
        'en': None
    }
    reish_samekh_reg = "(?:\u05e1(?:\u05d9\u05e9\\s+)?|\u05e8(?:\u05d5\u05e3\\s+)?)?"  # matches letters reish or samekh or words reish or sof. these are common prefixes for many address types

    def __init__(self, order, length=None):
        self.order = order
        self.length = length

    def regex(self, lang, group_id=None, **kwargs):
        """
        The regular expression part that matches this address reference, wrapped with section names, if provided
        :param lang: "en" or "he"
        :param group_id: The id of the regular expression group the this match will be captured in
        :param kwargs: 'strict' kwarg indicates that section names are required to match
        :return string: regex component
        """
        try:
            if self.section_patterns[lang]:
                strict = kwargs.get("strict", False)
                reg = self.section_patterns[lang]
                if not strict:
                    reg += "?"
                reg += self._core_regex(lang, group_id, **kwargs)
                return reg
            else:
                return self._core_regex(lang, group_id, **kwargs)
        except KeyError:
            raise Exception("Unknown Language passed to AddressType: {}".format(lang))

    def _core_regex(self, lang, group_id=None, **kwargs):
        """
        The regular expression part that matches this address reference
        :param lang: "en" or "he"
        :param group_id: The id of the regular expression group the this match will be captured in
        :return string: regex component
        """
        pass

    @staticmethod
    def hebrew_number_regex():
        """
        Regular expression component to capture a number expressed in Hebrew letters
        :return string:
        \p{Hebrew} ~= [\\u05d0–\\u05ea]
        """
        return r"""                                    # 1 of 3 styles:
        ((?=[\u05d0-\u05ea]+(?:"|\u05f4|\u201c|\u201d|'')[\u05d0-\u05ea])    # (1: ") Lookahead:  At least one letter, followed by double-quote, two single quotes, right fancy double quote, or gershayim, followed by  one letter
                \u05ea*(?:"|\u05f4|\u201c|\u201d|'')?				    # Many Tavs (400), maybe dbl quote
                [\u05e7-\u05ea]?(?:"|\u05f4|\u201c|\u201d|'')?	    # One or zero kuf-tav (100-400), maybe dbl quote
                [\u05d8-\u05e6]?(?:"|\u05f4|\u201c|\u201d|'')?	    # One or zero tet-tzaddi (9-90), maybe dbl quote
                [\u05d0-\u05d8]?					    # One or zero alef-tet (1-9)															#
            |[\u05d0-\u05ea]['\u05f3\u2018\u2019]					# (2: ') single letter, followed by a single quote, geresh, or right fancy quote
            |(?=[\u05d0-\u05ea])					    # (3: no punc) Lookahead: at least one Hebrew letter
                \u05ea*								    # Many Tavs (400)
                [\u05e7-\u05ea]?					    # One or zero kuf-tav (100-400)
                [\u05d8-\u05e6]?					    # One or zero tet-tzaddi (9-90)
                [\u05d0-\u05d8]?					    # One or zero alef-tet (1-9)
        )"""

    def toNumber(self, lang, s):
        """
        Return the numerical form of s in this address scheme
        :param s: The address component
        :param lang: "en" or "he"
        :return int:
        """
        pass

    def is_special_case(self, s):
        return s in self.special_cases

    def to_numeric_possibilities(self, lang, s, **kwargs):
        if s in self.special_cases:
            return self.special_cases[s]
        return [self.toNumber(lang, s)]

    @classmethod
    def can_match_out_of_order(cls, lang, s):
        """
        Can `s` match out of order when parsing sections?
        @param s:
        @return:
        """
        return True

    def toIndex(self, lang, s):
        return self.toNumber(lang, s) - 1

    def format_count(self, name, number):
        return {name: number}

    @classmethod
    def get_all_possible_sections_from_string(cls, lang, s, fromSections=None, strip_prefixes=False):
        """
        For string `s`, parse to sections using all address types that `cls` inherits from
        Useful for parsing ambiguous sections, e.g. for AddressPerek פ"ח = 8 but for its superclass AddressInteger, it equals 88.
        :param fromSections: optional. in case of parsing toSections, these represent the sections. Used for parsing edge-case of toSections='b' which is relative to sections
        :param strip_prefixes: optional. if true, consider possibilities when stripping potential prefixes
        """
        from sefaria.utils.hebrew import get_prefixless_inds

        sections = []
        toSections = []
        addr_classes = []
        starti_list = [0]
        if strip_prefixes and lang == 'he':
            starti_list += get_prefixless_inds(s)
        for starti in starti_list:
            curr_s = s[starti:]
            for SuperClass in cls.__mro__:  # mro gives all super classes
                if SuperClass == AddressType: break
                if SuperClass in {AddressInteger,
                                  AddressTalmud} and starti > 0: continue  # prefixes don't really make sense on AddressInteger or Talmud (in my opinion)
                addr = SuperClass(
                    0)  # somewhat hacky. trying to get access to super class implementation of `regex` but actually only AddressTalmud implements this function. Other classes just overwrite class fields which modify regex's behavior. Simplest to just instantiate the appropriate address and use it.
                section_str = None
                if addr.is_special_case(curr_s):
                    section_str = curr_s
                else:
                    strict = SuperClass not in {AddressAmud,
                                                AddressTalmud}  # HACK: AddressTalmud doesn't inherit from AddressInteger so it relies on flexibility of not matching "Daf"
                    regex_str = addr.regex(lang, strict=strict, group_id='section') + "$"  # must match entire string
                    if regex_str is None: continue
                    reg = regex.compile(regex_str, regex.VERBOSE)
                    match = reg.match(curr_s)
                    if match:
                        section_str = match.group('section')
                if section_str:
                    temp_sections = addr.to_numeric_possibilities(lang, section_str, fromSections=fromSections)
                    temp_toSections = temp_sections[:]
                    if hasattr(cls, "lacks_amud") and cls.lacks_amud(section_str, lang) and not fromSections:
                        temp_toSections = [sec + 1 for sec in temp_toSections]
                    sections += temp_sections
                    toSections += temp_toSections
                    addr_classes += [SuperClass] * len(temp_sections)

        if len(sections) > 0:
            # make sure section, toSection pairs are unique. prefer higher level address_types since these are more generic
            section_map = {}
            for i, (sec, toSec, addr) in enumerate(zip(sections, toSections, addr_classes)):
                section_map[(sec, toSec)] = (i, sec, toSec, addr)
            _, sections, toSections, addr_classes = zip(*sorted(section_map.values(), key=lambda x: x[0]))
        return sections, toSections, addr_classes

    @classmethod
    def toStr(cls, lang, i, **kwargs):
        if lang == "en":
            return str(i)
        elif lang == "he":
            return int_to_tib(i)

    @staticmethod
    def to_str_by_address_type(atype, lang, i):
        """
        Return string verion of `i` given `atype`
        :param str atype: name of address type
        :param str lang: "en" or "he"
        """
        try:
            klass = globals()["Address" + atype]
        except KeyError:
            raise IndexSchemaError("No matching class for addressType {}".format(atype))
        return klass(0).toStr(lang, i)

    @staticmethod
    def to_class_by_address_type(atype):
        """
        Return class that corresponds to 'atype'
        :param atype:
        :return:
        """
        try:
            klass = globals()["Address" + atype]
        except KeyError:
            raise IndexSchemaError("No matching class for addressType {}".format(atype))
        return klass(0)

    # Is this used?
    def storage_offset(self):
        return 0


class AddressDictionary(AddressType):
    # Important here is language of the dictionary, not of the text where the reference is.
    def _core_regex(self, lang, group_id=None, **kwargs):
        if group_id:
            reg = r"(?P<" + group_id + r">"
        else:
            reg = r"("

        reg += r".+"
        return reg

    def toNumber(self, lang, s):
        pass

    def toStr(cls, lang, i, **kwargs):
        pass


class AddressAmud(AddressType):
    section_patterns = {
        "en": r"""(?:[Aa]mud(?:im)?\s+)""",
        "he": f'''(?:{AddressType.reish_samekh_reg}\u05e2(?:"|\u05f4|”|''|\u05de\u05d5\u05d3\\s+))'''
        # + (optional: (optional: samekh or reish for sof/reish) Ayin for amud) + [alef or bet] + (optional: single quote of any type (really only makes sense if there's no Ayin beforehand))
    }

    section_num_patterns = {
        "en": "[aAbB]",
        "he": "(?P<amud_letter>[\u05d0\u05d1])['\u05f3\u2018\u2019]?",
    }

    def _core_regex(self, lang, group_id=None, **kwargs):
        if group_id:
            reg = r"(?P<" + group_id + r">"
        else:
            reg = r"("

        reg += self.section_num_patterns[lang] + r")"

        return reg

    def toNumber(self, lang, s, **kwargs):
        if lang == "en":
            return 1 if s in {'a', 'A'} else 2
        elif lang == "he":
            return tib_to_int(s)


class AddressTalmud(AddressType):
    """
    :class:`AddressType` for Talmud style Daf + Amud addresses
    """
    section_patterns = {
        "en": r"""(?:(?:[Ff]olios?|[Dd]af|[Pp](ages?|s?\.))?\s*)""",
        # the internal ? is a hack to allow a non match, even if 'strict'
        "he": "((\u05d1?\u05d3\u05b7?\u05bc?[\u05e3\u05e4\u05f3\u2018\u2019'\"״]\\s+)|(?:\u05e1|\u05e8)?\u05d3\"?)"
        # (Daf, spelled with peh, peh sofit, geresh, gereshayim,  or single or doublequote) OR daled prefix
    }
    _can_match_out_of_order_patterns = None
    he_amud_pattern = AddressAmud(0).regex('he')
    amud_patterns = {
        "en": "[ABabᵃᵇ]",
        "he": '''([.:]|[,\\s]+{})'''.format(he_amud_pattern)
        # Either (1) period / colon (2) some separator + AddressAmud.section_patterns["he"]
    }
    special_cases = {
        "B": [None],
        "b": [None],
        "ᵇ": [None],
    }

    @classmethod
    def oref_to_amudless_tref(cls, ref, lang):
        """
        Remove last amud from `ref`. Assumes `ref` ends in a Talmud address.
        This may have undesirable affect if `ref` doesn't end in a Talmud address
        """
        normal_form = ref._get_normal(lang)
        return re.sub(f"{cls.amud_patterns[lang]}$", '', normal_form)

    @classmethod
    def normal_range(cls, ref, lang):
        if ref.sections[-1] % 2 == 1 and ref.toSections[-1] % 2 == 0:  # starts at amud alef and ends at bet?
            start_daf = AddressTalmud.oref_to_amudless_tref(ref.starting_ref(), lang)
            end_daf = AddressTalmud.oref_to_amudless_tref(ref.ending_ref(), lang)
            if start_daf == end_daf:
                return start_daf
            else:
                range_wo_last_amud = AddressTalmud.oref_to_amudless_tref(ref, lang)
                # looking for rest of ref after dash
                end_range = re.search(f'-(.+)$', range_wo_last_amud).group(1)
                return f"{start_daf}-{end_range}"
        else:  # range is in the form Shabbat 7b-8a, Shabbat 7a-8a, or Shabbat 7b-8b.  no need to special case it
            return ref._get_normal(lang)

    @classmethod
    def lacks_amud(cls, part, lang):
        if lang == "he":
            return re.search(cls.amud_patterns["he"], part) is None
        else:
            return re.search(cls.amud_patterns["en"] + "{1}$", part) is None

    @classmethod
    def parse_range_end(cls, ref, parts, base):
        """
        :param ref: Ref object (example: Zohar 1:2-3)
        :param parts: list of text of Ref; if Ref is a range, list will be of length 2; otherwise, length 1;
        if Ref == Zohar 1:2-3, parts = ["Zohar 1:2", "3"]
        :param base: parts[0] without title; in the above example, base would be "1:2"
        :return:
        """

        if len(parts) == 1:
            # check for Talmud ref without amud, such as Berakhot 2 or Zohar 1:2,
            # we don't want "Berakhot 2a" or "Zohar 1:2a" but "Berakhot 2a-2b" and "Zohar 1:2a-2b"
            # so change toSections if lacks_amud
            if cls.lacks_amud(base, ref._lang):
                ref.toSections[-1] += 1
        elif len(parts) == 2:
            range_parts = parts[1].split(".")  # this was converting space to '.', for some reason.

            he_bet_reg_ex = "^" + cls.he_amud_pattern.replace('[\u05d0\u05d1]',
                                                              '\u05d1')  # don't want to look for Aleph

            if re.search(he_bet_reg_ex, range_parts[-1]):
                # 'Shabbat 23a-b' or 'Zohar 1:2a-b'
                ref.toSections[-1] = ref.sections[-1] + 1
            else:
                if cls.lacks_amud(parts[0], ref._lang) and cls.lacks_amud(parts[1], ref._lang):
                    # 'Shabbat 7-8' -> 'Shabbat 7a-8b'; 'Zohar 3:7-8' -> 'Zohar 3:7a-8b'
                    range_parts[-1] = range_parts[-1] + ('b' if ref._lang == 'en' else ' ב')
                ref._parse_range_end(range_parts)

        # below code makes sure toSections doesn't go pass end of section/book
        if getattr(ref.index_node, "lengths", None):
            end = ref.index_node.lengths[len(ref.sections) - 1]
            while ref.toSections[-1] > end:  # Yoma 87-90 should become Yoma 87a-88a, since it ends at 88a
                ref.toSections[-1] -= 1

    def _core_regex(self, lang, group_id=None, **kwargs):
        if group_id and kwargs.get("for_js", False) == False:
            reg = r"(?P<" + group_id + r">"
        else:
            reg = r"("

        if lang == "en":
            reg += r"\d*" if group_id == "ar0" else r"\d+"  # if ref is Berakhot 2a:1-3a:4, "ar0" is 3a when group_id == "ar0", we don't want to require digit, as ref could be Berakhot 2a-b
            reg += r"{}?)".format(self.amud_patterns["en"])
        elif lang == "he":
            reg += self.hebrew_number_regex() + r'''{}?)'''.format(self.amud_patterns["he"])

        return reg

    def toNumber(self, lang, s, **kwargs):
        amud_b_list = ['b', 'B', 'ᵇ']
        if lang == "en":
            try:
                if re.search(self.amud_patterns["en"] + "{1}$", s):
                    amud = s[-1]
                    s = self.toStr(lang, kwargs['sections']) if s in amud_b_list else s
                    daf = int(s[:-1])
                else:
                    amud = "a"
                    daf = int(s)
            except ValueError:
                raise InputError("Couldn't parse Talmud reference: {}".format(s))

            if self.length and daf > self.length:
                # todo: Catch this above and put the book name on it.  Proably change Exception type.
                raise InputError("{} exceeds max of {} dafs.".format(daf, self.length))

            indx = daf * 2
            if amud in ["A", "a", "ᵃ"]:
                indx -= 1
            return indx
        elif lang == "he":
            num = re.split(r"[.:,\s]", s)[0]
            daf = tib_to_int(num) * 2
            amud_match = re.search(self.amud_patterns["he"] + "$", s)
            if s[-1] == ':' or (amud_match is not None and amud_match.group("amud_letter") == 'ב'):
                return daf  # amud B
            return daf - 1

            # if s[-1] == "." or (s[-1] == u"\u05d0" and len(s) > 2 and s[-2] in ",\s"):

    @classmethod
    def toStr(cls, lang, i, **kwargs):
        i += 1
        daf_num = i // 2
        daf = ""

        if i > daf_num * 2:
            en_daf = "%db" % daf_num
        else:
            en_daf = "%da" % daf_num

        if lang == "en":
            daf = en_daf

        elif lang == "he":
            daf = int_to_tib(en_daf)
        return daf

    def format_count(self, name, number):
        if name == "Daf":
            return {
                "Amud": number,
                "Daf": number / 2
            }
        else:  # shouldn't get here
            return {name: number}

    def storage_offset(self):
        return 2

    def to_numeric_possibilities(self, lang, s, **kwargs):
        """
        Hacky function to handle special case of ranged amud
        @param lang:
        @param s:
        @param kwargs:
        @return:
        """
        fromSections = kwargs['fromSections']
        if s in self.special_cases and fromSections:
            # currently assuming only special case is 'b'
            return [fromSec[-1] + 1 for fromSec in fromSections]
        addr_num = self.toNumber(lang, s)
        possibilities = []
        if fromSections and s == 'ב':
            for fromSec in fromSections:
                if addr_num < fromSec[-1]:
                    possibilities += [fromSec[-1] + 1]
                else:
                    possibilities += [addr_num]
        else:
            possibilities = [addr_num]
        return possibilities

    @staticmethod
    def _get_can_match_out_of_order_pattern(lang):
        regex_str = AddressInteger(0).regex(lang, strict=True, group_id='section') + "$"
        return regex.compile(regex_str, regex.VERBOSE)

    @classmethod
    def can_match_out_of_order(cls, lang, s):
        if not cls._can_match_out_of_order_patterns:
            cls._can_match_out_of_order_patterns = {
                "en": cls._get_can_match_out_of_order_pattern("en"),
                "he": cls._get_can_match_out_of_order_pattern("he"),
            }
        reg = cls._can_match_out_of_order_patterns[lang]
        return reg.match(s) is None


class AddressFolio(AddressType):
    """
    :class:`AddressType` for Folio style #[abcd] addresses
    """
    section_patterns = {
        "en": r"""(?:(?:[Ff]olios?|[Dd]af|[Pp](ages?|s?\.))?\s*)""",
        # the internal ? is a hack to allow a non match, even if 'strict'
        "he": r"(\u05d1?\u05d3\u05b7?\u05bc?[\u05e3\u05e4\u05f3\u2018\u2019'\"״]\s+)"
        # Daf, spelled with peh, peh sofit, geresh, gereshayim,  or single or doublequote
    }

    def _core_regex(self, lang, group_id=None, **kwargs):
        if group_id:
            reg = r"(?P<" + group_id + r">"
        else:
            reg = r"("

        if lang == "en":
            reg += r"\d+[abcdᵃᵇᶜᵈ]?)"
        elif lang == "he":
            # todo: How do these references look in Hebrew?
            reg += self.hebrew_number_regex() + r'''([.:]|[,\s]+(?:\u05e2(?:"|\u05f4|''))?[\u05d0\u05d1])?)'''

        return reg

    def toNumber(self, lang, s, **kwargs):
        if lang == "en":
            try:
                if s[-1] in ["a", "b", "c", "d", 'ᵃ', 'ᵇ', 'ᶜ', 'ᵈ']:
                    amud = s[-1]
                    daf = int(s[:-1])
                else:
                    amud = "a"
                    daf = int(s)
            except ValueError:
                raise InputError("Couldn't parse Talmud reference: {}".format(s))

            if self.length and daf > self.length:
                # todo: Catch this above and put the book name on it.  Proably change Exception type.
                raise InputError("{} exceeds max of {} dafs.".format(daf, self.length))

            indx = daf * 4
            if amud == "a" or amud == "ᵃ":
                indx -= 3
            if amud == "b" or amud == "ᵇ":
                indx -= 2
            if amud == "c" or amud == "ᶜ":
                indx -= 1
            return indx
        elif lang == "he":
            # todo: This needs work
            num = re.split(r"[.:,\s]", s)[0]
            daf = tib_to_int(num) * 2
            if s[-1] == ":" or (
                    s[-1] == "\u05d1"  # bet
                    and
                    ((len(s) > 2 and s[-2] in ", ")  # simple bet
                     or (len(s) > 4 and s[-3] == '\u05e2')  # ayin"bet
                     or (len(s) > 5 and s[-4] == "\u05e2")  # ayin''bet
                    )
            ):
                return daf  # amud B
            return daf - 1

            # if s[-1] == "." or (s[-1] == u"\u05d0" and len(s) > 2 and s[-2] in ",\s"):

    @classmethod
    def toStr(cls, lang, i, **kwargs):
        """

        1 => 1a
        2 => 1b
        3 => 1c
        4 => 1d
        5 => 2a
        6 => 2b
        etc.

        (i // 4) + 1
        """
        daf_num = ((i - 1) // 4) + 1
        mod = i % 4
        folio = "a" if mod == 1 else "b" if mod == 2 else "c" if mod == 3 else "d"
        daf = str(daf_num) + folio

        # todo
        if lang == "he":
            daf = int_to_tib(daf_num)
        return daf

    def format_count(self, name, number):
        if name == "Daf":
            return {
                "Amud": number,
                "Daf": number / 2
            }
        else:  # shouldn't get here
            return {name: number}

    def storage_offset(self):
        return 0


class AddressInteger(AddressType):
    """
    :class:`AddressType` for Integer addresses
    """

    def _core_regex(self, lang, group_id=None, **kwargs):
        if group_id:
            reg = r"(?P<" + group_id + r">"
        else:
            reg = r"("

        if lang == "en":
            reg += r"\d+)"
        elif lang == "he":
            reg += self.hebrew_number_regex() + r")"

        return reg

    def toNumber(self, lang, s, **kwargs):
        if lang == "en":
            return int(s)
        elif lang == "he":
            return tib_to_int(s)

    @classmethod
    def can_match_out_of_order(cls, lang, s):
        """
        By default, this method should only apply to AddressInteger and no subclasses
        Can still be overriden for a specific class that needs to
        """
        return cls != AddressInteger


class AddressAliyah(AddressInteger):
    en_map = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh"]
    he_map = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שביעי"]

    @classmethod
    def toStr(cls, lang, i, **kwargs):
        if lang == "en":
            return cls.en_map[i - 1]
        if lang == "he":
            return cls.he_map[i - 1]


class AddressPerek(AddressInteger):
    special_cases = {
        "פרק קמא": [1, 141],
        "פירקא קמא": [1, 141],
        'פ"ק': [1, 100],  # this is inherently ambiguous (1 or 100)
        "פרק בתרא": [-1],
        'ר"פ בתרא': [-1],
        'ס"פ בתרא': [-1],
    }
    section_patterns = {
        "en": r"""(?:(?:[Cc]h(apters?|\.)|[Pp]erek|s\.)?\s*)""",
        # the internal ? is a hack to allow a non match, even if 'strict'
        "he": fr"""(?:\u05d1?{AddressType.reish_samekh_reg}\u05e4((?:"|\u05f4|''|'\s)|(?=[\u05d0-\u05ea]+(?:"|\u05f4|''|'\s)))   # Peh (for 'perek') maybe followed by a quote of some sort OR lookahead for some letters followed by a quote (e.g. פי״א for chapter 11)
        |\u05e4\u05bc?\u05b6?\u05e8\u05b6?\u05e7(?:\u05d9\u05b4?\u05dd)?\s*                  # or 'perek(ym)' spelled out, followed by space
        )"""
    }


class AddressPasuk(AddressInteger):
    section_patterns = {
        "en": r"""(?:(?:([Vv](erses?|[vs]?\.)|[Pp]ass?u[kq]))?\s*)""",
        # the internal ? is a hack to allow a non match, even if 'strict'
        "he": r"""(?:\u05d1?(?:                                        # optional ב in front
            (?:\u05e4\u05b8?\u05bc?\u05e1\u05d5\u05bc?\u05e7(?:\u05d9\u05dd)?\s*)|    #pasuk spelled out, with a space after
            (?:\u05e4\u05e1(?:['\u2018\u2019\u05f3])\s+)
        ))"""
    }


class AddressMishnah(AddressInteger):
    section_patterns = {
        "en": r"""(?:(?:[Mm](ishnah?|s?\.))?\s*)""",  # the internal ? is a hack to allow a non match, even if 'strict'
        "he": r"""(?:\u05d1?                                                   # optional ב in front
            (?:\u05de\u05b4?\u05e9\u05b0?\u05c1?\u05e0\u05b8?\u05d4\s)			# Mishna spelled out, with a space after
            |(?:\u05de(?:["\u05f4]|'')?)				# or Mem (for 'mishna') maybe followed by a quote of some sort
        )"""
    }


class AddressVolume(AddressInteger):
    """
    :class:`AddressType` for Volume/חלק addresses
    """

    section_patterns = {
        "en": r"""(?:(?:[Vv](olumes?|\.))?\s*)""",  # the internal ? is a hack to allow a non match, even if 'strict'
        "he": r"""(?:\u05d1?                                 # optional ב in front
        (?:\u05d7\u05b5?(?:\u05dc\u05b6?\u05e7|'|\u05f3|\u2018|\u2019)\s+)  # Helek - spelled out with nikkud possibly or followed by a ' or a geresh - followed by space
         |(?:\u05d7["\u05f4])                     # chet followed by gershayim or double quote
        )
        """
    }


class AddressSiman(AddressInteger):
    section_patterns = {
        "en": r"""(?:(?:[Ss]iman)?\s*)""",
        "he": r"""(?:\u05d1?
            (?:[\u05e1\u05e8](?:"|\u05f4|'')\u05e1\s+)  # (reish or samekh) gershayim samekh. (start or end of siman)
            |(?:\u05e1\u05b4?\u05d9\u05de\u05b8?\u05df\s+)			# Siman spelled out with optional nikud, with a space after
            |(?:\u05e1\u05d9(?:["\u05f4'\u05f3\u2018\u2019](?:['\u05f3\u2018\u2019]|\s+)))		# or Samech, Yued (for 'Siman') maybe followed by a quote of some sort
        )"""
    }


class AddressHalakhah(AddressInteger):
    """
    :class:`AddressType` for Halakhah/הלכה addresses
    """
    section_patterns = {
        "en": r"""(?:(?:[Hh]ala[ck]hah?)?\s*)""",  # the internal ? is a hack to allow a non match, even if 'strict'
        "he": r"""(?:\u05d1?
            (?:\u05d4\u05bb?\u05dc\u05b8?\u05db(?:\u05b8?\u05d4|\u05d5\u05b9?\u05ea)\s+)			# Halakhah spelled out, with a space after
            |(?:\u05d4\u05dc?(?:["\u05f4'\u05f3\u2018\u2019](?:['\u05f3\u2018\u2019\u05db]|\s+)?)?)		# or Haeh and possible Lamed(for 'halakhah') maybe followed by a quote of some sort
        )"""
    }


class AddressSeif(AddressInteger):
    section_patterns = {
        "en": r"""(?:(?:[Ss][ae]if)?\s*)""",  # the internal ? is a hack to allow a non match, even if 'strict'
        "he": r"""(?:\u05d1?
            (?:\u05e1[\u05b0\u05b8]?\u05e2\u05b4?\u05d9\u05e3\s+)			# Seif spelled out, with a space after
            |(?:\u05e1(?:\u05e2\u05d9)?(?:['\u2018\u2019\u05f3"\u05f4](?:['\u2018\u2019\u05f3]|\s+)?)?)	# or trie of first three letters followed by a quote of some sort
        )"""
    }


class AddressSeifKatan(AddressInteger):
    section_patterns = {
        "en": r"""(?:(?:[Ss][ae]if Katt?an)?\s*)""",  # the internal ? is a hack to allow a non match, even if 'strict'
        "he": r"""(?:\u05d1?
            (?:\u05e1[\u05b0\u05b8]?\u05e2\u05b4?\u05d9\u05e3\s+\u05e7\u05d8\u05df\s+)			# Seif katan spelled out with or without nikud
            |(?:\u05e1(?:['\u2018\u2019\u05f3"\u05f4](?:['\u2018\u2019\u05f3])?)?\u05e7)(?:['\u2018\u2019\u05f3"\u05f4]['\u2018\u2019\u05f3]?|\s+)?	# or trie of first three letters followed by a quote of some sort
        )"""
    }


class AddressSection(AddressInteger):
    section_patterns = {
        "en": r"""(?:(?:([Ss]ections?|§)?\s*))""",  # the internal ? is a hack to allow a non match, even if 'strict'
        "he": r""""""
    }
