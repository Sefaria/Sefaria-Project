# -*- coding: utf-8 -*-
"""
text.py

Writes to MongoDB Collection: texts
"""
import regex as re
import copy
import bleach

from django.utils import simplejson as json

from . import abstract as abst
import sefaria.system.cache as scache
from sefaria.system.exceptions import InputError
from sefaria.utils.talmud import section_to_daf, daf_to_section
from sefaria.utils.hebrew import is_hebrew, decode_hebrew_numeral
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
            nref = Ref(self.maps[i]["to"]).normal()
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


'''
Text title helpers
Do these have a better home?
A Library class?
'''


#Was get_titles_in_text
def get_titles_in_string(st, lang="en"):
    """
    Returns a list of known text titles that occur within text.
    todo: Verify that this works for a Hebrew text
    """

    all_titles = get_text_titles({}, lang)
    matched_titles = [title for title in all_titles if st.find(title) > -1]

    return matched_titles


def get_text_titles(query={}, lang="en"):
    if lang == "en":
        return get_en_text_titles(query)
    elif lang == "he":
        return get_he_text_titles(query)
    #else:
    #	logger.error("get_text_titles: Unsupported Language: %s", lang)


def get_en_text_titles(query={}):
    """
    Return a list of all known text titles, including title variants and shorthands/maps.
    Optionally take a query to limit results.
    Cache the fill list which is used on every page (for nav autocomplete)
    """

    if query or not scache.texts_titles_cache:
        titles = IndexSet(query).distinct("titleVariants")
        titles.extend(IndexSet(query).distinct("maps.from"))

        if query:
            return titles

        scache.texts_titles_cache = titles

    return scache.texts_titles_cache


def get_he_text_titles(query={}):

    if query or not scache.he_texts_titles_cache:
        titles = IndexSet(query).distinct("heTitleVariants")

        if query:
            return titles

        scache.he_texts_titles_cache = titles

    return scache.he_texts_titles_cache


def get_text_titles_json():
    """
    Returns JSON of full texts list, keeps cached
    """

    if not scache.texts_titles_json:
        scache.texts_titles_json = json.dumps(get_text_titles())

    return scache.texts_titles_json




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


'''
Version helpers
Do these have a better home?
A Library class?
'''


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


class RefCachingType(type):

    def __init__(cls, name, parents, dct):
        super(RefCachingType, cls).__init__(name, parents, dct)
        cls.__cache = {}

    def __call__(cls, *args, **kwargs):
        if len(args) == 1:
            key = args[0]
        else:
            key = kwargs.get("tref")
        if key:
            if key in cls.__cache:
                return cls.__cache[key]
            else:
                obj = super(RefCachingType, cls).__call__(*args, **kwargs)
                cls.__cache[key] = obj
                return obj
        else:
            return super(RefCachingType, cls).__call__(*args, **kwargs)


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

    __metaclass__ = RefCachingType

    def __init__(self, tref=None, _obj=None):
        """
        Object is initialized with either tref - a textual reference, or _obj - a complete dict composing the Ref data
        The _obj argument is used internally.
        """
        self.index = None
        self.book = None
        self.type = None
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
        elif _obj:
            for key, value in _obj.items():
                setattr(self, key, value)
            self._normal = None
            self._url = None
            self.tref = self.normal()

    """ English Constructor """

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

    def __init_en(self):
        parts = [s.strip() for s in self.tref.split("-")]
        if len(parts) > 2:
            raise InputError("Couldn't understand ref {} (too many -'s)".format(self.tref))
        base = parts[0]

        # An initial non-numeric string and a terminal string, seperated by period, comma, space, or a combination
        ref_match = re.match(r"(\D+)(?:[., ]+(\d.*))?$", base)
        if not ref_match:
            raise InputError("No book found in {}".format(base))
        self.book = ref_match.group(1).strip(" ,")

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

        if len(self.sections) == 0:  # Book title only
            return

        if self.is_talmud():
            self.__parse_talmud()
            if len(parts) == 2:
                self.__parse_talmud_range(parts[1])
            else:
                self.toSections = self.sections[:]
        else:
            self.toSections = self.sections[:]

            if len(parts) == 2:
                range_part = parts[1].split(".")
                delta = len(self.sections) - len(range_part)
                for i in range(delta, len(self.sections)):
                    self.toSections[i] = int(range_part[i - delta])

        self.sections = [int(x) for x in self.sections]
        self.toSections = [int(x) for x in self.toSections]

        if not self.is_talmud():
            checks = [self.sections, self.toSections]
            for check in checks:
                if getattr(self.index, "length", None) and len(check):
                    if check[0] > self.index.length:
                        raise InputError("{} only has {} {}s.".format(self.book, self.index.length, self.index.sectionNames[0]))

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

    def __parse_talmud(self):
        daf = self.sections[0]  # If self.sections is empty, we never get here
        if not re.match("\d+[ab]?", daf):
            raise InputError("Couldn't understand Talmud Daf reference: {}".format(daf))
        try:
            if daf[-1] in ["a", "b"]:
                amud = daf[-1]
                daf = int(daf[:-1])
            else:
                amud = "a"
                daf = int(daf)
        except ValueError:
            raise InputError("Couldn't parse Talmud Daf reference: {}".format(daf))

        if getattr(self.index, "length", None) and daf > self.index.length:
            raise InputError("{} only has {} dafs.".format(self.book, self.index.length))

        indx = daf * 2
        if amud == "a": indx -= 1

        self.sections[0] = indx

    def __parse_talmud_range(self, range_part):
        #todo: make sure to-daf isn't out of range
        self.toSections = range_part.split(".")  # this was converting space to '.', for some reason.

        # 'Shabbat 23a-b'
        if self.toSections[0] == 'b':
            self.toSections[0] = self.sections[0] + 1

        # 'Shabbat 24b-25a'
        elif re.match("\d+[ab]", self.toSections[0]):
            self.toSections[0] = daf_to_section(self.toSections[0])

        # 'Shabbat 24b.12-24'
        else:
            delta = len(self.sections) - len(self.toSections)
            for i in range(delta -1, -1, -1):
                self.toSections.insert(0, self.sections[i])

    """ Hebrew Constructor """

    def __clean_tref_he(self):
        #this doesn't need to except anything, I don't believe
        self.tref = self.tref.strip().replace(u"–", "-").replace("_", " ")  # don't replace : in Hebrew, where it can indicate amud

    def __init_he(self):
        """
        Decide what kind of reference we're looking at, then parse it to its parts
        """

        titles = get_titles_in_string(self.tref, "he")

        if not titles:
            #logger.warning("parse_he_ref(): No titles found in: %s", ref)
            raise InputError(u"No titles found in: {}".format(self.tref))

        he_title = max(titles, key=len)  # Assuming that longest title is the best
        index = get_index(he_title)

        cat = index.categories[0]

        if cat == "Tanach":
            reg = self.get_he_tanach_ref_regex(he_title)
            match = reg.search(self.tref)
        elif cat == "Mishnah":
            reg = self.get_he_mishna_pehmem_regex(he_title)
            match = reg.search(self.tref)
            if not match:
                reg = self.get_he_mishna_peh_regex(he_title)
                match = reg.search(self.tref)
            if not match:
                reg = self.get_he_tanach_ref_regex(he_title)
                match = reg.search(self.tref)
        elif cat == "Talmud":
            reg = self.get_he_mishna_pehmem_regex(he_title) #try peh-mem form first, since it's stricter
            match = reg.search(self.tref)
            if match:  # if it matches, we need to force a mishnah result
                he_title = u"משנה" + " " + he_title
                index = get_index(he_title)
            else:
                reg = self.get_he_talmud_ref_regex(he_title)
                match = reg.search(self.tref)
        else:  # default
            raise InputError(u"No support for Hebrew " + cat + " references: " + self.tref)

        if not match:
            #logger.warning("parse_he_ref(): Can not match: %s", ref)
            raise InputError(u"Match Miss: {}".format(self.tref))

        self.index = index
        self.book = index.title
        self.type = index.categories[0]
        self.sections = []

        gs = match.groupdict()

        if u"שם" in gs.get('num1'): # todo: handle ibid refs or fix regex so that this doesn't pass
            raise InputError(u"{} not supported".format(u"שם"))

        if gs.get('num1') is not None and gs.get('amud') is not None:
            daf = decode_hebrew_numeral(gs['num1'])
            indx = daf * 2
            if u"\u05d0" in gs['amud'] or "." in gs['amud']:
                indx -= 1
            #elif u"\u05d1" in gs['amud'] or ":" in gs['amud']:
            self.sections += [indx]
        elif gs.get('num1') is not None:
            n = decode_hebrew_numeral(gs['num1'])
            if self.is_talmud():
                n = n * 2 - 1 # Assuming amud a, since not specified
            self.sections += [n]

        if gs.get('num2') is not None:
            self.sections += [decode_hebrew_numeral(gs['num2'])]

        # Ranges are not supported
        self.toSections = self.sections[:]

    @staticmethod
    def get_he_mishna_pehmem_regex(title):
        exp = ur"""(?:^|\s)								# beginning or whitespace
            (?P<title>{0})								# title
            \s+											# a space
            (?:
                \u05e4(?:"|\u05f4|'')?                  # Peh (for 'perek') maybe followed by a quote of some sort
                |\u05e4\u05e8\u05e7\s*                  # or 'perek' spelled out, followed by space
            )
            (?P<num1>									# the first number (1 of 3 styles, below)
                \p{{Hebrew}}['\u05f3]					# (1: ') single letter, followed by a single quote or geresh
                |(?=\p{{Hebrew}}+(?:"|\u05f4|'')\p{{Hebrew}}) # (2: ") Lookahead:  At least one letter, followed by double-quote, two single quotes, or gershayim, followed by  one letter
                    \u05ea*(?:"|\u05f4|'')?				# Many Tavs (400), maybe dbl quote
                    [\u05e7-\u05ea]?(?:"|\u05f4|'')?	# One or zero kuf-tav (100-400), maybe dbl quote
                    [\u05d8-\u05e6]?(?:"|\u05f4|'')?	# One or zero tet-tzaddi (9-90), maybe dbl quote
                    [\u05d0-\u05d8]?					# One or zero alef-tet (1-9)															#
                |(?=\p{{Hebrew}})						# (3: no punc) Lookahead: at least one Hebrew letter
                    \u05ea*								# Many Tavs (400)
                    [\u05e7-\u05ea]?					# One or zero kuf-tav (100-400)
                    [\u05d8-\u05e6]?					# One or zero tet-tzaddi (9-90)
                    [\u05d0-\u05d8]?					# One or zero alef-tet (1-9)
            )											# end of the num1 group
            (?:\s+[,:]?\s*|\s*[,:]?\s+|\s*[,:]\s*)		# some type of delimiter - colon, comma, or space, maybe a combo
            (?:
                (?:\u05de\u05e9\u05e0\u05d4\s)			# Mishna spelled out, with a space after
                |(?:\u05de(?:"|\u05f4|'')?)				# or Mem (for 'mishna') maybe followed by a quote of some sort
            )
            (?P<num2>									# second number
                \p{{Hebrew}}['\u05f3]					# (1: ') single letter, followed by a single quote or geresh
                |(?=\p{{Hebrew}}+(?:"|\u05f4|'')\p{{Hebrew}}) # (2: ") Lookahead:  At least one letter, followed by double-quote, two single quotes, or gershayim, followed by  one letter
                    \u05ea*(?:"|\u05f4|'')?				# Many Tavs (400), maybe dbl quote
                    [\u05e7-\u05ea]?(?:"|\u05f4|'')?	# One or zero kuf-tav (100-400), maybe dbl quote
                    [\u05d8-\u05e6]?(?:"|\u05f4|'')?	# One or zero tet-tzaddi (9-90), maybe dbl quote
                    [\u05d0-\u05d8]?					# One or zero alef-tet (1-9)															#
                |(?=\p{{Hebrew}})						# (3: no punc) Lookahead: at least one Hebrew letter
                    \u05ea*								# Many Tavs (400)
                    [\u05e7-\u05ea]?					# One or zero kuf-tav (100-400)
                    [\u05d8-\u05e6]?					# One or zero tet-tzaddi (9-90)
                    [\u05d0-\u05d8]?					# One or zero alef-tet (1-9)
            )											# end of the num2 group
            (?=\s|$)									# look ahead - either a space or the end of the string
        """.format(re.escape(title))
        return re.compile(exp, re.VERBOSE)

    @staticmethod
    def get_he_mishna_peh_regex(title):
        exp = ur"""(?:^|\s)								# beginning or whitespace
            (?P<title>{0})								# title
            \s+											# a space
            (?:
                \u05e4(?:"|\u05f4|'')?                  # Peh (for 'perek') maybe followed by a quote of some sort
                |\u05e4\u05e8\u05e7\s*                  # or 'perek' spelled out, followed by space
            )
            (?P<num1>									# the first number (1 of 3 styles, below)
                \p{{Hebrew}}['\u05f3]					# (1: ') single letter, followed by a single quote or geresh
                |(?=\p{{Hebrew}}+(?:"|\u05f4|'')\p{{Hebrew}}) # (2: ") Lookahead:  At least one letter, followed by double-quote, two single quotes, or gershayim, followed by  one letter
                    \u05ea*(?:"|\u05f4|'')?				# Many Tavs (400), maybe dbl quote
                    [\u05e7-\u05ea]?(?:"|\u05f4|'')?	# One or zero kuf-tav (100-400), maybe dbl quote
                    [\u05d8-\u05e6]?(?:"|\u05f4|'')?	# One or zero tet-tzaddi (9-90), maybe dbl quote
                    [\u05d0-\u05d8]?					# One or zero alef-tet (1-9)															#
                |(?=\p{{Hebrew}})						# (3: no punc) Lookahead: at least one Hebrew letter
                    \u05ea*								# Many Tavs (400)
                    [\u05e7-\u05ea]?					# One or zero kuf-tav (100-400)
                    [\u05d8-\u05e6]?					# One or zero tet-tzaddi (9-90)
                    [\u05d0-\u05d8]?					# One or zero alef-tet (1-9)
            )											# end of the num1 group
            (?=\s|$)									# look ahead - either a space or the end of the string
        """.format(re.escape(title))
        return re.compile(exp, re.VERBOSE)

    @staticmethod
    def get_he_tanach_ref_regex(title):
        """
        todo: this is matching "שם" in the num1 group, because the final letters are interspersed in the range.
        """
        exp = ur"""(?:^|\s)								# beginning or whitespace
            (?P<title>{0})								# title
            \s+											# a space
            (?P<num1>									# the first number (1 of 3 styles, below)
                \p{{Hebrew}}['\u05f3]					# (1: ') single letter, followed by a single quote or geresh
                |(?=\p{{Hebrew}}+(?:"|\u05f4|'')\p{{Hebrew}}) # (2: ") Lookahead:  At least one letter, followed by double-quote, two single quotes, or gershayim, followed by  one letter
                    \u05ea*(?:"|\u05f4|'')?				# Many Tavs (400), maybe dbl quote
                    [\u05e7-\u05ea]?(?:"|\u05f4|'')?	# One or zero kuf-tav (100-400), maybe dbl quote
                    [\u05d8-\u05e6]?(?:"|\u05f4|'')?	# One or zero tet-tzaddi (9-90), maybe dbl quote
                    [\u05d0-\u05d8]?					# One or zero alef-tet (1-9)															#
                |(?=\p{{Hebrew}})						# (3: no punc) Lookahead: at least one Hebrew letter
                    \u05ea*								# Many Tavs (400)
                    [\u05e7-\u05ea]?					# One or zero kuf-tav (100-400)
                    [\u05d8-\u05e6]?					# One or zero tet-tzaddi (9-90)
                    [\u05d0-\u05d8]?					# One or zero alef-tet (1-9)
            )											# end of the num1 group
            (?:\s+[,:]?\s*|\s*[,:]?\s+|\.|\s*[,:]\s*|$)	# some type of delimiter - colon, comma, or space, maybe a combo, a single period, or else maybe ref-end
            (?:											# second number group - optional
                (?P<num2>								# second number
                    \p{{Hebrew}}['\u05f3]				# (1: ') single letter, followed by a single quote or geresh
                    |(?=\p{{Hebrew}}+(?:"|\u05f4|'')\p{{Hebrew}}) # (2: ") Lookahead:  At least one letter, followed by double-quote, two single quotes, or gershayim, followed by  one letter
                        \u05ea*(?:"|\u05f4|'')?			# Many Tavs (400), maybe dbl quote
                        [\u05e7-\u05ea]?(?:"|\u05f4|'')?	# One or zero kuf-tav (100-400), maybe dbl quote
                        [\u05d8-\u05e6]?(?:"|\u05f4|'')?	# One or zero tet-tzaddi (9-90), maybe dbl quote
                        [\u05d0-\u05d8]?				# One or zero alef-tet (1-9)															#
                    |(?=\p{{Hebrew}})					# (3: no punc) Lookahead: at least one Hebrew letter
                        \u05ea*							# Many Tavs (400)
                        [\u05e7-\u05ea]?				# One or zero kuf-tav (100-400)
                        [\u05d8-\u05e6]?				# One or zero tet-tzaddi (9-90)
                        [\u05d0-\u05d8]?				# One or zero alef-tet (1-9)
                )?										# end of the num2 group
                (?=\s|$)								# look ahead - either a space or the end of the string
            )?
        """.format(re.escape(title))
        return re.compile(exp, re.VERBOSE)

    @staticmethod
    def get_he_talmud_ref_regex(title):
        exp = ur"""(?:^|\s)								# beginning or whitespace
            (?P<title>{0})								# title
            \s+											# a space
            (\u05d3[\u05e3\u05e4\u05f3']\s+)?			# Daf, spelled with peh, peh sofit, geresh, or single quote
            (?P<num1>									# the first number (1 of 3 styles, below)
                \p{{Hebrew}}['\u05f3]					# (1: ') single letter, followed by a single quote or geresh
                |(?=\p{{Hebrew}}+(?:"|\u05f4|'')\p{{Hebrew}}) # (2: ") Lookahead:  At least one letter, followed by double-quote, two single quotes, or gershayim, followed by  one letter
                    \u05ea*(?:"|\u05f4|'')?				# Many Tavs (400), maybe dbl quote
                    [\u05e7-\u05ea]?(?:"|\u05f4|'')?	# One or zero kuf-tav (100-400), maybe dbl quote
                    [\u05d8-\u05e6]?(?:"|\u05f4|'')?	# One or zero tet-tzaddi (9-90), maybe dbl quote
                    [\u05d0-\u05d8]?					# One or zero alef-tet (1-9)
                |(?=\p{{Hebrew}})						# (3: no punc) Lookahead: at least one Hebrew letter
                    \u05ea*								# Many Tavs (400)
                    [\u05e7-\u05ea]?					# One or zero kuf-tav (100-400)
                    [\u05d8-\u05e6]?					# One or zero tet-tzaddi (9-90)
                    [\u05d0-\u05d8]?					# One or zero alef-tet (1-9)
            )											# end of the num1 group
            (?P<amud>									# amud indicator
                [.:]									# a period or a colon, for a or b
                |[,\s]+			    					# or some space/comma
                [\u05d0\u05d1]							# followed by an aleph or bet
            )?											# end of daf indicator
            (?:\s|$)									# space or end of string
        """.format(re.escape(title))
        return re.compile(exp, re.VERBOSE)

    def __eq__(self, other):
        return self.normal() == other.normal()

    def __ne__(self, other):
        return not self.__eq__(other)

    def is_talmud(self):
        return self.type == "Talmud" or (self.type == "Commentary" and getattr(self.index, "commentaryCategories", None) and self.index.commentaryCategories[0] == "Talmud")

    def is_spanning(self):
        return self.sections != self.toSections

    def is_section_level(self):
        return len(self.sections) == self.index.textDepth - 1

    def is_segment_level(self):
        return len(self.sections) == self.index.textDepth

    '''
    generality()
    '''

    """ Methods to generate new Refs based on this one """
    def section_ref(self):
        if self.is_section_level():
            return self
        return self.padded_ref().context_ref()

    def top_section_ref(self):
        return self.padded_ref().context_ref(self.index.textDepth - 1)

    def context_ref(self, level=1):
        """
        :return: Ref object that is more general than this Ref.
        * level: how many levels to 'zoom out' from the most specific possible ref
            e.g., with context=1, "Genesis 4:5" -> "Genesis 4"
        This does not change a refernce that is less specific than or equally specific to the level given
        """
        if len(self.sections) <= self.index.textDepth - level:
            return self

        if level > self.index.textDepth:
            raise Exception("Call to Ref.context_ref of {} exceeds Ref depth of {}.".format(level, self.index.textDepth))
        d = copy.deepcopy(vars(self))
        d["sections"] = d["sections"][:self.index.textDepth - level]
        d["toSections"] = d["toSections"][:self.index.textDepth - level]
        return Ref(_obj=d)

    def padded_ref(self):
        """
        :return: Ref object with 1s inserted to make the ref specific to the section level
        e.g.: "Genesis" --> "Genesis 1"
        This does not change a reference that is specific to the section or segment level.
        """
        if len(self.sections) >= self.index.textDepth - 1:
            return self

        d = copy.deepcopy(vars(self))
        if self.is_talmud():
            if len(self.sections) == 0: #No daf specified
                section = 3 if "Bavli" in self.index.categories else 1
                d["sections"].append(section)
                d["toSections"].append(section)
        for i in range(self.index.textDepth - len(d["sections"]) - 1):
            d["sections"].append(1)
            d["toSections"].append(1)  # todo: is this valid in all cases?
        return Ref(_obj=d)

    """ String Representations """
    def __str__(self):
        return self.normal()

    def __repr__(self):  # Wanted to use orig_tref, but repr can not include Unicode
        return self.__class__.__name__ + "(" + self.normal() + ")"

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
