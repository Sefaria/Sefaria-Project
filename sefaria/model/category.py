# -*- coding: utf-8 -*-

import logging
logger = logging.getLogger(__name__)

from sefaria.system.database import db
from sefaria.system.exceptions import BookNameError, InputError
from sefaria.site.categories import REVERSE_ORDER, CATEGORY_ORDER, TOP_CATEGORIES
from . import abstract as abstract
from . import schema as schema
from . import text as text
from . import link as link
from . import group as group


class Category(abstract.AbstractMongoRecord, schema.AbstractTitledOrTermedObject):
    collection = 'category'
    history_noun = "category"

    track_pkeys = True
    pkeys = ["lastPath"]  # Needed for dependency tracking
    required_attrs = ["lastPath", "path", "depth"]
    optional_attrs = ["enDesc", "heDesc", "titles", "sharedTitle"]

    def __str__(self):
        return "Category: {}".format(", ".join(self.path))

    def __repr__(self):  # Wanted to use orig_tref, but repr can not include Unicode
        return "{}().load({{'path': [{}]}})".format(self.__class__.__name__, ", ".join(['"{}"'.format(x) for x in self.path]))

    def _init_defaults(self):
        self._init_title_defaults()
        self.sharedTitle = None

    def _set_derived_attributes(self):
        self._load_title_group()

    def change_key_name(self, name):
        # Doesn't yet support going from shared term to local or vise-versa.
        if self.sharedTitle and schema.Term().load({"name": name}):
            self.sharedTitle = name
            self._process_terms()
        elif not self.sharedTitle:
            self.add_title(name, "en", True, True)
        else:
            raise IndexError("Can not find Term for {}".format(name))
        self.lastPath = name
        self.path[-1] = name

    def _validate(self):
        super(Category, self)._validate()
        assert self.lastPath == self.path[-1] == self.get_primary_title("en"), "Category name not matching"

        if not self.sharedTitle and not self.get_titles_object():
            raise InputError("Category {} must have titles or a shared title".format(self))

        try:
            self.title_group.validate()
        except InputError as e:
            raise InputError("Category {} has invalid titles: {}".format(self, e))

        if self.sharedTitle and schema.Term().load({"name": self.sharedTitle}).titles != self.get_titles_object():
            raise InputError("Category {} with sharedTitle can not have explicit titles".format(self))

    def _normalize(self):
        super(Category, self)._normalize()

        self.depth = len(self.path)

        if not getattr(self, "lastPath", None):
            self.lastPath = self.path[-1]

        if self.sharedTitle:
            if getattr(self, "titles", None):
                del self.__dict__["titles"]
        else:
            self.titles = self.get_titles_object()

    def contents(self, **kwargs):
        d = super(Category, self).contents()
        if "lastPath" not in d:
            d["lastPath"] = self.path[-1]

        if d.get("sharedTitle", None) is not None:
            if "titles" in d:
                del d["titles"]
        else:
            d["titles"] = self.get_titles_object()

        return d

    def get_toc_object(self):
        from sefaria.model import library
        toc_tree = library.get_toc_tree()
        return toc_tree.lookup(self.path)

    def can_delete(self):
        obj = self.get_toc_object()
        if not obj:
            logger.error("Could not get TOC object for Category {}.".format("/".join(self.path)))
            return False
        if len(obj.children):
            logger.error("Can not delete category {} that has contents.".format("/".join(self.path)))
            return False
        return True


class CategorySet(abstract.AbstractMongoSet):
    recordClass = Category


def process_category_name_change_in_categories_and_indexes(changed_cat, **kwargs):
    from sefaria.model.text import library

    old_toc_node = library.get_toc_tree().lookup(changed_cat.path[:-1] + [kwargs["old"]])
    assert isinstance(old_toc_node, TocCategory)
    pos = len(old_toc_node.ancestors()) - 1
    children = old_toc_node.all_children()
    for child in children:
        if isinstance(child, TocCategory):
            c = child.get_category_object()
            c.path[pos] = kwargs["new"]
            c.save(override_dependencies=True)

    for child in children:
        if isinstance(child, TocTextIndex):
            i = child.get_index_object()
            i.categories[pos] = kwargs["new"]
            i.save(override_dependencies=True)


""" Object Oriented TOC """


def toc_serial_to_objects(toc):
    """
    Build TOC object tree from serial representation
    :param toc: Serialized TOC
    :return:
    """
    root = TocCategory()
    root.add_primary_titles("TOC", "שרש")
    for e in toc:
        root.append(schema.deserialize_tree(e, struct_class=TocCategory, struct_title_attr="category", leaf_class=TocTextIndex, leaf_title_attr="title", children_attr="contents", additional_classes=[TocGroupNode]))
    return root


class TocTree(object):
    def __init__(self, lib=None):
        """
        :param lib: Library object, in the process of being created
        """
        self._root = TocCategory()
        self._root.add_primary_titles("TOC", "שרש")
        self._path_hash = {}
        self._library = lib
        self._groups_in_library = []

        # Store first section ref.
        vss = db.vstate.find({}, {"title": 1, "first_section_ref": 1, "flags": 1})
        self._vs_lookup = {vs["title"]: {
            "first_section_ref": vs.get("first_section_ref"),
            "heComplete": bool(vs.get("flags", {}).get("heComplete", False)),
            "enComplete": bool(vs.get("flags", {}).get("enComplete", False)),
        } for vs in vss}

        # Build Category object tree from stored Category objects
        for c in CategorySet(sort=[("depth", 1)]):
            self._add_category(c)

        # Get all of the first comment links
        ls = db.links.find({"is_first_comment": True}, {"first_comment_indexes":1, "first_comment_section_ref":1})
        self._first_comment_lookup = {frozenset(l["first_comment_indexes"]): l["first_comment_section_ref"] for l in ls}

        # Place Indexes
        indx_set = self._library.all_index_records() if self._library else text.IndexSet()
        for i in indx_set:
            if i.categories and i.categories[0] == "_unlisted":  # For the dummy sheet Index record
                continue
            node = self._make_index_node(i)
            cat = self.lookup(i.categories)
            if not cat:
                logger.warning("Failed to find category for {}".format(i.categories))
                continue
            cat.append(node)
            vs = self._vs_lookup.get(i.title, None)
            if not vs:
                continue
            # If any text in this category is incomplete, the category itself and its parents are incomplete
            for field in ("enComplete", "heComplete"):
                for acat in [cat] + list(reversed(cat.ancestors())):
                    # Start each category completeness as True, set to False whenever we hit an incomplete text below it
                    flag = False if not vs[field] else getattr(acat, field, True)
                    setattr(acat, field, flag)
                    if acat.get_primary_title() == "Commentary":
                        break # Don't consider a category incomplete for containing incomplete commentaries

            self._path_hash[tuple(i.categories + [i.title])] = node

        # Include Groups in TOC that has a `toc` field set
        group_set = group.GroupSet({"toc": {"$exists": True}, "listed": True})
        for g in group_set:
            self._groups_in_library.append(g.name)
            node = TocGroupNode(group_object=g)
            categories = node.categories
            cat  = self.lookup(node.categories)
            if not cat:
                logger.warning("Failed to find category for {}".format(categories))
                continue
            cat.append(node)
           
            self._path_hash[tuple(node.categories + [g.name])] = node

        self._sort()

    def all_category_nodes(self, include_root = True):
        return ([self._root] if include_root else []) + [v for v in list(self._path_hash.values()) if isinstance(v, TocCategory)]

    def _sort(self):
        def _explicit_order_and_title(node):
            """
            Return sort key as tuple:  (isString, value)
            :param node:
            :return:
            """
            title = node.primary_title("en")
            complete = getattr(node, "enComplete", False)
            complete_or_title_key = "1z" + title if complete else "2z" + title

            try:
                # First sort by global order list below
                return (False, CATEGORY_ORDER.index(title))

            except ValueError:
                # Sort top level Commentary categories just below their base category
                if isinstance(node, TocCategory):
                    temp_cat_name = title.replace(" Commentaries", "")
                    if temp_cat_name in TOP_CATEGORIES:
                        return (False, CATEGORY_ORDER.index(temp_cat_name) + 0.5)

                # Sort by an explicit `order` field if present
                # otherwise into two alphabetical list for complete and incomplete.
                res = getattr(node, "order", complete_or_title_key)
                return (isinstance(res, str), res)

        for cat in self.all_category_nodes():  # iterate all categories
            cat.children.sort(key=_explicit_order_and_title)
            cat.children.sort(key=lambda node: 'zzz' + node.primary_title("en") if isinstance(node, TocCategory) and node.primary_title("en") in REVERSE_ORDER else 'a')

    def _make_index_node(self, index, old_title=None):
        d = index.toc_contents(include_first_section=False, include_flags=False)

        title = old_title or d["title"]

        vs = self._vs_lookup.get(title, {})
        d["firstSection"] = vs.get("first_section_ref", None)
        d["heComplete"]   = vs.get("heComplete", False)
        d["enComplete"]   = vs.get("enComplete", False)
        if title in CATEGORY_ORDER:
            # If this text is listed in ORDER, consider its position in ORDER as its order field.
            d["order"] = CATEGORY_ORDER.index(title)

        if "base_text_titles" in d and len(d["base_text_titles"]) > 0:
            d["refs_to_base_texts"] = {btitle:
                self._first_comment_lookup.get(frozenset([btitle, title]), d["firstSection"])
                for btitle in d["base_text_titles"]
                }

        return TocTextIndex(d, index_object=index)

    def _add_category(self, cat):
        tc = TocCategory(category_object=cat)
        tc.add_primary_titles(cat.get_primary_title("en"), cat.get_primary_title("he"))
        parent = self._path_hash[tuple(cat.path[:-1])] if len(cat.path[:-1]) else self._root
        parent.append(tc)
        self._path_hash[tuple(cat.path)] = tc

    def get_root(self):
        return self._root

    def get_serialized_toc(self):
        return self._root.serialize().get("contents", [])

    def get_groups_in_library(self):
        return self._groups_in_library

    def flatten(self):
        """
        Returns an array of strings which corresponds to each text in the
        Table of Contents in order.
        """
        return [n.primary_title() for n in self._root.get_leaf_nodes() if isinstance(n, TocTextIndex)]

    #todo: Get rid of the special case for "other", by placing it in the Index's category lists
    def lookup(self, cat_path, title=None):
        """
        :param cat_path: A list or tuple of the path to this category
        :param title: optional - name of text.  If present tries to return a text
        :return: TocNode
        """
        path = tuple(cat_path)
        if title is not None:
            path += tuple([title])
        try:
            return self._path_hash[path]
        except KeyError:
            try:
                return self._path_hash[tuple(["Other"]) + path]
            except KeyError:
                return None

    def remove_index(self, toc_node):
        assert isinstance(toc_node, TocTextIndex)
        del self._path_hash[tuple(toc_node.categories + [toc_node.primary_title()])]
        toc_node.detach()

    def update_title(self, index, old_ref=None, recount=True):
        title = old_ref or index.title
        node = self.lookup(index.categories, title)

        if recount or not node:
            from .version_state import VersionState
            try:
                vs = VersionState(title)
            except BookNameError:
                logger.warning("Failed to find VersionState for {} in TocTree.update_title()".format(title))
                return
            vs.refresh()
            sn = vs.state_node(index.nodes)
            self._vs_lookup[title] = {
                "first_section_ref": vs.first_section_ref,
                "heComplete": vs.get_flag("heComplete"),
                "enComplete": vs.get_flag("enComplete"),
            }
        new_node = self._make_index_node(index, title)
        if node:
            node.replace(new_node)
        else:
            logger.info("Did not find TOC node to update: {} - adding.".format("/".join(index.categories + [title])))
            cat = self.lookup(index.categories)
            if not cat:
                logger.warning("Failed to find category for {}".format(index.categories))
            cat.append(new_node)

        self._path_hash[tuple(index.categories + [index.title])] = new_node


class TocNode(schema.TitledTreeNode):
    """
    Abstract superclass for all TOC nodes.
    """
    langs = ["he", "en"]
    title_attrs = {
        "en": "",
        "he": ""
    }

    def __init__(self, serial=None, **kwargs):
        super(TocNode, self).__init__(serial, **kwargs)

        # remove title attributes after deserialization, so as not to mess with serial dicts.
        if serial is not None:
            for lang in self.langs:
                self.add_title(serial.get(self.title_attrs[lang]), lang, primary=True)
                delattr(self, self.title_attrs[lang])

    @property
    def full_path(self):
        return [n.primary_title("en") for n in self.ancestors()[1:]] + [self.primary_title("en")]

    # This varies a bit from the superclass. Seems not worthwhile to abstract into the superclass.
    def serialize(self, **kwargs):
        d = {}
        if self.children:
            d["contents"] = [n.serialize(**kwargs) for n in self.children]

        params = {k: getattr(self, k) for k in self.required_param_keys + self.optional_param_keys if
                  getattr(self, k, "BLANKVALUE") is not "BLANKVALUE"}
        if any(params):
            d.update(params)

        for lang in self.langs:
            d[self.title_attrs[lang]] = self.title_group.primary_title(lang)

        return d


class TocCategory(TocNode):
    """
    "category": "",
    "heCategory": hebrew_term(""),
    "contents": []
    """
    def __init__(self, serial=None, **kwargs):
        self._category_object = kwargs.pop("category_object", None)
        super(TocCategory, self).__init__(serial, **kwargs)

    optional_param_keys = [
        "order",
        "enComplete",
        "heComplete",
    ]

    title_attrs = {
        "he": "heCategory",
        "en": "category"
    }

    def get_category_object(self):
        return self._category_object


class TocTextIndex(TocNode):
    """
    categories: Array(2)
    dependence: false
    firstSection: "Mishnah Eruvin 1"
    heTitle: "משנה עירובין"
    order: 13
    primary_category: "Mishnah"
    title: "Mishnah Eruvin"
    enComplete: true
    heComplete: true
    """
    def __init__(self, serial=None, **kwargs):
        self._index_object = kwargs.pop("index_object", None)
        super(TocTextIndex, self).__init__(serial, **kwargs)

    def get_index_object(self):
        return self._index_object

    optional_param_keys = [
        "categories",
        "dependence",
        "firstSection",
        "order",
        "primary_category",
        "heComplete",
        "enComplete",
        "collectiveTitle",
        "base_text_titles",
        "base_text_mapping",
        "heCollectiveTitle",
        "commentator",
        "heCommentator",
        "refs_to_base_texts"
    ]
    title_attrs = {
        "en": "title",
        "he": "heTitle"
    }


class TocGroupNode(TocNode):
    """
    categories: Array(2)
    name: "Some Group"
    isGroup: true
    enComplete: true
    heComplete: true
    """
    def __init__(self, serial=None, group_object=None, **kwargs):
        if group_object:
            self._group_object = group_object
            group_contents = group_object.contents()
            serial = {
                "categories": group_contents["toc"]["categories"],
                "name": group_contents["name"],
                "title": group_contents["toc"]["collectiveTitle"]["en"] if "collectiveTitle" in group_contents["toc"] else group_contents["toc"]["title"],
                "heTitle": group_contents["toc"]["collectiveTitle"]["he"] if "collectiveTitle" in group_contents["toc"] else group_contents["toc"]["heTitle"], 
                "isGroup": True,
                "enComplete": True,
                "heComplete": True,
            }
        elif serial:
            self._group_object = group.Group().load({"name": serial["name"]})

        super(TocGroupNode, self).__init__(serial)

    def get_group_object(self):
        return self._group_object

    def serialize(self, **kwargs):
        d = super(TocGroupNode, self).serialize()
        d["nodeType"] = "TocGroupNode"
        return d

    required_param_keys = [
        "categories",
        "name",
        "title",
        "heTitle",
        "isGroup",
    ]

    optional_param_keys = [
        "order",
        "heComplete",
        "enComplete",
    ]

    title_attrs = {
        "en": "title",
        "he": "heTitle",
    }
