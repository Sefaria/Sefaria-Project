"""
text.py

Writes to MongoDB Collection: texts
"""

import sefaria.model.abstract as abst
import sefaria.datatype.jagged_array as ja
import sefaria.system.cache as scache
from sefaria.system.exceptions import UserError


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
        "sectionNames"
    ]
    optional_attrs = [
        "heTitle",
        "heTitleVariants",
        "maps",
        "order",
        "length",
        "lengths",
        "transliteratedTitle",
        "maps"
    ]

    def load_from_dict(self, d):
        """
        todo: reset indices and parsed cache on update of title



        """
        if "oldTitle" in d and "title" in d and d["oldTitle"] != d["title"]:
            self.load_by_query({"title": d["oldTitle"]})
            self.titleVariants.remove(d["oldTitle"])  # should this happen in _normalize

            # Special case if old is a Commentator name
            if d["categories"][0] == "Commentary" and "commentaryBook" not in d:
                commentary_text_titles = get_commentary_texts_list()
                old_titles = [title for title in commentary_text_titles if title.find(d["oldTitle"]) == 0]
                old_new = [(title, title.replace(d["oldTitle"], d["title"], 1)) for title in old_titles]
                for pair in old_new:
                    Index({"oldTitle": pair[0], "title": pair[1]}).save()
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
            elif self.heTitle not in self.titleVariants:
                self.heTitleVariants.append(self.heTitle)

    def _validate(self, attrs=None):
        assert super(Index, self)._validate(attrs)

        # Keys that should be non empty lists
        for key in ("categories", "sectionNames"):
            if not isinstance(getattr(self, key), list) or len(getattr(self, key)) == 0:
                raise UserError("%s field must be a non empty list of strings." % key)

        # Disallow special characters in text titles
        if any((c in '.-\\/') for c in self.title):
            raise UserError("Text title may not contain periods, hyphens or slashes.")

        # Disallow special character in categories
        for cat in self.categories:
            if any((c in '.-') for c in cat):
                raise UserError("Categories may not contain periods or hyphens.")

        # Disallow special character in sectionNames
        for cat in self.sectionNames:
            if any((c in '.-\\/') for c in cat):
                raise UserError("Text Structure names may not contain periods, hyphens or slashes.")

        # Make sure all title variants are unique
        for variant in self.titleVariants:
            existing = Index().load_by_query({"titleVariants": variant})
            if existing and existing != self and existing.title != self.pkeys_orig_values.get("title", None):
                #if not getattr(self, "oldTitle", None) or existing.title != self.oldTitle:
                raise UserError('A text called "%s" already exists.' % variant)

        return True

    def _prepare_second_save(self):
        if getattr(self, "maps", None) is None:
            self.maps = []
        for i in range(len(self.maps)):
            nref = "foo"
            #nref = sefaria.texts.norm_ref(self.maps[i]["to"])
            if Index.load_by_query({"titleVariants": nref}):
                raise UserError("'%s' cannot be a shorthand name: a text with this title already exisits." % nref)
            if not nref:
                raise UserError("Couldn't understand text reference: '%s'." % self.maps[i]["to"])
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


class AbstractMongoTextRecord(abst.AbstractMongoRecord):
    collection = "texts"

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
    history_noun = 'text'

    required_attrs = [
        "chapter",
        "language",
        "title",
        "versionSource",
        "versionTitle"
    ]
    optional_attrs = [
        "status"
    ]


class Chunk(AbstractMongoTextRecord):
    readonly = True


class SimpleChunk(Chunk):
    pass


class MergedChunk(Chunk):
    pass


class VersionSet(abst.AbstractMongoSet):
    recordClass = Version

    def count_words(self):
        return sum([v.count_words() for v in self])

    def count_chars(self):
        return sum([v.count_chars() for v in self])


def process_index_title_change_in_versions(indx, **kwargs):
    VersionSet({"title": kwargs["old"]}).update({"title": kwargs["new"]})


def get_commentary_texts_list():
    """
    Returns a list of text titles that exist in the DB which are commentaries.
    """
    commentators = IndexSet({"categories.0": "Commentary"}).distinct("title")
    commentary_re = "^(%s) on " % "|".join(commentators)
    return VersionSet({"title": {"$regex": commentary_re}}).distinct("title")


def get_text_categories():
    """
    Reutrns a list of all known text categories.
    """
    return IndexSet().distinct("categories")

