# -*- coding: utf-8 -*-
import copy

import logging
logger = logging.getLogger(__name__)

try:
    import re2 as re
    re.set_fallback_notification(re.FALLBACK_WARNING)
except ImportError:
    logging.warning("Failed to load 're2'.  Falling back to 're' for regular expression parsing. See https://github.com/Sefaria/Sefaria-Project/wiki/Regular-Expression-Engines")
    import re

import regex
from . import abstract as abst
from sefaria.system.database import db
from sefaria.model.lexicon import LexiconEntrySet
from sefaria.system.exceptions import InputError, IndexSchemaError
from sefaria.utils.hebrew import decode_hebrew_numeral, encode_hebrew_numeral, encode_hebrew_daf, hebrew_term

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
    required_attrs = [
        "lang",
        "text"
    ]
    optional_attrs = [
        "primary",
        "presentation"
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
            if not set(title.keys()) == set(self.required_attrs) and not set(title.keys()) <= set(self.required_attrs+self.optional_attrs):
                raise InputError("Title Group titles must only contain the following keys: {}".format(self.required_attrs+self.optional_attrs))
        if '-' in self.primary_title("en"):
            raise InputError("Primary English title may not contain hyphens.")
        if not all(ord(c) < 128 for c in self.primary_title("en")):
            raise InputError("Primary English title may not contain non-ascii characters")

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

    def _process_terms(self):
        # To be called after raw data load
        from sefaria.model import library

        if self.sharedTitle:
            term = library.get_term(self.sharedTitle)
            try:
                self.title_group = term.title_group
            except AttributeError:
                raise IndexError(u"Failed to load term named {}.".format(self.sharedTitle))

    def add_shared_term(self, term):
        self.sharedTitle = term
        self._process_terms()


class Term(abst.AbstractMongoRecord, AbstractTitledObject):
    """
    A Term is a shared title node.  It can be referenced and used by many different Index nodes.
    Examples:  Noah, Perek HaChovel, Even HaEzer
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
        "ref"
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
        #do not allow duplicates:
        for title in self.get_titles():
            other_term = Term().load_by_title(title)
            if other_term and not self.same_record(other_term):
                raise InputError(u"A Term with the title {} in it already exists".format(title))
        self.title_group.validate()
        if self.name != self.get_primary_title():
            raise InputError(u"Term name {} does not match primary title {}".format(self.name, self.get_primary_title()))

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
    klass = None
    if serial.get("nodeType"):
        try:
            klass = globals()[serial.get("nodeType")]
        except KeyError:
            raise IndexSchemaError("No matching class for nodeType {}".format(serial.get("nodeType")))

    if serial.get(kwargs.get("children_attr", "nodes")) or (kwargs.get("struct_title_attr") and serial.get(kwargs.get("struct_title_attr"))):
        #Structure class - use explicitly defined 'nodeType', code overide 'struct_class', or default SchemaNode
        struct_class = klass or kwargs.get("struct_class", SchemaNode)
        return struct_class(serial, **kwargs)
    elif klass:
        return klass(serial, **kwargs)
    elif kwargs.get("leaf_class"):
        return kwargs.get("leaf_class")(serial, **kwargs)
    else:
        raise IndexSchemaError("Schema node has neither 'nodes' nor 'nodeType' and 'leaf_class' not provided: {}".format(serial))


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
        if not self.children: # is leaf
            return self
        return self.first_child().first_leaf()

    def last_leaf(self):
        if not self.children: # is leaf
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

    #Currently assumes being called from leaf node - could integrate a call to first_leaf/last_leaf
    def next_leaf(self):
        return self._next_in_list(self.root().get_leaf_nodes())

    #Currently assumes being called from leaf node - could integrate a call to first_leaf/last_leaf
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
            child.traverse_to_string(callback, **kwargs)

    def traverse_to_string(self, callback, depth=0, **kwargs):
        st = callback(self, depth, **kwargs)
        st += "".join([child.traverse_to_string(callback, depth + 1, **kwargs) for child in self.children])
        return st

    def traverse_to_json(self, callback, depth=0, **kwargs):
        js = callback(self, depth, **kwargs)
        if self.children:
            js[getattr(self, "children_attr")] = [child.traverse_to_json(callback, depth + 1, **kwargs) for child in self.children]
        return js

    def traverse_to_list(self, callback, depth=0, **kwargs):
        listy = callback(self, depth, **kwargs)
        if self.children:
            listy += reduce(lambda a, b: a + b, [child.traverse_to_list(callback, depth + 1, **kwargs) for child in self.children], [])
        return listy

    def serialize(self, **kwargs):
        d = {}
        if self.children:
            d[self.children_attr] = [n.serialize(**kwargs) for n in self.children]

        #Only output nodeType and nodeParameters if there is at least one param. This seems like it may not remain a good measure.
        params = {k: getattr(self, k) for k in self.required_param_keys + self.optional_param_keys if getattr(self, k, None) is not None}
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

    def get_leaf_nodes_to_depth(self, max_depth = None):
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

    after_title_delimiter_re = ur"(?:[,.:\s]|(?:to|\u05d5?\u05d1?(\u05e1\u05d5\u05e3|\u05e8\u05d9\u05e9)))+"  # should be an arg?  \r\n are for html matches
    after_address_delimiter_ref = ur"[,.:\s]+"
    title_separators = [u", "]

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
        return self.title_dict(lang).keys()

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

        this_node_titles = [title["text"] for title in self.get_titles_object() if title["lang"] == lang and title.get("presentation") != "alone"]
        if (not len(this_node_titles)) and (not self.is_default()):
            error = u'No "{}" title found for schema node: "{}"'.format(lang, self.key)
            error += u', child of "{}"'.format(self.parent.full_title("en")) if self.parent else ""
            raise IndexSchemaError(error)
        if baselist:
            node_title_list = [baseName + sep + title for baseName in baselist for sep in self.title_separators for title in this_node_titles]
        else:
            node_title_list = this_node_titles

        alone_node_titles = [title["text"] for title in self.get_titles_object() if title["lang"] == lang and title.get("presentation") == "alone" or title.get("presentation") == "both"]
        node_title_list += alone_node_titles

        for child in self.children:
            if child.default:
                thisnode = child
            else:
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
        #overidden in subclasses
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

    def validate(self):
        super(TitledTreeNode, self).validate()

        if not self.default and not self.sharedTitle and not self.get_titles_object():
            raise IndexSchemaError(u"Schema node {} must have titles, a shared title node, or be default".format(self))

        if self.default and (self.get_titles_object() or self.sharedTitle):
            raise IndexSchemaError(u"Schema node {} - default nodes can not have titles".format(self))

        if not self.default:
            try:
                self.title_group.validate()
            except InputError as e:
                raise IndexSchemaError(u"Schema node {} has invalid titles: {}".format(self, e))

        if self.children and len([c for c in self.children if c.default]) > 1:
            raise IndexSchemaError(u"Schema Structure Node {} has more than one default child.".format(self.key))

        if self.sharedTitle and Term().load({"name": self.sharedTitle}).titles != self.get_titles_object():
            raise IndexSchemaError(u"Schema node {} with sharedTitle can not have explicit titles".format(self))

        #if not self.default and not self.primary_title("he"):
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
                raise IndexSchemaError("Parameter {} in {} {} does not have depth {}".format(p, self.__class__.__name__, self.key, self.depth))

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
        key = (title, lang, anchored, compiled, kwargs.get("for_js"), kwargs.get("match_range"), kwargs.get("strict"), kwargs.get("terminated"), kwargs.get("escape_titles"))
        if not self._regexes.get(key):
            reg = ur"^" if anchored else u""
            title_block = regex.escape(title) if escape_titles else title
            reg += ur"(?P<title>" + title_block + ur")" if capture_title else title_block
            reg += self.after_title_delimiter_re
            addr_regex = self.address_regex(lang, **kwargs)
            reg += ur'(?:(?:' + addr_regex + ur')|(?:[\[({]' + addr_regex + ur'[\])}]))'  # Match expressions with internal parenthesis around the address portion
            reg += ur"(?=[.,:;?!\s})\]<]|$)" if kwargs.get("for_js") else ur"(?=\W|$)" if not kwargs.get("terminated") else ur"$"
            self._regexes[key] = regex.compile(reg, regex.VERBOSE) if compiled else reg
        return self._regexes[key]

    def address_regex(self, lang, **kwargs):
        group = "a0" if not kwargs.get("for_js") else None
        reg = self._addressTypes[0].regex(lang, group, **kwargs)

        if not self._addressTypes[0].stop_parsing(lang):
            for i in range(1, self.depth):
                group = "a{}".format(i) if not kwargs.get("for_js") else None
                reg += u"(" + self.after_address_delimiter_ref + self._addressTypes[i].regex(lang, group, **kwargs) + u")"
                if not kwargs.get("strict", False):
                    reg += u"?"

        if kwargs.get("match_range"):
            #TODO there is a potential error with this regex. it fills in toSections starting from highest depth and going to lowest.
            #TODO Really, the depths should be filled in the opposite order, but it's difficult to write a regex to match.
            #TODO However, most false positives will be filtered out in library._get_ref_from_match()

            reg += ur"(?:\s*([-\u2010-\u2015\u05be]|to)\s*"  # maybe there's a dash (either n or m dash) and a range
            reg += ur"(?=\S)"  # must be followed by something (Lookahead)
            group = "ar0" if not kwargs.get("for_js") else None
            reg += self._addressTypes[0].regex(lang, group, **kwargs)
            if not self._addressTypes[0].stop_parsing(lang):
                reg += u"?"
                for i in range(1, self.depth):
                    reg += ur"(?:(?:" + self.after_address_delimiter_ref + ur")?"
                    group = "ar{}".format(i) if not kwargs.get("for_js") else None
                    reg += u"(" + self._addressTypes[i].regex(lang, group, **kwargs) + u")"
                    # assuming strict isn't relevant on ranges  # if not kwargs.get("strict", False):
                    reg += u")?"
            reg += ur")?"  # end range clause
        return reg

    def sectionString(self, sections, lang="en", title=True, full_title=False):
        assert len(sections) <= self.depth

        ret = u""
        if title:
            ret += self.full_title(lang) if full_title else self.primary_title(lang)
            ret += u" "
        strs = []
        for i in range(len(sections)):
            strs.append(self.address_class(i).toStr(lang, sections[i]))
        ret += u":".join(strs)

        return ret

    def add_structure(self, section_names, address_types=None):
        self.depth = len(section_names)
        self.sectionNames = section_names
        if address_types is None:
            self.addressTypes = [sec if globals().get("Address{}".format(sec), None) else 'Integer' for sec in section_names]
        else:
            self.addressTypes = address_types

    def serialize(self, **kwargs):
        d = super(NumberedTitledTreeNode, self).serialize(**kwargs)
        if kwargs.get("translate_sections"):
                d["heSectionNames"] = map(hebrew_term, self.sectionNames)
        return d


class ArrayMapNode(NumberedTitledTreeNode):
    """
    A :class:`TreeNode` that contains jagged arrays of references.
    Used as the leaf node of alternate structures of Index records.
    (e.g., Parsha structures of chapter/verse stored Tanach, or Perek structures of Daf/Line stored Talmud)
    """
    required_param_keys = ["depth", "wholeRef"]
    optional_param_keys = ["lengths", "addressTypes", "sectionNames", "refs", "includeSections"]  # "addressTypes", "sectionNames", "refs" are not required for depth 0, but are required for depth 1 +
    has_key = False  # This is not used as schema for content

    def get_ref_from_sections(self, sections):
        if not sections:
            return self.wholeRef
        return reduce(lambda a, i: a[i], [s - 1 for s in sections], self.refs)

    def serialize(self, **kwargs):
        d = super(ArrayMapNode, self).serialize(**kwargs)
        if kwargs.get("expand_refs"):
            if getattr(self, "includeSections", None):
                # We assume that with "includeSections", we're going from depth 0 to depth 1, and expanding "wholeRef"
                from . import text

                refs         = text.Ref(self.wholeRef).split_spanning_ref()
                first, last  = refs[0], refs[-1]
                offset       = first.sections[-2] - 1 if first.is_segment_level() else first.sections[-1] - 1

                d["refs"] = [r.normal() for r in refs]
                d["addressTypes"] = first.index_node.addressTypes[-2:-1]
                d["sectionNames"] = first.index_node.sectionNames[-2:-1]
                d["depth"] += 1
                d["offset"] = offset

            if (kwargs.get("include_previews", False)):
                d["wholeRefPreview"] = self.expand_ref(self.wholeRef, kwargs.get("he_text_ja"), kwargs.get("en_text_ja"))
                if d.get("refs"):
                    d["refsPreview"] = []
                    for r in d["refs"]:
                        d["refsPreview"].append(self.expand_ref(r, kwargs.get("he_text_ja"), kwargs.get("en_text_ja")))
                else:
                    d["refsPreview"] = None
        return d

    # Move this over to Ref and cache it?
    def expand_ref(self, tref, he_text_ja = None, en_text_ja = None):
        from . import text
        from sefaria.utils.util import text_preview

        oref = text.Ref(tref)
        if oref.is_spanning():
            oref = oref.first_spanned_ref()
        if he_text_ja is None and en_text_ja is None:
            t = text.TextFamily(oref, context=0, pad=False, commentary=False)
            preview = text_preview(t.text, t.he) if (t.text or t.he) else []
        else:
            preview = text_preview(en_text_ja.subarray_with_ref(oref).array(), he_text_ja.subarray_with_ref(oref).array())

        return preview

    def validate(self):
        if getattr(self, "depth", None) is None:
            raise IndexSchemaError("Missing Parameter 'depth' in {}".format(self.__class__.__name__))
        if self.depth == 0:
            TitledTreeNode.validate(self)  # Skip over NumberedTitledTreeNode validation, which requires fields we don't have
        elif self.depth > 0:
            for k in ["addressTypes", "sectionNames", "refs"]:
                if getattr(self, k, None) is None:
                    raise IndexSchemaError("Missing Parameter '{}' in {}".format(k, self.__class__.__name__))
            super(ArrayMapNode, self).validate()


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

        if not all(ord(c) < 128 for c in self.title_group.primary_title("en")):
            raise InputError("Primary English title may not contain non-ascii characters")

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
        res["title"]   = self.full_title("en")
        res["heTitle"] = self.full_title("he")
        res['schema']  = self.serialize(expand_shared=True, expand_titles=True, translate_sections=True)
        res["titleVariants"] = self.full_titles("en")
        if self.all_node_titles("he"):
            res["heTitleVariants"] = self.full_titles("he")
        if self.index.has_alt_structures():
            res['alts'] = {}
            if not self.children: #preload text and pass it down to the preview generation
                from . import text
                he_text_ja = text.TextChunk(self.ref(), "he").ja()
                en_text_ja = text.TextChunk(self.ref(), "en").ja()
            else:
                he_text_ja = en_text_ja = None
            for key, struct in self.index.get_alt_structures().iteritems():
                res['alts'][key] = struct.serialize(expand_shared=True, expand_refs=True, he_text_ja=he_text_ja, en_text_ja=en_text_ja, expand_titles=True)
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

    def text_index_map(self, tokenizer=lambda x: re.split(u'\s+',x), strict=True, lang='he', vtitle=None):
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
                index_list, ref_list, total_len = node.ref().text(lang=lang, vtitle=vtitle).text_index_map(tokenizer,strict=strict)
                return index_list, ref_list, total_len
            else:
                return [],[], 0

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
            return False, reduce(lambda x, y: x+y, [result[1] for result in children_results])

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
    optional_param_keys = ["lengths", "toc_zoom"]

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

    def has_numeric_continuation(self):
        return True

    def as_index_contents(self):
        res = super(JaggedArrayNode, self).as_index_contents()
        res["sectionNames"] = self.sectionNames
        res["depth"] = self.depth
        return res


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

    is_virtual = True    # False on SchemaNode
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


class DictionaryEntryNotFound(InputError):
    def __init__(self, message, lexicon_name=None, base_title=None, word=None):
        super(DictionaryEntryNotFound, self).__init__(message)
        self.lexicon_name = lexicon_name
        self.base_title = base_title
        self.word = word


class DictionaryEntryNode(TitledTreeNode):
    is_virtual = True
    supported_languages = ["en"]

    def __init__(self, parent, title=None, tref=None, word=None, lexicon_entry=None):
        """
        A schema node created on the fly, in memory, to correspond to a dictionary entry.
        Created by a DictionaryNode object.
        Can be instantiated with title+tref or word
        :param parent:
        :param title:
        :param tref:
        :param word:
        :param lexicon_entry: LexiconEntry. if you pass this param and dont pass title, tref or word, then this will bootstrap the DictionaryEntryNode and avoid an extra mongo call
        """
        if title and tref:
            self.title = title
            self._ref_regex = regex.compile(u"^" + regex.escape(title) + u"[, _]*(\S[^0-9.]*)(?:[. ](\d+))?$")
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
        self.sectionNames = ["Line"]    # Hacky hack
        self.depth = 1
        self.addressTypes = ["Integer"]
        self._addressTypes = [AddressInteger(0)]

        if self.word:
            self.lexicon_entry = self.parent.dictionaryClass().load({"parent_lexicon": self.parent.lexiconName, "headword": self.word})
            self.has_word_match = bool(self.lexicon_entry)

        if not self.word or not self.has_word_match:
            raise DictionaryEntryNotFound("Word not found in {}".format(self.parent.full_title()), self.parent.lexiconName, self.parent.full_title(), self.word)

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
            return [u"No Entry for {}".format(self.word)]

        return self.lexicon_entry.as_strings()

    def address(self):
        return self.parent.address() + [self.word]

    def prev_sibling(self):
        return self.prev_leaf()

    def next_sibling(self):
        return self.next_leaf()

    #Currently assumes being called from leaf node
    def next_leaf(self):
        if not self.has_word_match:
            return None
        try:
            return self.__class__(parent=self.parent, word=self.lexicon_entry.next_hw)
        except AttributeError:
            return None

    #Currently assumes being called from leaf node
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

        from lexicon import LexiconEntrySubClassMapping, Lexicon

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
        except DictionaryEntryNotFound:
            return None

    def last_child(self):
        try:
            return self.entry_class(self, word=self.lastWord)
        except DictionaryEntryNotFound:
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
                return unicode(child.lexicon_entry.rid)
            else:
                return child.word
        else:
            return u""


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

        self._ref_regex = regex.compile(u"^" + regex.escape(title) + self.after_title_delimiter_re + u"([0-9]+)(?:" + self.after_address_delimiter_ref + u"([0-9]+)|$)")
        self._match = self._ref_regex.match(tref)
        self.sheetId = int(self._match.group(1))
        if not self.sheetId:
            raise Exception

        self.nodeId = int(self._match.group(2)) if self._match.group(2) else None
        self._sections = [self.sheetId] + ([self.nodeId] if self.nodeId else [])

        self.sheet_object = db.sheets.find_one({"id": int(self.sheetId)})
        if not self.sheet_object:
            raise InputError



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

    #def address(self):
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
        :param group_id: The id of the regular expression group the this match will be captured in
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
        \p{Hebrew} ~= [\u05d0–\u05ea]
        """
        return ur"""                                    # 1 of 3 styles:
        ((?=[\u05d0-\u05ea]+(?:"|\u05f4|'')[\u05d0-\u05ea])    # (1: ") Lookahead:  At least one letter, followed by double-quote, two single quotes, or gershayim, followed by  one letter
                \u05ea*(?:"|\u05f4|'')?				    # Many Tavs (400), maybe dbl quote
                [\u05e7-\u05ea]?(?:"|\u05f4|'')?	    # One or zero kuf-tav (100-400), maybe dbl quote
                [\u05d8-\u05e6]?(?:"|\u05f4|'')?	    # One or zero tet-tzaddi (9-90), maybe dbl quote
                [\u05d0-\u05d8]?					    # One or zero alef-tet (1-9)															#
            |[\u05d0-\u05ea]['\u05f3]					# (2: ') single letter, followed by a single quote or geresh
            |(?=[\u05d0-\u05ea])					    # (3: no punc) Lookahead: at least one Hebrew letter
                \u05ea*								    # Many Tavs (400)
                [\u05e7-\u05ea]?					    # One or zero kuf-tav (100-400)
                [\u05d8-\u05e6]?					    # One or zero tet-tzaddi (9-90)
                [\u05d0-\u05d8]?					    # One or zero alef-tet (1-9)
        )"""

    def stop_parsing(self, lang):
        """
        If this is true, the regular expression will stop parsing at this address level for this language.
        It is currently checked for only in the first address position, and is used for Hebrew Talmud addresses.
        :param lang: "en" or "he"
        :return bool:
        """
        return False

    def toNumber(self, lang, s):
        """
        Return the numerical form of s in this address scheme
        :param s: The address component
        :param lang: "en" or "he"
        :return int:
        """
        pass

    def toIndex(self, lang, s):
        return self.toNumber(lang, s) - 1

    def format_count(self, name, number):
        return {name: number}

    @classmethod
    def toStr(cls, lang, i, **kwargs):
        if lang == "en":
            return str(i)
        elif lang == "he":
            punctuation = kwargs.get("punctuation", True)
            return encode_hebrew_numeral(i, punctuation=punctuation)

    @staticmethod
    def toStrByAddressType(atype, lang, i):
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

    def storage_offset(self):
        return 0


class AddressDictionary(AddressType):
    # Important here is language of the dictionary, not of the text where the reference is.
    def _core_regex(self, lang, group_id=None):
        if group_id:
            reg = ur"(?P<" + group_id + ur">"
        else:
            reg = ur"("

        reg += ur".+"
        return reg

    def toNumber(self, lang, s):
        pass

    def toStr(cls, lang, i, **kwargs):
        pass



class AddressTalmud(AddressType):
    """
    :class:`AddressType` for Talmud style Daf + Amud addresses
    """
    section_patterns = {
        "en": ur"""(?:(?:[Ff]olios?|[Dd]af|[Pp](ages?|s?\.))?\s*)""",  # the internal ? is a hack to allow a non match, even if 'strict'
        "he": ur"(\u05d1?\u05d3\u05b7?\u05bc?[\u05e3\u05e4\u05f3'\"״]\s+)"			# Daf, spelled with peh, peh sofit, geresh, gereshayim,  or single or doublequote
    }

    def _core_regex(self, lang, group_id=None):
        if group_id:
            reg = ur"(?P<" + group_id + ur">"
        else:
            reg = ur"("

        if lang == "en":
            reg += ur"\d+[abᵃᵇ]?)"
        elif lang == "he":
            reg += self.hebrew_number_regex() + ur'''([.:]|[,\s]+(?:\u05e2(?:"|\u05f4|''))?[\u05d0\u05d1])?)'''

        return reg

    def stop_parsing(self, lang):
        if lang == "he":
            return True
        return False

    def toNumber(self, lang, s):
        if lang == "en":
            try:
                if s[-1] in ["a", "b", u'ᵃ', u'ᵇ']:
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
            if amud == "a" or amud == u"ᵃ":
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

    @classmethod
    def toStr(cls, lang, i, **kwargs):
        i += 1
        daf_num = i / 2
        daf = ""

        if i > daf_num * 2:
            en_daf = "%db" % daf_num
        else:
            en_daf = "%da" % daf_num

        if lang == "en":
            daf = en_daf

        elif lang == "he":
            dotted = kwargs.get("dotted")
            if dotted:
                daf = encode_hebrew_daf(en_daf)
            else:
                punctuation = kwargs.get("punctuation", True)
                if i > daf_num * 2:
                    daf = ("%s " % encode_hebrew_numeral(daf_num, punctuation=punctuation)) + u"\u05d1"
                else:
                    daf = ("%s " % encode_hebrew_numeral(daf_num, punctuation=punctuation)) + u"\u05d0"

        return daf

    def format_count(self, name, number):
        if name == "Daf":
            return {
                "Amud": number,
                "Daf": number / 2
            }
        else: #shouldn't get here
            return {name: number}

    def storage_offset(self):
        return 2


class AddressInteger(AddressType):
    """
    :class:`AddressType` for Integer addresses
    """
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

    def toNumber(self, lang, s):
        if lang == "en":
            return int(s)
        elif lang == "he":
            return decode_hebrew_numeral(s)


class AddressYear(AddressInteger):
    """
    :class: AddressYear stores Hebrew years as numbers, for example 778 for the year תשע״ח
    To convert to Roman year, add 1240
    """
    def toNumber(self, lang, s):
        if lang == "he":
            return decode_hebrew_numeral(s)
        elif lang == "en":
            return int(s) - 1240

    @classmethod
    def toStr(cls, lang, i, **kwargs):
        if lang == "en":
            return str(i + 1240)
        elif lang == "he":
            punctuation = kwargs.get("punctuation", True)
            return encode_hebrew_numeral(i, punctuation=punctuation)


class AddressAliyah(AddressInteger):
    en_map = [u"First", u"Second", u"Third", u"Fourth", u"Fifth", u"Sixth", u"Seventh"]
    he_map = [u"ראשון", u"שני", u"שלישי", u"רביעי", u"חמישי", u"שישי", u"שביעי"]

    @classmethod
    def toStr(cls, lang, i, **kwargs):
        if lang == "en":
            return cls.en_map[i - 1]
        if lang == "he":
            return cls.he_map[i - 1]


class AddressPerek(AddressInteger):
    section_patterns = {
        "en": ur"""(?:(?:[Cc]h(apters?|\.)|[Pp]erek|s\.)?\s*)""",  # the internal ? is a hack to allow a non match, even if 'strict'
        "he": ur"""(?:\u05d1?\u05e4(?:"|\u05f4|''|'\s)                  # Peh (for 'perek') maybe followed by a quote of some sort
        |\u05e4\u05bc?\u05b6?\u05e8\u05b6?\u05e7(?:\u05d9\u05b4?\u05dd)?\s*                  # or 'perek(ym)' spelled out, followed by space
        )"""
    }
    

class AddressPasuk(AddressInteger):
    section_patterns = {
        "en": ur"""(?:(?:([Vv](erses?|[vs]?\.)|[Pp]ass?u[kq]))?\s*)""",  # the internal ? is a hack to allow a non match, even if 'strict'
        "he": ur"""(?:\u05d1?                                        # optional ב in front
            (?:\u05e4\u05b8?\u05bc?\u05e1\u05d5\u05bc?\u05e7(?:\u05d9\u05dd)?\s*)    #pasuk spelled out, with a space after
        )"""
    }


class AddressMishnah(AddressInteger):
    section_patterns = {
        "en": ur"""(?:(?:[Mm](ishnah?|s?\.))?\s*)""",  #  the internal ? is a hack to allow a non match, even if 'strict'
        "he": ur"""(?:\u05d1?                                                   # optional ב in front
            (?:\u05de\u05b4?\u05e9\u05b0?\u05c1?\u05e0\u05b8?\u05d4\s)			# Mishna spelled out, with a space after
            |(?:\u05de(?:["\u05f4]|'')?)				# or Mem (for 'mishna') maybe followed by a quote of some sort
        )"""
    }


class AddressVolume(AddressInteger):
    """
    :class:`AddressType` for Volume/חלק addresses
    """

    section_patterns = {
        "en": ur"""(?:(?:[Vv](olumes?|\.))?\s*)""",  #  the internal ? is a hack to allow a non match, even if 'strict'
        "he": ur"""(?:\u05d1?                                 # optional ב in front
        (?:\u05d7\u05b5?(?:\u05dc\u05b6?\u05e7|'|\u05f3)\s+)  # Helek - spelled out with nikkud possibly or followed by a ' or a geresh - followed by space
         |(?:\u05d7["\u05f4])                     # chet followed by gershayim or double quote
        )
        """
    }


class AddressSiman(AddressInteger):
    section_patterns = {
        "en": ur"""(?:(?:[Ss]iman)?\s*)""",
        "he": ur"""(?:\u05d1?
            (?:\u05e1\u05b4?\u05d9\u05de\u05b8?\u05df\s+)			# Siman spelled out with optional nikud, with a space after
            |(?:\u05e1\u05d9(?:["\u05f4'\u05f3](?:['\u05f3]|\s+)))		# or Samech, Yued (for 'Siman') maybe followed by a quote of some sort
        )"""
    }


class AddressHalakhah(AddressInteger):
    """
    :class:`AddressType` for Halakhah/הלכה addresses
    """
    section_patterns = {
        "en": ur"""(?:(?:[Hh]ala[ck]hah?)?\s*)""",  #  the internal ? is a hack to allow a non match, even if 'strict'
        "he": ur"""(?:\u05d1? 
            (?:\u05d4\u05bb?\u05dc\u05b8?\u05db(?:\u05b8?\u05d4|\u05d5\u05b9?\u05ea)\s+)			# Halakhah spelled out, with a space after
            |(?:\u05d4\u05dc?(?:["\u05f4'\u05f3](?:['\u05f3\u05db]|\s+)))		# or Haeh and possible Lamed(for 'halakhah') maybe followed by a quote of some sort
        )"""
    }


class AddressSeif(AddressInteger):
    section_patterns = {
        "en": ur"""(?:(?:[Ss][ae]if)?\s*)""",  #  the internal ? is a hack to allow a non match, even if 'strict'
        "he": ur"""(?:\u05d1?
            (?:\u05e1[\u05b0\u05b8]?\u05e2\u05b4?\u05d9\u05e3\s+(?:\u05e7\u05d8\u05df)?)			# Seif spelled out, with a space after or Seif katan spelled out or with nikud
            |(?:\u05e1(?:\u05e2\u05d9?|\u05e7)?(?:['\u05f3"\u05f4](?:['\u05f3]|\s+)))|	# or trie of first three letters followed by a quote of some sort
        )"""
    }

class AddressSection(AddressInteger):
    section_patterns = {
        "en": ur"""(?:(?:([Ss]ections?|§)?\s*)""",  #  the internal ? is a hack to allow a non match, even if 'strict'
        "he": ur""""""
    }
