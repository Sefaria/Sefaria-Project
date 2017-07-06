# -*- coding: utf-8 -*-

from sefaria.system.database import db
from . import abstract as abstract
from . import schema as schema
from . import text as text


class Category(schema.AbstractTitledRecord):
    collection = 'category'

    track_pkeys = True
    pkeys = ["lastPath"]  # Needed for dependency tracking
    required_attrs = ["titles", "lastPath", "path"]
    optional_attrs = ["enDesc", "heDesc"]

    def change_key_name(self, name):
        self.lastPath = name
        self.path[-1] = name
        self.add_title(name, "en", True, True)

    def _validate(self):
        assert self.lastPath == self.path[-1] == self.get_primary_title("en"), "Category name not matching"

    def get_toc_object(self):
        from sefaria.model import library
        toc_tree = library.get_toc_tree()
        toc_tree.lookup_category(self.path)


class CategorySet(abstract.AbstractMongoSet):
    recordClass = Category


def process_category_name_change_in_categories_and_indexes(changed_cat, **kwargs):
    from sefaria.model.text import library

    old_toc_node = library.get_toc_tree().lookup_category(changed_cat.path[:-1] + [kwargs["old"]])
    assert isinstance(old_toc_node, TocCategory)
    pos = len(old_toc_node.ancestors()) - 1
    for child in old_toc_node.all_children():
        if isinstance(child, TocCategory):
            c = child.get_category_object()
            c.path[pos] = kwargs["new"]
            c.save()
        elif isinstance(child, TocTextIndex):
            i = child.get_index_object()
            i.categories[pos] = kwargs["new"]
            i.save(override_dependencies=True)


def rebuild_library_after_category_name_change(changed_cat, **kwargs):
    text.library.rebuild(include_toc=True)


""" Object Oriented TOC """


def toc_serial_to_objects(toc):
    """
    Build TOC object tree from serial representation
    :param toc: Serialized TOC
    :return:
    """
    root = TocCategory()
    root.add_primary_titles("TOC", u"שרש")
    for e in toc:
        root.append(schema.deserialize_tree(e, struct_class=TocCategory, leaf_class=TocTextIndex, children_attr="contents"))
    return root


class TocTree(object):
    def __init__(self):
        self._root = TocCategory()
        self._root.add_primary_titles("TOC", u"שרש")
        self._path_hash = {}

        # Store sparseness data (same functionality as sefaria.summaries.get_sparseness_lookup()
        vss = db.vstate.find({}, {"title": 1, "content._en.sparseness": 1, "content._he.sparseness": 1})
        self._sparseness_lookup = {vs["title"]: max(vs["content"]["_en"]["sparseness"], vs["content"]["_he"]["sparseness"]) for vs in vss}

        # Build Category object tree from stored Category objects
        cs = sorted(CategorySet(), key=lambda c: len(c.path))
        for c in cs:
            self._add_category(c)

        # Place Indexes
        for i in text.IndexSet():
            node = self._make_index_node(i)
            try:
                cat = self.lookup_category(i.categories)
            except KeyError:
                print u"Failed to find category for {}".format(i.categories)
                continue
            cat.append(node)

        self._sort()

    def _sort(self):
        def _explicit_order_and_title(node):
            title = node.primary_title("en")
            try:
                return ORDER.index(title)
            except ValueError:
                if isinstance(node, TocCategory):
                    temp_cat_name = title.replace(" Commentaries", "")
                    if temp_cat_name in TOP_CATEGORIES:
                        return ORDER.index(temp_cat_name) + 0.5
                    return 'zz' + title
                else:
                    return getattr(node, "order", title)

        def _sparseness_order(node):
            if isinstance(node, TocCategory) or hasattr(node, "order"):
                return -4
            return - getattr(node, "sparseness", 1)  # Least sparse to most sparse

        for cat in self._path_hash.values():  # iterate all categories
            cat.children.sort(key=_explicit_order_and_title)
            cat.children.sort(key=_sparseness_order)
            cat.children.sort(key=lambda node: 'zzz' + node.primary_title("en") if isinstance(node, TocCategory) and node.primary_title("en") in REVERSE_ORDER else 'a')

    def _make_index_node(self, index):
        d = index.toc_contents()
        d["sparseness"] = self._sparseness_lookup[d["title"]]
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
        return self._root.serialize()["contents"]

    #todo: Get rid of the special case for "other", by placing it in the Index's category lists
    def lookup_category(self, cat_path):
        """
        :param cat_path: A list of tuple of the path to this category
        :return:
        """
        try:
            return self._path_hash[tuple(cat_path)]
        except KeyError:
            return self._path_hash[tuple(["Other"] + cat_path)]


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
    sparseness: 4
    title: "Mishnah Eruvin"
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
        "sparseness",
        "primary_category",
        "collectiveTitle",
        "base_text_titles",
        "base_text_mapping",
        "heCollectiveTitle",
        "commentator",
        "heCommentator"
    ]
    title_attrs = {
        "en": "title",
        "he": "heTitle"
    }



# Giant list ordering or categories
# indentation and inclusion of duplicate categories (like "Seder Moed")
# is for readability only. The table of contents will follow this structure.
ORDER = [
    "Tanakh",
        "Torah",
            "Genesis",
            "Exodus",
            "Leviticus",
            "Numbers",
            "Deuteronomy",
        "Prophets",
        "Writings",
        "Targum",
            'Onkelos Genesis',
            'Onkelos Exodus',
            'Onkelos Leviticus',
            'Onkelos Numbers',
            'Onkelos Deuteronomy',
            'Targum Jonathan on Genesis',
            'Targum Jonathan on Exodus',
            'Targum Jonathan on Leviticus',
            'Targum Jonathan on Numbers',
            'Targum Jonathan on Deuteronomy',
    "Mishnah",
        "Seder Zeraim",
        "Seder Moed",
        "Seder Nashim",
        "Seder Nezikin",
        "Seder Kodashim",
        "Seder Tahorot",
    "Talmud",
        "Bavli",
                "Seder Zeraim",
                "Seder Moed",
                "Seder Nashim",
                "Seder Nezikin",
                "Seder Kodashim",
                "Seder Tahorot",
        "Yerushalmi",
                "Seder Zeraim",
                "Seder Moed",
                "Seder Nashim",
                "Seder Nezikin",
                "Seder Kodashim",
                "Seder Tahorot",
        "Rif",
    "Midrash",
        "Aggadic Midrash",
            "Midrash Rabbah",
        "Halachic Midrash",
    "Tanaitic",
        "Tosefta",
            "Seder Zeraim",
            "Seder Moed",
            "Seder Nashim",
            "Seder Nezikin",
            "Seder Kodashim",
            "Seder Tahorot",
        "Masechtot Ketanot",
    "Halakhah",
        "Mishneh Torah",
            'Introduction',
            'Sefer Madda',
            'Sefer Ahavah',
            'Sefer Zemanim',
            'Sefer Nashim',
            'Sefer Kedushah',
            'Sefer Haflaah',
            'Sefer Zeraim',
            'Sefer Avodah',
            'Sefer Korbanot',
            'Sefer Taharah',
            'Sefer Nezikim',
            'Sefer Kinyan',
            'Sefer Mishpatim',
            'Sefer Shoftim',
        "Shulchan Arukh",
    "Kabbalah",
        "Zohar",
    'Liturgy',
        'Siddur',
        'Haggadah',
        'Piyutim',
    'Philosophy',
    'Parshanut',
    'Chasidut',
        "Early Works",
        "Breslov",
        "R' Tzadok HaKohen",
    'Musar',
    'Responsa',
        "Rashba",
        "Rambam",
    'Apocrypha',
    'Elucidation',
    'Modern Works',
    'Other',
]

TOP_CATEGORIES = [
    "Tanakh",
    "Mishnah",
    "Talmud",
    "Midrash",
    "Halakhah",
    "Kabbalah",
    "Liturgy",
    "Philosophy",
    "Tanaitic",
    "Chasidut",
    "Musar",
    "Responsa",
    "Apocrypha",
    "Modern Works",
    "Other"
]

REVERSE_ORDER = [
    'Commentary'  # Uch, STILL special casing commentary here... anything to be done??
]

