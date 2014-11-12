# -*- coding: utf-8 -*-
"""
text.py
"""
import regex
import re2
import copy
import bleach
import json

from . import abstract as abst
from . import count

import sefaria.system.cache as scache
from sefaria.system.exceptions import InputError, BookNameError, IndexSchemaError
from sefaria.utils.talmud import section_to_daf, daf_to_section
from sefaria.utils.hebrew import is_hebrew, decode_hebrew_numeral
import sefaria.datatype.jagged_array as ja


"""
                ------------------------
                 Terms and Term Schemes
                ------------------------
"""


class Term(abst.AbstractMongoRecord):
    collection = 'term'
    track_pkeys = True
    pkeys = ["name"]

    required_attrs = [
        "name",
        "titles"
    ]
    optional_attrs = [
        "scheme",
        "order",
        "ref"
    ]


class TermSet(abst.AbstractMongoSet):
    recordClass = Term


class TermScheme(abst.AbstractMongoRecord):
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
    :param index:
    :param serial:
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


class SchemaNode(object):
    delimiter_re = ur"[,.: ]+"  # this doesn't belong here.  Does this need to be an arg?

    def __init__(self, index=None, serial=None):
        #set default values
        self.children = []  # Is this enough?  Do we need a dict for addressing?
        self.parent = None
        self.default = False
        self.key = None
        self.titles = []
        self.sharedTitle = None
        self.index = index
        self.checkFirst = None

        self._address = []
        self._primary_title = {}
        self._full_title = {}

        if not serial:
            return

        self.__dict__.update(serial)

        self.validate()

        if self.sharedTitle:
            try:
                term = Term().load({"name": self.sharedTitle})
                self.titles = term.titles
            except Exception, e:
                raise IndexSchemaError("Failed to load term named {}. {}".format(self.sharedTitle, e))

        if self.titles:
            #process titles into more digestable format
            #is it worth caching this on the term nodes?
            pass

    def validate(self):
        if getattr(self, "nodes", None) and (getattr(self, "nodeType", None) or getattr(self, "nodeParameters", None)):
            raise IndexSchemaError("Schema node {} must be either a structure node or a content node.".format(self.key or "root"))

        if not self.default and not self.sharedTitle and not self.titles:
            raise IndexSchemaError("Schema node {} must have titles, a shared title node, or be default".format(self.key or "root"))

        if self.default and (self.titles or self.sharedTitle):
            raise IndexSchemaError("Schema node {} - default nodes can not have titles".format(self.key or "root"))

        if self.titles and self.sharedTitle:
            raise IndexSchemaError("Schema node {} with sharedTitle can not have explicit titles".format(self.key or "root"))

        # that there's a key, if it's a child node.

    def primary_title(self, lang):
        if not self._primary_title.get(lang):
            for t in self.titles:
                if t.get("lang") == lang and t.get("primary"):
                    self._primary_title[lang] = t.get("text")
                    break
        return self._primary_title[lang]

    def full_title(self, lang):
        if not self._full_title.get(lang):
            if self.parent:
                self._full_title[lang] = self.parent.full_title(lang) + ", " + self.primary_title(lang)
            else:
                self._full_title[lang] = self.primary_title(lang)
        return self._full_title[lang]

    def add_title(self, text, lang, primary=False, replace_primary=False):
        """
        :param text: Text of the title
        :param language:  Language code of the title (e.g. "en" or "he")
        :param primary: Is this a primary title?
        :param replace_primary: If this title is marked a primary, and there is already a primary title in this language, then it will throw an error unless this value is true.
        :return: the object
        """
        if any([x for x in self.titles if x["text"] == text and x["lang"] == lang]):
            return

        d = {
                "text": text,
                "lang": lang
        }

        if primary:
            d["primary"] = True

        has_primary = any([x for x in self.titles if x["lang"] == lang and x.get("primary")])
        if has_primary and primary:
            if not replace_primary:
                raise IndexSchemaError("Node {} already has a primary title.".format(self.key))
            #todo: remove primary tag from old primary

        self.titles.append(d)

    def serialize(self):
        """
        This should be called and extended by subclasses
        :return:
        """
        d = {}
        d["key"] = self.key
        if self.default:
            d["default"] = True
        elif self.sharedTitle:
            d["sharedTitle"] = self.sharedTitle
        else:
            d["titles"] = self.titles
        if self.checkFirst:
            d["checkFirst"] = self.checkFirst
        return d

    def regex(self, lang):
        """
        :return: string - regular expression part to match references for this node
        """
        return ""

    def append(self, node):
        self.children.append(node)
        node.parent = self

    def append_to(self, node):
        node.append(self)

    def has_children(self):
        return bool(self.children)

    def siblings(self):
        if self.parent:
            return [x for x in self.parent.children if x is not self]
        else:
            return None

    #http://stackoverflow.com/a/14692747/213042
    #http://stackoverflow.com/a/16300379/213042
    def address(self):
        """
        :return list: Returns a list of keys to access this node.
        """
        if not self._address:
            if self.parent:
                self._address = self.parent.address() + [self.key]
            else:
                self._address = [self.key]

        return self._address

    def is_only_alone(self, lang):  # Does this node only have 'alone' representations?
        return not any([t for t in self.titles if t.lang == lang and t.presentation != "alone"])

    def is_default(self):
        return self.default

    """ String Representations """
    def __str__(self):
        return self.full_title("en")

    def __repr__(self):  # Wanted to use orig_tref, but repr can not include Unicode
        return self.__class__.__name__ + "('" + self.full_title("en") + "')"

class SchemaStructureNode(SchemaNode):
    def __init__(self, index=None, serial=None):
        super(SchemaStructureNode, self).__init__(index, serial)
        for node in self.nodes:
            self.append(build_node(index, node))
        del self.nodes

    def serialize(self):
        d = super(SchemaStructureNode, self).serialize()
        d["nodes"] = []
        for n in self.children:
            d["nodes"].append(n.serialize())
        return d


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

    def serialize(self):
        d = super(SchemaContentNode, self).serialize()
        d["nodeType"] = self.__class__.__name__
        if self.required_param_keys + self.optional_param_keys:
            d["nodeParameters"] = {k: getattr(self, k) for k in self.required_param_keys + self.optional_param_keys if getattr(self, k, None) is not None}
        return d

    def append(self, node):
        raise IndexSchemaError("Can not append to ContentNode {}".format(self.key or "root"))

"""
                ------------------------------------
                 Index Schema Trees - Content Nodes
                ------------------------------------
"""

def build_commentary_node(commentor_index, ja_node):
    """
    Given a commentatory record and a content node, build a content node for this commentator on this node.
    Assumes: conent node is a Jagged_Array_node
    """
    return JaggedArrayNode(
        index=commentor_index,
        serial={},
        parameters={
            "addressTypes": ja_node.addressTypes + ["Integer"],
            "sectionNames": ja_node.sectionNames + ["Comment"],
            "depth": ja_node.depth + 1,
            "lengths": ja_node.lengths
        }
    )


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


class StringNode(SchemaContentNode):
    param_keys = []


"""
                ------------------------------------
                 Index Schema Trees - Address Types
                ------------------------------------
"""


class AddressType(object):
    section_patterns = {
        'he': None,
        'en': None
    }

    def __init__(self, order, length=None):
        self.order = order
        self.length = length

    def regex(self, lang, group_id=None, **kwargs):
        try:
            if self.section_patterns[lang]:
                strict = kwargs.get("strict", False)
                reg = self.section_patterns[lang]
                if strict == False:
                    reg += u"?"
                reg += self._core_regex(lang, group_id)
                return reg
            else:
                return self._core_regex(lang, group_id)
        except KeyError:
            raise Exception("Unknown Language passed to AddressType: {}".format(lang))

    def _core_regex(self, lang, group_id=None):
        pass

    @staticmethod
    def hebrew_number_regex():
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
        return False

    def toIndex(self, lang, s):
        pass


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
            reg += self.hebrew_number_regex() + ur"([.:]|[,\s]+[\u05d0\u05d1])?)"

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
            num = re2.split("[.:,\s]", s)[0]
            daf = decode_hebrew_numeral(num) * 2
            if s[-1] == ":" or (s[-1] == u"\u05d1" and len(s) > 2 and s[-2] in ", "):  #check for amud B
                return daf
            return daf - 1

            #if s[-1] == "." or (s[-1] == u"\u05d0" and len(s) > 2 and s[-2] in ",\s"):


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


class Index(abst.AbstractMongoRecord):
    collection = 'index'
    history_noun = 'index'
    criteria_field = 'title'
    criteria_override_field = 'oldTitle' #this is in case the priimary id attr got changed, so then this is used.
    second_save = True
    track_pkeys = True
    pkeys = ["title"]

    required_attrs = [
        "title",
        "categories",
    ]
    optional_attrs = [
        "titleVariants",   # required for old style
        "schema",            # required for new style
        "sectionNames",     # required for old style simple texts, not for commnetary
        "heTitle",          # optional for old style
        "heTitleVariants",  # optional for old style
        "maps",             # optional for old style and new
        "mapSchemes",        # optional for new style
        "order",            # optional for old style and new
        "length",           # optional for old style
        "lengths",          # optional for old style
        "transliteratedTitle"  # optional for old style
    ]

    def contents(self):
        attrs = super(Index, self).contents()
        if getattr(self, "textDepth", None):
            attrs.update({"textDepth": self.textDepth})
        return attrs

    def is_commentary(self):
        return self.categories[0] == "Commentary"

    def get_maps(self):
        """
        Returns both those maps explicitly defined on this node and those derived from a term scheme
        """
        return getattr(self, "maps", [])
        #todo: term schemes

    #todo: should this functionality be on load()?
    def load_from_dict(self, d, is_init=False):
        if "oldTitle" in d and "title" in d and d["oldTitle"] != d["title"]:
            self.load({"title": d["oldTitle"]})
            # self.titleVariants.remove(d["oldTitle"])  # let this be determined by user
        return super(Index, self).load_from_dict(d, is_init)

    def _set_derived_attributes(self):
        if getattr(self, "sectionNames", None):
            self.textDepth = len(self.sectionNames)
        if getattr(self, "schema", None):
            self.nodes = build_node(self, self.schema)

    def _normalize(self):
        self.title = self.title.strip()
        self.title = self.title[0].upper() + self.title[1:]

        if getattr(self, "nodes", None):
            self.schema = self.nodes.serialize()

        if getattr(self, "schema", None) is None:
            if not getattr(self, "titleVariants", None):
                self.titleVariants = []

            self.titleVariants = [v[0].upper() + v[1:] for v in self.titleVariants]
            # Ensure primary title is listed among title variants
            if self.title not in self.titleVariants:
                self.titleVariants.append(self.title)

        #Not sure how these string values are sneaking in here...
        if getattr(self, "heTitleVariants", None) is not None and isinstance(self.heTitleVariants, basestring):
            self.heTitleVariants = [self.heTitleVariants]

        if getattr(self, "heTitle", None) is not None:
            if getattr(self, "heTitleVariants", None) is None:
                self.heTitleVariants = [self.heTitle]
            elif self.heTitle not in self.heTitleVariants:
                self.heTitleVariants.append(self.heTitle)


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
        if getattr(self, "titleVariant", None):
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
            if Index().load({"titleVariants": nref}):
                raise InputError(u"'{}' cannot be a shorthand name: a text with this title already exisits.".format(nref))
            self.maps[i]["to"] = nref

    def _post_save(self):
        # sledgehammer cache invalidation is taken care of on save and delete events with system.cache.process_index_change_in_cache
        """
        for variant in self.titleVariants:
            for title in scache.indices.keys():
                if title.startswith(variant):
                    del scache.indices[title]
        #todo: Fix this to use new Ref cache
        for ref in scache.parsed.keys():
            if ref.startswith(self.title):
                del scache.parsed[ref]
        scache.texts_titles_cache = scache.texts_titles_json = None
        """


class IndexSet(abst.AbstractMongoSet):
    recordClass = Index


class CommentaryIndex(object):
    def __init__(self, commentor_name, book_name):
        self.c_index = Index().load({
            "titleVariants": commentor_name,
            "categories.0": "Commentary"
        })
        if not self.c_index:
            raise BookNameError(u"No commentor named '{}'.".format(commentor_name))

        self.b_index = Index().load({
            "title": book_name, # "titleVariants": book_name,
            "categories.0": {"$in": ["Tanach", "Mishnah", "Talmud", "Halakhah"]}
        })
        if not self.b_index:
            raise BookNameError(u"No book named '{}'.".format(book_name))

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
        try:
            self.sectionNames = self.b_index.sectionNames + ["Comment"]
        except AttributeError:
            self.sectionNames = self.b_index.nodes.sectionNames + ["Comment"] # ugly assumption
        self.textDepth = len(self.sectionNames)
        self.titleVariants = [self.title]
        if getattr(self.b_index, "length", None):
            self.length = self.b_index.length

    def is_commentary(self):
        return True

    def copy(self):
        #todo: this doesn't seem to be used.
        #todo: make this quicker, by utilizing copy methods of the composed objects
        return copy.deepcopy(self)

    def contents(self):
        attrs = copy.copy(vars(self))
        del attrs["c_index"]
        del attrs["b_index"]
        return attrs


def get_index(bookname):
    # look for result in indices cache
    if not bookname:
        raise BookNameError("No book provided.")

    cached_result = scache.get_index(bookname)
    if cached_result:
        return cached_result

    bookname = (bookname[0].upper() + bookname[1:]).replace("_", " ")  #todo: factor out method

    # simple Index - stopgap while model transitions
    #i = Index().load({"$or": [{"title": bookname}, {"titleVariants": bookname}, {"heTitleVariants": bookname}]})

    #todo: cache
    node = library.get_title_node(bookname)
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

    raise BookNameError(u"No book named '{}'.".format(bookname))



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
        "priority",
        "license",
        "licenseVetted",
        "method",
        "heversionSource", # bad data?
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


def process_index_title_change_in_counts(indx, **kwargs):
    count.CountSet({"title": kwargs["old"]}).update({"title": kwargs["new"]})
    if indx.is_commentary():  # and "commentaryBook" not in d:  # looks useless
        commentator_re = "^(%s) on " % kwargs["old"]
    else:
        commentators = IndexSet({"categories.0": "Commentary"}).distinct("title")
        commentator_re = r"^({}) on {}".format("|".join(commentators), kwargs["old"])
    old_titles = count.CountSet({"title": {"$regex": commentator_re}}).distinct("title")
    old_new = [(title, title.replace(kwargs["old"], kwargs["new"], 1)) for title in old_titles]
    for pair in old_new:
        count.CountSet({"title": pair[0]}).update({"title": pair[1]})


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
            self.__clean_tref_general()
            self.__init_general()
            '''
            if self._lang == "he":
                self.__clean_tref_he()
                self.__init_he()
            else:
                self.__clean_tref_en()
                self.__init_en()
            '''
        elif _obj:
            for key, value in _obj.items():
                setattr(self, key, value)
            self.__init_ref_pointer_vars()
            self.tref = self.normal()
        else:
            self.__init_ref_pointer_vars()

    def __init_ref_pointer_vars(self):
        self._normal = None
        self._url = None
        self._next = None
        self._prev = None
        self._padded = None
        self._context = {}
        self._spanned_refs = []
        self._ranged_refs = []

    """ English Constructor """

    def __clean_tref_general(self):
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
    '''
    def __clean_tref_he(self):
        #this doesn't need to except anything, I don't believe
        self.tref = self.tref.strip().replace(u"–", "-").replace("_", " ")  # don't replace : in Hebrew, where it can indicate amud

    def __clean_tref_en(self):
        try:
            self.tref = self.tref.strip().replace(u"–", "-").decode('utf-8').replace(":", ".").replace("_", " ")
        except UnicodeEncodeError, e:
            return {"error": "UnicodeEncodeError: %s" % e}
        except AttributeError, e:
            return {"error": "AttributeError: %s" % e}

        try:
            # capitalize first letter (don't title case all to avoid e.g., "Song Of Songs")
            self.tref = self.tref[0].upper() + self.tref[1:]
        except IndexError:
            pass
    '''

    def __init_general(self):
        parts = [s.strip() for s in self.tref.split("-")]
        if len(parts) > 2:
            raise InputError(u"Couldn't understand ref '{}' (too many -'s).".format(self.tref))

        base = parts[0]

        match = library.all_titles_regex(self._lang).match(base)
        if match:
            title = match.group()
            self.index_node = library.get_title_node(title, self._lang)

            if getattr(self.index_node, "checkFirst", None) and self.index_node.checkFirst.get(self._lang):
                try:
                    check_node = library.get_title_node(self.index_node.checkFirst[self._lang], self._lang)
                    re_string = '^' + regex.escape(title) + check_node.delimiter_re + check_node.regex(self._lang, strict=True)
                    reg = regex.compile(re_string, regex.VERBOSE)
                    self.sections = self.__get_sections(reg, base)
                except InputError:
                    pass
                else:
                    self.index_node = check_node

            self.index = self.index_node.index
            self.book = self.index_node.full_title("en")

        else:  # Check for a Commentator
            match = library.all_titles_regex(self._lang, with_commentary=True).match(base)
            if match:
                title = match.group()
                self.index = get_index(title)
                self.book = title
                commentee_node = library.get_title_node(match.group("commentee"))
                self.index_node = build_commentary_node(self.index, commentee_node)
                if not self.index.is_commentary():
                    raise InputError(u"Unrecognized non-commentary Index record: {}".format(base))
                if not getattr(self.index, "commentaryBook", None):
                    raise InputError(u"Please specify a text that {} comments on.".format(self.index.title))
            else:
                raise InputError(u"Unrecognized Index record: {}".format(base))

        if title == base:  # Bare book.  Seems wasted cycles for the general case.
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

    def __init_en(self):
        parts = [s.strip() for s in self.tref.split("-")]
        if len(parts) > 2:
            raise InputError(u"Couldn't understand ref '{}' (too many -'s).".format(self.tref))
        base = parts[0]

        # An initial non-numeric string and a terminal string, seperated by period, comma, space, or a combination
        ref_match = regex.match(r"(\D+)(?:[., ]+(\d.*))?$", base)
        if not ref_match:
            raise BookNameError(u"No book found in '{}'.".format(base))
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
            raise InputError(u"Please specify a text that {} comments on.".format(self.index.title))

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
                    try:
                        self.toSections[i] = int(range_part[i - delta])
                    except ValueError:
                        raise InputError(u"Couldn't understand text sections: '{}'.".format(self.tref))

        try:
           self.sections = [int(x) for x in self.sections]
           self.toSections = [int(x) for x in self.toSections]
        except ValueError:
              raise InputError(u"Couldn't understand text sections: '{}'.".format(self.tref))

        if not self.is_talmud():
            checks = [self.sections, self.toSections]
            for check in checks:
                if getattr(self.index, "length", None) and len(check):
                    if check[0] > self.index.length:
                        raise InputError(u"{} only has {} {}s.".format(self.book, self.index.length, self.index.sectionNames[0]))

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
        if not regex.match("\d+[ab]?", daf):
            raise InputError("Couldn't understand Talmud Daf reference: {}".format(daf))
        try:
            if daf[-1] in ["a", "b"]:
                amud = daf[-1]
                daf = int(daf[:-1])
            else:
                amud = "a"
                daf = int(daf)
        except ValueError:
            raise InputError(u"Couldn't parse Talmud Daf reference: {}".format(daf))

        if getattr(self.index, "length", None) and daf > self.index.length:
            raise InputError(u"{} only has {} dafs.".format(self.book, self.index.length))

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
        elif regex.match("\d+[ab]", self.toSections[0]):
            self.toSections[0] = daf_to_section(self.toSections[0])

        # 'Shabbat 24b.12-24'
        else:
            delta = len(self.sections) - len(self.toSections)
            for i in range(delta -1, -1, -1):
                self.toSections.insert(0, self.sections[i])

        self.toSections = [int(x) for x in self.toSections]

    """ Hebrew Constructor """

    def __init_he(self):
        """
        Decide what kind of reference we're looking at, then parse it to its parts
        """

        titles = library.all_titles_regex("he").findall(self.tref)

        if not titles:
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
            raise InputError(u"No support for Hebrew " + cat + u" references: " + self.tref)

        if not match:
            #logger.warning("parse_he_ref(): Can not match: %s", ref)
            raise InputError(u"Could not parse Hebrew reference: {}".format(self.tref))

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
        """.format(regex.escape(title))
        return regex.compile(exp, regex.VERBOSE)

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
        """.format(regex.escape(title))
        return regex.compile(exp, regex.VERBOSE)

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
        """.format(regex.escape(title))
        return regex.compile(exp, regex.VERBOSE)

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
        """.format(regex.escape(title))
        return regex.compile(exp, regex.VERBOSE)

    def __eq__(self, other):
        return self.normal() == other.normal()

    def __ne__(self, other):
        return not self.__eq__(other)

    def is_talmud(self):
        return self.type == "Talmud" or (self.type == "Commentary" and getattr(self.index, "commentaryCategories", None) and self.index.commentaryCategories[0] == "Talmud")

    def is_range(self):
        return self.sections != self.toSections

    def is_spanning(self):
        """
        Returns True if the Ref spans across text sections.
        Shabbat 13a-b - True, Shabbat 13a:3-14 - False
        Job 4:3-5:3 - True, Job 4:5-18 - False
        """
        if self.index_node.depth == 1:
            # text of depth 1 can't be spanning
            return False

        if len(self.sections) == 0:
            # can't be spanning if no sections set
            return False

        if len(self.sections) <= self.index_node.depth - 2:
            point = len(self.sections) - 1
        else:
            point = self.index_node.depth - 2

        if self.sections[point] == self.toSections[point]:
            return False

        return True

    def is_section_level(self):
        return len(self.sections) == self.index_node.depth - 1

    def is_segment_level(self):
        return len(self.sections) == self.index_node.depth

    '''
    generality()
    '''

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

    #Don't store results on Ref cache - count objects change, and don't yet propogate to this Cache
    def get_count(self):
        return count.Count().load({"title": self.book})

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

        #let the counts obj calculate the correct place to go.
        c = self.get_count()
        if not c:
            return None
        new_section = c.next_address(starting_points) if forward else c.prev_address(starting_points)

        # we are also scaling back the sections to the level ABOVE the lowest section type (eg, for bible we want chapter, not verse)
        if new_section:
            d = self._core_dict()
            d["toSections"] = d["sections"] = [(s + 1) for s in new_section[:-depth_up]]
            return Ref(_obj=d)
        else:
            return None

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
        if self.index_node.depth == 1 or not self.is_spanning():
            return [self]

        if not self._spanned_refs:
            start, end = self.sections[self.index_node.depth - 2], self.toSections[self.index_node.depth - 2]

            refs = []

            # build a Ref for each new ref

            for n in range(start, end + 1):
                d = self._core_dict()
                if n == start and len(self.sections) == self.index_node.depth: #Add specificity to first ref
                    d["sections"] = self.sections[:]
                    d["toSections"] = self.sections[0:self.index_node.depth]
                    d["toSections"][-1] = self.get_count().section_length(n)
                elif n == end and len(self.sections) == self.index_node.depth: #Add specificity to last ref
                    #This check works, but do we allow refs to not-yet-existence segments?
                    #if self._get_count().section_length(n) < self.toSections[-1]:
                    #    raise InputError("{} {} {} has only {} {}s".format(self.book, self.index.sectionNames[self.index_node.depth - 2], n, self._get_count().section_length(n), self.index.sectionNames[self.index_node.depth - 1]))
                    d["sections"] = self.sections[0:self.index_node.depth - 1]
                    d["sections"][-1] = n
                    d["sections"] += [1]
                    d["toSections"] = d["sections"][:]
                    d["toSections"][-1] = self.toSections[-1]
                else:
                    d["sections"] = self.sections[0:self.index_node.depth - 1]
                    d["sections"][-1] = n
                    d["toSections"] = d["sections"]
                refs.append(Ref(_obj=d))
            self._spanned_refs = refs

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
            sections = regex.sub("^%s" % self.book, '', r)
            patterns.append("%s$" % sections)   # exact match
            patterns.append("%s:" % sections)   # more granualar, exact match followed by :
            patterns.append("%s \d" % sections) # extra granularity following space

        return "^%s(%s)" % (self.book, "|".join(patterns))

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
            "type": self.type,
            # Moved to views.reader and views.texts_api
            #"next": next.normal() if next else None,
            #"prev": prev.normal() if prev else None,
        }
        d.update(self.index.contents())
        del d["title"]
        return d

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
#todo: handle cache invalidation

    def all_titles_regex(self, lang, with_commentary=False):
        key = "all_titles_regex_" + lang
        key += "_commentary" if with_commentary else ""
        reg = scache.get_cache_elem(key)
        if not reg:
            escaped = map(regex.escape, self.full_title_list(lang))  # Re2's escape() bugs out on this
            reg = '|'.join(sorted(escaped, key=len, reverse=True))  # Match longer titles first
            if with_commentary:
                if lang == "he":
                    raise InputError("No support for Hebrew Commentatory Ref Objects")
                first_part = '|'.join(map(regex.escape, self.get_commentator_titles()))
                reg = u"^(?P<commentor>" + first_part + u") on (?P<commentee>" + reg + u")"
            reg = re2.compile(reg)
            scache.set_cache_elem(key, reg)
        return reg

    def full_title_list(self, lang):
        """ Returns a list of strings of all possible titles, including maps """
        key = "full_title_list_" + lang
        titles = scache.get_cache_elem(key)
        if not titles:
            titles = self.get_title_node_dict(lang).keys()
            titles.append(self.get_map_dict().keys())
            scache.set_cache_elem(key, titles)
        return titles

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

    def get_index_forest(self, titleBased = False):
        """
        Returns a list of nodes.
        :param titleBased: If true, texts with presentation 'alone' are passed as root level nodes
        """
        root_nodes = []
        for i in IndexSet():
            if i.is_commentary():
                continue
            root_nodes.append(i.nodes)

        if titleBased:
            #todo: handle 'alone' nodes
            pass

        return root_nodes

    def get_title_node_dict(self, lang):
        """
        Returns a dictionary of string titles and the nodes that they point to.
        This does not include any map names.
        """
        key = "title_node_dict_" + lang
        title_dict = scache.get_cache_elem(key)
        if not title_dict:
            title_dict = {}
            trees = self.get_index_forest(titleBased=True)
            for tree in trees:
                title_dict.update(self._branch_title_node_dict(tree, lang))
            scache.set_cache_elem(key,title_dict)
        return title_dict

    def _branch_title_node_dict(self, node, lang, baselist=[]):
        """
        Recursive function that generates a map from title to node
        :param node: the node to start from
        :param lang:
        :param baselist: list of starting strings that lead to this node
        :return: map from title to node
        """
        title_dict = {}
        thisnode = node

        #this happens on the node
        #if node.hasTitleScheme():
        #        this_node_titles = node.getSchemeTitles(lang)
        #else:

        this_node_titles = [title["text"] for title in node.titles if title["lang"] == lang and title.get("presentation") != "alone"]
        if baselist:
            node_title_list = [baseName + " " + title for baseName in baselist for title in this_node_titles]
        else:
            node_title_list = this_node_titles

        if node.has_children():
            for child in node.children:
                if child.is_default():
                    thisnode = child
                if not child.is_only_alone():
                    title_dict.update(self._branch_title_node_dict(child, lang, node_title_list))

        for title in node_title_list:
            title_dict[title] = thisnode

        return title_dict

    def get_title_node(self, title, lang=None):
        if not lang:
            lang = "he" if is_hebrew(title) else "en"
        return self.get_title_node_dict(lang).get(title)

    def get_text_titles(self, query={}, lang="en"):
        """
        Returns a list of text titles in either English or Hebrew.
        Includes title variants and shorthands  / maps.
        Optionally filter for texts matching 'query'.
        """
        if lang == "en":
            return self.get_en_text_titles(query)
        elif lang == "he":
            return self.get_he_text_titles(query)
        #else:
        #	logger.error("get_text_titles: Unsupported Language: %s", lang)

    #todo: rewrite to use new schema
    def get_en_text_titles(self, query={}):
        """
        Return a list of all known text titles in English, including title variants and shorthands/maps.
        Optionally take a query to limit results.
        Cache the full list which is used on every page (for nav autocomplete)
        """
        if query or not scache.get_cache_elem('texts_titles_cache'):
            indexes = IndexSet(query)
            titles = indexes.distinct("titleVariants") + indexes.distinct("maps.from")

            if query:
                return titles

            scache.set_cache_elem('texts_titles_cache', titles)

        return scache.get_cache_elem('texts_titles_cache')

    #todo: rewrite to use new schema
    def get_he_text_titles(self, query={}):
        """
        Return a list of all known text titles in Hebrew, including title variants.
        Optionally take a query to limit results.
        Cache the full list which is used on every page (for nav autocomplete)
        """
        if query or not scache.get_cache_elem('he_texts_titles_cache'):
            titles = IndexSet(query).distinct("heTitleVariants")

            if query:
                return titles

            scache.set_cache_elem('he_texts_titles_cache', titles)

        return scache.get_cache_elem('he_texts_titles_cache')


    def get_text_titles_json(self):
        """
        Returns JSON of full texts list, keeps cached
        """
        if not scache.get_cache_elem('texts_titles_json'):
            scache.set_cache_elem('texts_titles_json', json.dumps(self.get_text_titles()))

        return scache.get_cache_elem('texts_titles_json')

    def get_text_categories(self):
        """
        Returns a list of all known text categories.
        """
        return IndexSet().distinct("categories")

    def get_commentator_titles(self):
        return IndexSet({"categories.0": "Commentary"}).distinct("title")

    def get_commentary_version_titles(self, commentators=None):
        """
        Returns a list of text titles that exist in the DB which are commentaries.
        """
        return self.get_commentary_versions(commentators).distinct("title")

    def get_commentary_versions(self, commentators=None):
        """ Returns a VersionSet of commentary texts
        """
        if isinstance(commentators, basestring):
            commentators = [commentators]
        if not commentators:
            commentators = self.get_commentator_titles()
        commentary_re = "^({}) on ".format("|".join(commentators))
        return VersionSet({"title": {"$regex": commentary_re}})

    def get_commentary_versions_on_book(self, book=None):
        """ Return VersionSet of versions that comment on 'book' """
        assert book
        commentators = self.get_commentator_titles()
        commentary_re = r"^({}) on {}".format("|".join(commentators), book)
        return VersionSet({"title": {"$regex": commentary_re}})

    def get_commentary_version_titles_on_book(self, book):
        return self.get_commentary_versions_on_book(book).distinct("title")

    def get_refs_in_string(self, st):
        """
        Returns an array of Ref objects derived from string
        :param st:
        :return:
        """
        refs = []
        if is_hebrew(st):
            lang = "he"
            unique_titles = {title: 1 for title in self.all_titles_regex(lang).findall(st)}
            for title in unique_titles.iterkeys():
                res = self.generate_all_refs(title, st)
                refs += res
        else:
            lang = "en"
            for match in self.all_titles_regex(lang).finditer(st):
                title = match.group()
                res = self.generate_ref(title, st[match.start():])  # Slice string from title start
                refs += res
        return refs

    def generate_ref(self, title=None, st=None, lang="en"):
        """
        Build a Ref object given a title and a string.  The title is assumed to be at position 0 in the string.
        :param title: The title used in the text to refer to this Index node
        :param st: The source text for this reference
        :return: Ref
        """
        node = self.get_title_node(title, lang)

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
                "index": node.index,
                "type": node.index.categories[0],
                "sections": sections,
                "toSections": sections
            }
            return [Ref(_obj=_obj)]
        else:
            return []

    def generate_all_refs(self, title=None, st=None, lang="he"):
        """
        Build all Ref objects for title found in string.  By default, only match what is found between braces (as in Hebrew)
        :param title: The title used in the text to refer to this Index node
        :param st: The source text for this reference
        :return: list of Refs
        """
        node = self.get_title_node(title, lang)

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
        node.regex(lang)
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
                "index": node.index,
                "type": node.index.categories[0],
                "sections": sections,
                "toSections": sections
            }
            refs.append(Ref(_obj=_obj))
        return refs

library = Library()