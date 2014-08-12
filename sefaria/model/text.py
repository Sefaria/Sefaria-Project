"""
text.py

Writes to MongoDB Collection: texts
"""
import regex as re
import copy

import sefaria.model.abstract as abst
import sefaria.datatype.jagged_array as ja
import sefaria.system.cache as scache
from sefaria.system.exceptions import InputError


"""
                ----------------------------------
                 Index, IndexSet, CommentaryIndex
                ----------------------------------
"""


class Index(abst.AbstractMongoRecord):
    collection = 'index'
    history_noun = 'index'
    criteria_field = 'title'
    second_save = True

    pkeys = ["title"]

    required_attrs = [
        "title",
        "titleVariants",
        "categories",
    ]
    optional_attrs = [
        "sectionNames",     # should be required? ~15 records fail
        "heTitle",
        "heTitleVariants",
        "maps",
        "order",
        "length",
        "lengths",
        "transliteratedTitle",
        "maps"
    ]

    def is_commentary(self):
        return self.categories[0] == "Commentary"

    def text_depth(self):
        # todo: make sure all old usages are redirected:  i["textDepth"] = len(i["sectionNames"])
        return len(self.sectionNames)

    def load_from_dict(self, d):
        if "oldTitle" in d and "title" in d and d["oldTitle"] != d["title"]:
            self.load_by_query({"title": d["oldTitle"]})
            self.titleVariants.remove(d["oldTitle"])  # should this happen in _normalize?
        return super(Index, self).load_from_dict(d)

    def _normalize(self):
        self.title = self.title[0].upper() + self.title[1:]
        if getattr(self, "titleVariants", None):
            variants = [v[0].upper() + v[1:] for v in self.titleVariants]
            self.titleVariants = variants

        # Ensure primary title is listed among title variants
        if self.title not in self.titleVariants:
            self.titleVariants.append(self.title)

        if getattr(self, "heTitle", None) is not None:
            if getattr(self, "heTitleVariants", None) is None:
                self.heTitleVariants = [self.heTitle]
            elif self.heTitle not in self.heTitleVariants:
                self.heTitleVariants.append(self.heTitle)

    def _validate(self, attrs=None):
        assert super(Index, self)._validate(attrs)

        # Keys that should be non empty lists
        for key in ("categories", "sectionNames"):
            if not isinstance(getattr(self, key), list) or len(getattr(self, key)) == 0:
                raise InputError("%s field must be a non empty list of strings." % key)

        # Disallow special characters in text titles
        if any((c in '.-\\/') for c in self.title):
            raise InputError("Text title may not contain periods, hyphens or slashes.")

        # Disallow special character in categories
        for cat in self.categories:
            if any((c in '.-') for c in cat):
                raise InputError("Categories may not contain periods or hyphens.")

        # Disallow special character in sectionNames
        for cat in self.sectionNames:
            if any((c in '.-\\/') for c in cat):
                raise InputError("Text Structure names may not contain periods, hyphens or slashes.")

        # Make sure all title variants are unique
        for variant in self.titleVariants:
            existing = Index().load_by_query({"titleVariants": variant})
            if existing and existing != self and existing.title != self.pkeys_orig_values.get("title", None):
                #if not getattr(self, "oldTitle", None) or existing.title != self.oldTitle:
                raise InputError('A text called "%s" already exists.' % variant)

        return True

    def _prepare_second_save(self):
        if getattr(self, "maps", None) is None:
            self.maps = []
        for i in range(len(self.maps)):
            nref = "foo"
            #nref = sefaria.texts.norm_ref(self.maps[i]["to"])
            if Index.load_by_query({"titleVariants": nref}):
                raise InputError("'%s' cannot be a shorthand name: a text with this title already exisits." % nref)
            if not nref:
                raise InputError("Couldn't understand text reference: '%s'." % self.maps[i]["to"])
            self.maps[i]["to"] = nref

    def _post_save(self):
        # invalidate in-memory cache
        # todo: move this to a caching system / save event
        for variant in self.titleVariants:
            for title in scache.indices.keys():
                if title.startswith(variant):
                    print "Deleting index + " + title
                    del scache.indices[title]
        for ref in scache.parsed.keys():
            if ref.startswith(self.title):
                print "Deleting parsed" + ref
                del scache.parsed[ref]
        scache.texts_titles_cache = scache.texts_titles_json = None


class IndexSet(abst.AbstractMongoSet):
    recordClass = Index


class CommentaryIndex(object):
    def __init__(self, commentor_name, book_name):
        self.c_index = Index().load_by_query({
            "titleVariants": commentor_name,
            "categories.0": "Commentary"
        })
        if not self.c_index:
            raise InputError("No commentor named {}".format(commentor_name))

        self.b_index = Index().load_by_query({
            "titleVariants": book_name,
            "categories.0": {"$in": ["Tanach", "Mishnah", "Talmud", "Halakhah"]}
        })
        if not self.b_index:
            raise InputError("No book named {}".format(book_name))

        # This whole dance is a bit of a mess.
        # Todo: methods for all of these variables, leaving underlying objects as datastore
        self.__dict__.update(self.c_index.contents())
        self.commentaryBook = self.b_index.title
        self.commentaryCategories = self.b_index.categories
        self.categories = ["Commentary"] + self.b_index.categories + [self.b_index.title]
        self.title = self.title + " on " + self.b_index.title
        self.commentator = commentor_name
        if getattr(self, "heTitle", None):
            self.heCommentator = self.heTitle
            if getattr(self.b_index, "heTitle", None):
                self.heBook = self.heTitle  # doesn't this overlap self.heCommentor?
                self.heTitle = self.heTitle + u" \u05E2\u05DC " + self.b_index.heTitle
        self.sectionNames = self.b_index.sectionNames + ["Comment"]
        self.textDepth = len(self.sectionNames)
        self.titleVariants = [self.title]
        if getattr(self.b_index, "length", None):
            self.length = self.b_index.length


        """
        with i as primary record, populated from commentor record, and
        bookindex as the commented on book

        i["commentaryBook"] = bookIndex["title"]
        i["commentaryCategories"] = bookIndex["categories"]
        i["categories"] = ["Commentary"] + bookIndex["categories"] + [bookIndex["title"]]
        i["commentator"] = match.group(1)
        if "heTitle" in i:
            i["heCommentator"] = i["heTitle"]
        i["title"] = i["title"] + " on " + bookIndex["title"]
        if "heTitle" in i and "heTitle" in bookIndex:
            i["heBook"] = i["heTitle"]
            i["heTitle"] = i["heTitle"] + u" \u05E2\u05DC " + bookIndex["heTitle"]
        i["sectionNames"] = bookIndex["sectionNames"] + ["Comment"]
        i["textDepth"] = len(i["sectionNames"])
        i["titleVariants"] = [i["title"]]
        if "length" in bookIndex:
            i["length"] = bookIndex["length"]
        """

    def copy(self):
        #todo: make this quicker, by utilizing copy methods of the composing objects
        return copy.deepcopy(self)


def get_index(bookname):
    # look for result in indices cache
    if not bookname:
        raise InputError("No book provided.")

    cached_result = scache.get_index(bookname)
    if cached_result:
        return cached_result

    bookname = (bookname[0].upper() + bookname[1:]).replace("_", " ")  #todo: factor out method

    # simple Index
    i = Index().load_by_query({"titleVariants": bookname})
    if i:
        scache.set_index(bookname, i)
        return i

    # "commenter" on "book"
    pattern = r'(?P<commentor>.*) on (?P<book>.*)'
    m = re.match(pattern, bookname)
    if m:
        i = CommentaryIndex(m.group('commentor'), m.group('book'))
        scache.set_index(bookname, i)
        return i

    raise InputError("No book named {}".format(bookname))


def get_text_categories():
    """
    Reutrns a list of all known text categories.
    """
    return IndexSet().distinct("categories")


"""
                    -------------------
                     Versions & Chunks
                    -------------------
"""

class AbstractMongoTextRecord(abst.AbstractMongoRecord):
    collection = "texts"
    readonly = True
    required_attrs = [
        "chapter"
    ]

    def __init__(self, attrs=None):
        abst.AbstractMongoRecord.__init__(self, attrs)
        self._text_ja = None

    def count_words(self):
        """ Returns the number of words in this Version """
        return self._get_text_ja().count_words()

    def count_chars(self):
        """ Returns the number of characters in this Version """
        return self._get_text_ja().count_chars()

    def _get_text_ja(self):
        if not self._text_ja:
            self._text_ja = ja.JaggedTextArray(self.chapter)
        return self._text_ja


class Version(AbstractMongoTextRecord):
    """
    A version of a text.
    Relates to a complete single record from the texts collection
    """
    readonly = False
    history_noun = 'text'

    required_attrs = [
        "chapter",
        "language",
        "title",
        "versionSource",
        "versionTitle"
    ]
    optional_attrs = [
        "status",
        "method",
        "heversionSource", # bad data?
        "priority", # used?
        "versionUrl" # bad data?
    ]


class VersionSet(abst.AbstractMongoSet):
    recordClass = Version

    def count_words(self):
        return sum([v.count_words() for v in self])

    def count_chars(self):
        return sum([v.count_chars() for v in self])


class Chunk(AbstractMongoTextRecord):
    readonly = True


class SimpleChunk(Chunk):
    pass


class MergedChunk(Chunk):
    pass


def process_index_title_change_in_versions(indx, **kwargs):
    VersionSet({"title": kwargs["old"]}).update({"title": kwargs["new"]})

    if indx.is_commentary():  # and "commentaryBook" not in d:  # looks useless
        old_titles = get_commentary_version_titles(kwargs["old"])
    else:
        old_titles = get_commentary_version_titles_on_book(kwargs["old"])
    old_new = [(title, title.replace(kwargs["old"], kwargs["new"], 1)) for title in old_titles]
    for pair in old_new:
        VersionSet({"title": pair[0]}).update({"title": pair[1]})


def process_index_delete_in_versions(indx, **kwargs):
    VersionSet({"title": indx.title}).delete()
    if indx.is_commentary():  # and not getattr(self, "commentator", None):   # Seems useless
        get_commentary_versions(indx.title).delete()


def get_commentary_versions(commentators=None):
    """ Returns a VersionSet of commentary texts
    """
    if isinstance(commentators, basestring):
        commentators = [commentators]
    if not commentators:
        commentators = IndexSet({"categories.0": "Commentary"}).distinct("title")
    commentary_re = "^(%s) on " % "|".join(commentators)
    return VersionSet({"title": {"$regex": commentary_re}})


def get_commentary_version_titles(commentators=None):
    """
    Returns a list of text titles that exist in the DB which are commentaries.
    """
    return get_commentary_versions(commentators).distinct("title")


def get_commentary_versions_on_book(book=None):
    """ Return VersionSet of versions that comment on 'book' """
    assert book
    commentary_re = r" on {}".format(book)
    return VersionSet({"title": {"$regex": commentary_re}})


def get_commentary_version_titles_on_book(book):
    return get_commentary_versions_on_book(book).distinct("title")


