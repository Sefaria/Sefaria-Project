# -*- coding: utf-8 -*-
"""
text.py

Writes to MongoDB Collection: texts
"""
import regex as re
import copy
import bleach

from . import abstract as abst
import sefaria.system.cache as scache
from sefaria.system.exceptions import InputError
from sefaria.utils.talmud import section_to_daf
from sefaria.utils.hebrew import is_hebrew
import sefaria.datatype.jagged_array as ja


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
    track_pkeys = True
    pkeys = ["title"]

    required_attrs = [
        "title",
        "titleVariants",
        "categories",
    ]
    optional_attrs = [
        "sectionNames",     # required for simple texts, not for commnetary
        "heTitle",
        "heTitleVariants",
        "maps",
        "order",
        "length",
        "lengths",
        "transliteratedTitle",
        "maps"
    ]

    def contents(self):
        attrs = super(Index, self).contents()
        if getattr(self, "textDepth", None):
            attrs.update({"textDepth": self.textDepth})
        return attrs

    def is_commentary(self):
        return self.categories[0] == "Commentary"

    def load_from_dict(self, d, new=False):
        if "oldTitle" in d and "title" in d and d["oldTitle"] != d["title"]:
            self.load({"title": d["oldTitle"]})
            self.titleVariants.remove(d["oldTitle"])  # should this happen in _normalize?
        return super(Index, self).load_from_dict(d, new)

    def _set_derived_attributes(self):
        if getattr(self, "sectionNames", None):
            self.textDepth = len(self.sectionNames)

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

    def _validate(self):
        assert super(Index, self)._validate()

        # Keys that should be non empty lists
        non_empty = ["categories"]
        if not self.is_commentary():
            non_empty.append("sectionNames")
        for key in non_empty:
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
        if getattr(self, "sectionNames", None):
            for sec in self.sectionNames:
                if any((c in '.-\\/') for c in sec):
                    raise InputError("Text Structure names may not contain periods, hyphens or slashes.")

        # Make sure all title variants are unique
        for variant in self.titleVariants:
            existing = Index().load({"titleVariants": variant})
            if existing and not self.same_record(existing) and existing.title != self.pkeys_orig_values.get("title"):
                #if not getattr(self, "oldTitle", None) or existing.title != self.oldTitle:
                raise InputError('A text called "%s" already exists.' % variant)

        return True

    def _prepare_second_save(self):
        if getattr(self, "maps", None) is None:
            self.maps = []
        for i in range(len(self.maps)):
            #TODO: This isn't wired up yet!!!
            nref = "foo"
            #nref = sefaria.texts.norm_ref(self.maps[i]["to"])
            if Index().load({"titleVariants": nref}):
                raise InputError("'%s' cannot be a shorthand name: a text with this title already exisits." % nref)
            if not nref:
                raise InputError("Couldn't understand text reference: '%s'." % self.maps[i]["to"])
            self.maps[i]["to"] = nref

    def _post_save(self):
        # invalidate in-memory cache
        # todo: move this to new caching system or save event
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
        self.c_index = Index().load({
            "titleVariants": commentor_name,
            "categories.0": "Commentary"
        })
        if not self.c_index:
            raise InputError("No commentor named {}".format(commentor_name))

        self.b_index = Index().load({
            "titleVariants": book_name,
            "categories.0": {"$in": ["Tanach", "Mishnah", "Talmud", "Halakhah"]}
        })
        if not self.b_index:
            raise InputError("No book named {}".format(book_name))

        # This whole dance is a bit of a mess.
        # Todo: see if we can clean it up a bit
        # could expose the b_index and c_index records to consumers of this object, and forget the renaming
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

    def is_commentary(self):
        return True

    def copy(self):
        #todo: make this quicker, by utilizing copy methods of the composed objects
        return copy.deepcopy(self)

    def contents(self):
        attrs = vars(self)
        del attrs["c_index"]
        del attrs["b_index"]
        return attrs


def get_index(bookname):
    # look for result in indices cache
    if not bookname:
        raise InputError("No book provided.")

    cached_result = scache.get_index(bookname)
    if cached_result:
        return cached_result

    bookname = (bookname[0].upper() + bookname[1:]).replace("_", " ")  #todo: factor out method

    # simple Index
    i = Index().load({"$or": [{"titleVariants": bookname}, {"heTitleVariants": bookname}]})
    if i:
        scache.set_index(bookname, i)
        return i

    # "commenter" on "book"
    # todo: handle hebrew x on y format (do we need this?)
    pattern = r'(?P<commentor>.*) on (?P<book>.*)'
    m = re.match(pattern, bookname)
    if m:
        i = CommentaryIndex(m.group('commentor'), m.group('book'))
        scache.set_index(bookname, i)
        return i

    raise InputError("No book named {}".format(bookname))


#Is this used?
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

    ALLOWED_TAGS = ("i", "b", "br", "u", "strong", "em", "big", "small")

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

    def _validate(self):
        assert super(Version, self)._validate()
        """
        A database text record has a field called 'chapter'
        Version records in the wild have a field called 'text', and not always a field called 'chapter'
        """
        return True


    def _normalize(self):
        pass

    @staticmethod
    def _sanitize(text):
        """
        This could be done lower down, on the jagged array level

        Clean html entites of text, remove all tags but those allowed in ALLOWED_TAGS.
        text may be a string or an array of strings.
        """
        if isinstance(text, list):
            text = [Version._sanitize(v) for v in text]
            #for i, v in enumerate(text):
            #   text[i] = Version._sanitize(v)
        elif isinstance(text, basestring):
            text = bleach.clean(text, tags=Version.ALLOWED_TAGS)
        else:
            return False
        return text


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


"""
                    -------------------
                           Refs
                    -------------------
"""

"""
Replacing:
    def norm_ref(ref, pad=False, context=0):
        Returns a normalized string ref for 'ref' or False if there is an
        error parsing ref.
        * pad: whether to insert 1s to make the ref specfic to at least section level
            e.g.: "Genesis" --> "Genesis 1"
        * context: how many levels to 'zoom out' from the most specific possible ref
            e.g., with context=1, "Genesis 4:5" -> "Genesis 4"

    norm_ref(tref) -> Ref(tref).normal_form()
                        or
                      str(Ref(tref))

    norm_ref(tref, context = 1) -> Ref(tref).context_ref().normal()
    norm_ref(tref, context = 2) -> Ref(tref).context_ref(2).normal()
    norm_ref(tref, pad = True) -> Ref(tref).padded_ref().normal()

"""


class Ref(object):
    """
        Current attr, old attr - def
        tref, ref - the original string reference
        * book - a string name of the text
        * sectionNames - an array of strings naming the kinds of sections in this text (Chapter, Verse)
        * textDepth - an integer denote the number of sections named in sectionNames
        * sections - an array of ints giving the requested sections numbers
        * toSections - an array of ints giving the requested sections at the end of a range
        * next, prev - an dictionary with the ref and labels for the next and previous sections
        * categories - an array of categories for this text
        * type - the highest level category for this text
    """

    # A quick swing at the caching issue.  Needs work.
    #__metaclass__ = abst.CachingType

    def __init__(self, tref=None, _obj=None):
        """
        Object is initialized with either tref - a textual reference, or _obj - a complete dict composing the Ref data
        The _obj argument is used internally.
        """
        self.index = None
        self.sections = []
        self.toSections = []
        self._normal = None
        self._url = None
        if tref:
            self.tref = tref
            if is_hebrew(tref):
                self.__clean_tref_he()
                self.__init_he()
            else:
                self.__clean_tref_en()
                self.__init_en()
        if _obj:
            for key, value in _obj.items():
                setattr(self, key, value)

    def __clean_tref_en(self):
        try:
            self.tref = self.tref.strip().decode('utf-8').replace(u"–", "-").replace(":", ".").replace("_", " ")
        except UnicodeEncodeError, e:
            return {"error": "UnicodeEncodeError: %s" % e}
        except AttributeError, e:
            return {"error": "AttributeError: %s" % e}

        try:
            # capitalize first letter (don't title case all to avoid e.g., "Song Of Songs")
            self.tref = self.tref[0].upper() + self.tref[1:]
        except IndexError:
            pass

    def __clean_tref_he(self):
        #this doesn't need to except anything, I don't believe
        self.tref = self.tref.strip().replace(u"–", "-").replace("_", " ")  # don't replace : in Hebrew, where it can indicate amud

    def __init_en(self):
        parts = [s.strip() for s in self.tref.split("-")]
        if len(parts) > 2:
            raise InputError("Couldn't understand ref {} (too many -'s)".format(self.tref))
        base = parts[0]

        # An initial non-numeric string and a terminal string, seperated by period, comma, space, or a combination
        ref_match = re.match(r"(\D+)(?:[., ]+(\d.*))?$", base)
        if not ref_match:
            raise InputError("No book found in {}".format(base))
        self.book = ref_match.group(1)
        if ref_match.lastindex > 1:
            self.sections = ref_match.group(2).split(".")
        #verify well formed section strings?

        # Try looking for a stored map (shorthand)
        shorthand = Index().load({"maps": {"$elemMatch": {"from": self.book}}})
        if shorthand:
            self.__init_shorthand(shorthand)

        self.index = get_index(self.book)

        if self.index.is_commentary() and not getattr(self.index, "commentaryBook", None):
            raise InputError("Please specify a text that {} comments on.".format(self.index.title))

        self.book = self.index.title
        self.type = self.index.categories[0]  # review

        if self.is_talmud():
            '''
            pRef["bcv"] = bcv
            pRef["ref"] = ref
            result = subparse_talmud(pRef, index, pad=pad)
            result["ref"] = make_ref(pRef)
            return result
            '''



        #handle parts[1]

    #todo: refactor
    def __init_shorthand(self, shorthand):
        for i in range(len(shorthand.maps)):
            if shorthand.maps[i]["from"] == self.book:
                # replace the shorthand in ref with its mapped value and reinit
                to = shorthand.maps[i]["to"]
                if self.tref != to:  # What's the point of this?  When is it false?
                    self.tref = self.tref.replace(self.book + " ", to + ".")
                    self.tref = self.tref.replace(self.book, to)

                #parsedRef = Ref(self.tref)
                self.shorthand = self.book
                self.sections = []
                self.__clean_tref_en()
                self.__init_en()

                # Needs pad False
                self.shorthandDepth = len(Ref(to).sections)  # This could be as easy as a regex match, but for the case of a shorthand to a shorthand.

    def __init_talmud(self):
        pass

    def __init_he(self):
        pass

    def __str__(self):
        return self.normal()

    def __repr__(self):
        return self.__class__.__name__ + "('" + self.tref + "')"

    def is_talmud(self):
        return self.type == "Talmud" or (self.type == "Commentary" and getattr(self.index, "commentaryCategories", None) and self.index.commentaryCategories[0] == "Talmud")

    '''
    generality()
    is_section_level()
    is_spanning()
    '''
    def context_ref(self, level=1):
        """
        Return a Ref object that is more general than this Ref.
        * level: how many levels to 'zoom out' from the most specific possible ref
            e.g., with context=1, "Genesis 4:5" -> "Genesis 4"
        """
        if level > len(self.index.textDepth):
            raise Exception("Call to Ref.context_ref of {} exceeds Ref depth of {}.".format(level, len(self.index.textDepth)))
        d = copy.deepcopy(vars(self))
        d["sections"] = d["sections"][:self.index.textDepth - level]
        d["toSections"] = d["toSections"][:self.index.textDepth - level]
        return Ref(_obj=d)

    def padded_ref(self):
        d = copy.deepcopy(vars(self))
        if self.is_talmud():
            if len(self.sections) == 0: #No daf specified
                section = 3 if "Bavli" in self.index.categories else 1
                d["sections"].append(section)
        for i in range(self.index.textDepth - len(d["sections"]) - 1):
            d["sections"].append(1)
        return Ref(_obj=d)

    def normal(self):
        if not self._normal:
            self._normal = self.book

            if self.type == "Commentary" and not getattr(self.index, "commentaryCategories", None):
                return self._normal

            elif self.is_talmud():
                self._normal += " " + section_to_daf(self.sections[0]) if len(self.sections) > 0 else ""
                self._normal += ":" + ":".join([str(s) for s in self.sections[1:]]) if len(self.sections) > 1 else ""

            else:
                sections = ":".join([str(s) for s in self.sections])
                if len(sections):
                    self._normal += " " + sections
            ''' This should be fine, once we have toSection populated
            for i in range(len(self.sections)):
                if not self.sections[i] == self.toSections[i]:
                    if i == 0 and self.is_talmud():
                        self._normal += "-%s" % (":".join([str(s) for s in [section_to_daf(self.toSections[0])] + self.toSections[i+1:]]))
                    else:
                        self._normal += "-%s" % (":".join([str(s) for s in self.toSections[i:]]))
                    break
            '''
        return self._normal

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
        return self.url