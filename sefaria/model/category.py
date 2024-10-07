# -*- coding: utf-8 -*-

import structlog
logger = structlog.get_logger(__name__)

from sefaria.system.database import db
from sefaria.system.exceptions import BookNameError, InputError, DuplicateRecordError
from . import abstract as abstract
from . import schema as schema
from . import text as text
from . import collection as collection


class Category(abstract.AbstractMongoRecord, schema.AbstractTitledOrTermedObject):
    collection = 'category'
    history_noun = "category"

    track_pkeys = True
    criteria_field = 'path'
    criteria_override_field = 'origPath'  # used when primary attribute changes. field that holds old value.
    pkeys = ["path"]  # Needed for dependency tracking
    required_attrs = ["lastPath", "path", "depth"]
    optional_attrs = [
        "enDesc",
        "heDesc",
        "enShortDesc",
        "heShortDesc",
        "titles",
        "sharedTitle",
        "isPrimary",
        "searchRoot",
        "order",
    ]

    def __str__(self):
        return "Category: {}".format(", ".join(self.path))

    def __repr__(self):  # Wanted to use orig_tref, but repr can not include Unicode
        return "{}().load({{'path': [{}]}})".format(self.__class__.__name__, ", ".join(['"{}"'.format(x) for x in self.path]))

    def _init_defaults(self):
        self._init_title_defaults()
        self.sharedTitle = None

    def _set_derived_attributes(self):
        if hasattr(self, "origPath") and self.lastPath != self.path[-1]:
            # `origPath` is used by the Category Editor to update the path,
            # which should then propagate to the `lastPath` and `sharedTitle`
            self.change_key_name(self.path[-1])
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
        assert self.lastPath == self.path[-1] == self.get_primary_title("en"), "Category name not matching" + " - " + self.lastPath + " / " + self.path[-1] + " / " + self.get_primary_title("en")
        assert not hasattr(self, 'order') or isinstance(self.order, int), 'Order should be an integer'

        if self.is_new():
            duplicate = Category().load({'path': self.path})
            if duplicate:
                raise DuplicateRecordError(f'Category with path {self.path} already exists')

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

    @staticmethod
    def get_shared_category(indexes: list):
        """
        Get lowest category which includes all indexes in `indexes`
        :param list indexes: list of Index objects
        :return: Category
        """

        from collections import defaultdict

        cat_choice_dict = defaultdict(list)
        for index in indexes:
            for icat, cat in enumerate(index.categories):
                cat_path = tuple(index.categories[:icat+1])
                cat_choice_dict[(icat, cat_path)] += [index]
        sorted_cat_options = sorted(cat_choice_dict.items(), key=lambda x: (len(x[1]), x[0][0]), reverse=True)
        (_, cat_path), top_indexes = sorted_cat_options[0]
        return Category().load({"path": list(cat_path)})

class CategorySet(abstract.AbstractMongoSet):
    recordClass = Category


def process_category_path_change(changed_cat, **kwargs):
    def modify(old_val, new_val, pos):
        old_val[:pos] = new_val
        return old_val

    from sefaria.model.text import library
    from sefaria.model import Index
    tree = library.get_toc_tree()
    new_categories = kwargs["new"]
    old_toc_node = tree.lookup(kwargs["old"])
    assert isinstance(old_toc_node, TocCategory)

    collections = collection.CollectionSet({"toc": {"$exists": True}})
    pos = len(old_toc_node.ancestors())
    for c in collections:
        collection_in_old_category_tree = str(c.toc["categories"]).startswith(str(kwargs["old"]))
        if collection_in_old_category_tree:
            c.toc["categories"] = modify(c.toc["categories"], new_categories, pos)
            c.save(override_dependencies=True)

    children = old_toc_node.all_children()
    for child in children:
        if isinstance(child, TocCategory):   # change categories first since Index changes depend on the new category existing
            c = Category().load({'path': child.get_category_object().path}) # load directly from the DB to avoid a situation where the category was deleted but was still in TocTree cache
            if c is not None:
                c.path = modify(c.path, new_categories, pos)
                c.save(override_dependencies=True)

    for child in children:
        if isinstance(child, TocTextIndex):
            i = Index().load({"title": child.get_primary_title('en')})  # load directly from the DB to avoid a situation where the book was deleted but was still in TocTree cache
            if i is not None:
                i.categories = modify(i.categories, new_categories, pos)
                i.save(override_dependencies=True)



""" Object Oriented TOC """


def toc_serial_to_objects(toc):
    """
    Build TOC object tree from serial representation
    Was used to derive 1st class objects from TOC.  Not used in production.
    :param toc: Serialized TOC
    :return:
    """
    root = TocCategory()
    root.add_primary_titles("TOC", "שרש")
    for e in toc:
        root.append(schema.deserialize_tree(e, struct_class=TocCategory, struct_title_attr="category", leaf_class=TocTextIndex, leaf_title_attr="title", children_attr="contents", additional_classes=[TocCollectionNode]))
    return root


class TocTree(object):
    def __init__(self, lib=None, mobile=False):
        """
        :param lib: Library object, in the process of being created
        """
        self._root = TocCategory()
        self._root.add_primary_titles("TOC", "שרש")
        self._path_hash = {}
        self._library = lib
        self._collections_in_library = []

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
            node = self._make_index_node(i, mobile=mobile)
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

        # Include Collections in TOC that has a `toc` field set
        collections = collection.CollectionSet({"toc": {"$exists": True}, "listed": True, "slug": {"$exists": True}})
        for c in collections:
            self._collections_in_library.append(c.slug)
            node = TocCollectionNode(collection_object=c)
            categories = node.categories
            cat  = self.lookup(node.categories)
            if not cat:
                logger.warning("Failed to find category for {}".format(categories))
                continue
            cat.append(node)
           
            self._path_hash[tuple(node.categories + [c.slug])] = node

        self._sort()

    def all_category_nodes(self, include_root = True):
        return ([self._root] if include_root else []) + [v for v in list(self._path_hash.values()) if isinstance(v, TocCategory)]

    def _sort(self):
        def _explicit_order_and_title(node):
            """
            Return sort key as tuple:  (value, value)
            :param node:
            :return:
            """

            # First sort by order attr
            try:
                return (node.order < 0, node.order) #negative order should be least

            # Sort objects w/o order attr by title
            except AttributeError:
                return (0.5, node.get_primary_title())

        for cat in self.all_category_nodes():  # iterate all categories
            if all([hasattr(ca, "base_text_order") for ca in cat.children]):
                cat.children.sort(key=lambda c: c.base_text_order)
            else:
                cat.children.sort(key=_explicit_order_and_title)

    def _make_index_node(self, index, old_title=None, mobile=False, include_first_section=False):
        d = index.toc_contents(include_first_section=include_first_section, include_flags=False, include_base_texts=True)

        title = old_title or d["title"]

        if mobile:
            vs = self._vs_lookup.get(title, {})
            d["firstSection"] = vs.get("first_section_ref", None)
        
        if "base_text_titles" in d and len(d["base_text_titles"]) > 0 and include_first_section:
            # `d["firstSection"]` assumes `include_first_section` is True
            #  this code seems to never actually get run
            d["refs_to_base_texts"] = {btitle:
                self._first_comment_lookup.get(frozenset([btitle, title]), d["firstSection"])
                for btitle in d["base_text_titles"]
                }
        
        return TocTextIndex(d, index_object=index)

    def _add_category(self, cat):
        try:
            tc = TocCategory(category_object=cat)
            parent = self._path_hash[tuple(cat.path[:-1])] if len(cat.path[:-1]) else self._root
            parent.append(tc)
            self._path_hash[tuple(cat.path)] = tc
        except KeyError:
            logger.warning(f"Failed to find parent category for {'/'.join(cat.path)}")

    def get_root(self):
        return self._root

    def get_serialized_toc(self):
        return self._root.serialize().get("contents", [])

    def get_collections_in_library(self):
        return self._collections_in_library

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
            # todo: remove this try, after getting rid of the "Other" cat.
            try:
                return self._path_hash[tuple(["Other"]) + path]
            except KeyError:
                return None

    def remove_category(self, toc_node):
        assert isinstance(toc_node, TocCategory)
        del self._path_hash[tuple(toc_node.get_category_object().path)]
        toc_node.detach()

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
            # sn = vs.state_node(index.nodes)
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
    thin_keys = []

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

        # thin param is used for generating search toc, and can be removed when search toc is retired.
        if kwargs.get("thin") is True:
            params = {k: getattr(self, k) for k in self.thin_keys if getattr(self, k, "BLANKVALUE") != "BLANKVALUE"}
        else:
            params = {k: getattr(self, k) for k in self.required_param_keys + self.optional_param_keys if
                  getattr(self, k, "BLANKVALUE") != "BLANKVALUE"}
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
        if self._category_object:
            self.add_primary_titles(self._category_object.get_primary_title("en"), self._category_object.get_primary_title("he"))
            if getattr(self._category_object, "isPrimary", False):
                self.isPrimary = True
            if getattr(self._category_object, "searchRoot", False):
                self.searchRoot = self._category_object.searchRoot
            for field in ("enDesc", "heDesc", "enShortDesc", "heShortDesc"):
                setattr(self, field, getattr(self._category_object, field, ""))
        if hasattr(self._category_object, 'order'):
            self.order = self._category_object.order

    optional_param_keys = [
        "order",
        "enComplete",
        "heComplete",
        "enDesc",
        "heDesc",
        "enShortDesc",
        "heShortDesc",
        "isPrimary",
        "searchRoot"
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

    thin_keys = ["order"]

    def __init__(self, serial=None, **kwargs):
        self._index_object = kwargs.pop("index_object", None)
        super(TocTextIndex, self).__init__(serial, **kwargs)
        if hasattr(self._index_object, 'order'):
            self.order = self._index_object.order[0]

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
        "enShortDesc",
        "heShortDesc",
        "collectiveTitle",
        "base_text_titles",
        "base_text_mapping",
        "heCollectiveTitle",
        "commentator",
        "heCommentator",
        "refs_to_base_texts",
        "base_text_order",
        "hidden",
        "corpus",
    ]
    title_attrs = {
        "en": "title",
        "he": "heTitle"
    }


class TocCollectionNode(TocNode):
    """
    categories: Array(2)
    name: "Some Collection"
    slug: "collection-slug"
    isCollection: true
    enComplete: true
    heComplete: true
    """
    def __init__(self, serial=None, collection_object=None, **kwargs):
        if collection_object:
            self._collection_object = collection_object
            c_contents = collection_object.contents()
            serial = {
                "categories": c_contents["toc"]["categories"],
                "name": c_contents["name"],
                "slug": c_contents["slug"],
                "title": c_contents["toc"]["collectiveTitle"]["en"] if "collectiveTitle" in c_contents["toc"] else c_contents["toc"]["title"],
                "heTitle": c_contents["toc"]["collectiveTitle"]["he"] if "collectiveTitle" in c_contents["toc"] else c_contents["toc"]["heTitle"], 
                "enShortDesc": c_contents["toc"].get("enShortDesc", ""),
                "heShortDesc": c_contents["toc"].get("heShortDesc", ""),
                "isCollection": True,
                "enComplete": True,
                "heComplete": True,
            }
        elif serial:
            self._collection_object = collection.Collection().load({"slug": serial["slug"]})

        super(TocCollectionNode, self).__init__(serial)

    def get_collection_object(self):
        return self._collection_object

    def serialize(self, **kwargs):
        d = super(TocCollectionNode, self).serialize()
        d["nodeType"] = "TocCollectionNode"
        return d

    required_param_keys = [
        "categories",
        "name",
        "slug",
        "title",
        "heTitle",
        "isCollection",
    ]

    optional_param_keys = [
        "order",
        "heComplete",
        "enComplete",
        "enShortDesc",
        "heShortDesc",
    ]

    title_attrs = {
        "en": "title",
        "he": "heTitle",
    }
