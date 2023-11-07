"""
version_state.py
Writes to MongoDB Collection:
"""
import structlog
from functools import reduce


logger = structlog.get_logger(__name__)

from . import abstract as abst
from . import text
from . import link
from .text import VersionSet, AbstractIndex, AbstractSchemaContent, IndexSet, library, Ref
from sefaria.datatype.jagged_array import JaggedTextArray, JaggedIntArray
from sefaria.system.exceptions import InputError, BookNameError
from sefaria.system.cache import delete_template_cache
try:
    from sefaria.settings import USE_VARNISH
except ImportError:
    USE_VARNISH = False
'''
'''


class VersionState(abst.AbstractMongoRecord, AbstractSchemaContent):
    """
    This model overrides default init/load/save behavior, since there is one and only one VersionState record for each Index record.

    The `content` attribute is a dictionary which is the root of a tree, mirroring the shape of a Version, where the leaf nodes of the tree are dictionaries with a shape like the following:
        {
            "_en": {
                "availableTexts":  Mask of what texts are available in this language.  Boolean values (0 or 1) in the shape of the JaggedArray
                "availableCounts":  Array, with length == depth of the node.  Each element is the number of available elements at that depth.  e.g [chapters, verses]
                "percentAvailable":  Percent of this text available in this language TODO: Only used on the dashboard. Remove?
                'percentAvailableInvalid':  Boolean. Whether the value of "percentAvailable" can be trusted.  TODO: Only used on the dashboard. Remove?
                "textComplete":  Boolean. Whether the text is complete in this language. TODO: Not used outside of this file. Should be removed.
                'completenessPercent':  Percent of this text complete in this language TODO: Not used outside of this file. Should be removed.
                'sparseness': Legacy - present on some records, but no longer in code TODO: remove
            }
            "_he": {...} # same keys as _en
            "_all" {
                "availableTexts": Mask what texts are available in this text overall.  Boolean values (0 or 1) in the shape of the JaggedArray
                "shape":
                    For depth 1: Integer -length
                    For depth 2: List of section lengths
                    For depth 3: List of list of section lengths
            }
        }

    For example:
    - the `content` attribute for a simple text like `Genesis` will be a dictionary with keys "_en", "_he", and "_all", as above.
    - the `content` attribute for `Pesach Haggadah` will be a dictionary with keys: "Kadesh", "Urchatz", "Karpas" ... each with a value of a dictionary like the above.
        The key "Magid" has a value of a dictionary, where each key is a different sub-section of Magid.
        The value for each key is a dictionary as detailed above, specific to each sub-section.
        So for example, one key will be "Ha Lachma Anya" and the value will be a dictionary, like the above, specific to the details of "Ha Lachma Anya".

    Every JaggedArrayNode has a corresponding vstate dictionary. So for complex texts, each leaf node (and leaf nodes by definition must be JaggedArrayNodes) has this corresponding dictionary.
    """
    collection = 'vstate'

    required_attrs = [
        "title",  # Index title
        "content"  # tree of data about nodes.  See above.
    ]
    optional_attrs = [
        "flags",  # "heComplete" : Bool, "enComplete" : Bool
        "linksCount",  # Integer
        "first_section_ref"  # Normal text Ref
    ]

    langs = ["en", "he"]
    lang_map = {lang: "_" + lang for lang in langs}
    lang_keys = list(lang_map.values())

    def __init__(self, index=None, attrs=None, proj=None):
        """
        :param index: Index record or name of Index
        :type index: text.Index|string
        :return:
        """
        super(VersionState, self).__init__(attrs)

        if not index:  # so that basic model tests can run
            if getattr(self, "title", None):
                try:
                    self.index = library.get_index(self.title)
                except BookNameError as e:
                    logger.warning("Failed to load Index for VersionState - {}: {} (Normal on Index name change)".format(self.title, e))
            return

        if not isinstance(index, AbstractIndex):
            try:
                index = library.get_index(index)
            except BookNameError as e:
                logger.warning("Failed to load Index for VersionState {}: {}".format(index, e))
                raise

        self.index = index
        self._versions = {}
        self.is_new_state = False

        if not self.load({"title": index.title}, proj=proj):
            if not getattr(self, "flags", None):  # allow flags to be set in initial attrs
                self.flags = {}
            self.content = self.index.nodes.create_content(lambda n: {})
            self.title = index.title
            self.refresh()
            self.is_new_state = True  # variable naming: don't override 'is_new' - a method of the superclass

    def contents(self, **kwargs):
        c = super(VersionState, self).contents()
        c.update(self.index.contents())
        return c

    def _load_versions(self):
        for lang in self.langs:
            self._versions[lang] = [v for v in VersionSet({"title": self.index.title, "language": lang})]

    def versions(self, lang):
        if not self._versions.get(lang):
            self._load_versions()
        return self._versions.get(lang)

    def _first_section_ref(self):
        if not getattr(self, "index", False):
            return None

        current_leaf = self.index.nodes.first_leaf()
        new_section = None

        while current_leaf:
            if not current_leaf.is_virtual:    # todo: handle first entries of virtual nodes
                r = current_leaf.ref()
                c = self.state_node(current_leaf).ja("all")
                new_section = c.next_index([])
                if new_section:
                    break
            current_leaf = current_leaf.next_leaf()

        if not new_section:
            return None

        depth_up = 0 if current_leaf.depth == 1 else 1

        d = r._core_dict()
        d["toSections"] = d["sections"] = [(s + 1) for s in new_section[:-depth_up]]
        return Ref(_obj=d)

    def refresh(self):
        if self.is_new_state:  # refresh done on init
            return
        self.content = self.index.nodes.visit_content(self._content_node_visitor, self.content)
        self.index.nodes.visit_structure(self._aggregate_structure_state, self)
        self.linksCount = link.LinkSet(Ref(self.index.title)).count()
        fsr = self._first_section_ref()
        self.first_section_ref = fsr.normal() if fsr else None
        self.save()

        if USE_VARNISH:
            from sefaria.system.varnish.wrapper import invalidate_counts
            invalidate_counts(self.index)

    def get_flag(self, flag):
        return self.flags.get(flag, False) # consider all flags False until set True
        
    def set_flag(self, flag, value):
        self.flags[flag] = value  # could use mongo level $set to avoid doc load, for speedup
        delete_template_cache("texts_dashboard")
        return self

    def state_node(self, snode):
        sn = StateNode(_obj=self.content_node(snode))
        sn.snode = snode
        sn.versionState = self
        return sn

    def _aggregate_structure_state(self, snode, contents, **kwargs):
        """
        :param snode: SchemaStructureNode
        :param contents: A subtree of a VersionState tree, to be modified in place
        :param kwargs:
        :return:
        """
        #This does not account for relative importance/size of children
        #todo: revisit this algorithm when there are texts in the system.

        ckeys = [child.key for child in snode.concrete_children()]
        for lkey in self.lang_keys:
            contents[lkey] = {
                "percentAvailable": sum([contents[ckey][lkey]["percentAvailable"] for ckey in ckeys]) / len(ckeys),
                "textComplete": all([contents[ckey][lkey]["textComplete"] for ckey in ckeys]),
                'completenessPercent': sum([contents[ckey][lkey]["completenessPercent"] for ckey in ckeys]) / len(ckeys),
                'percentAvailableInvalid': any([contents[ckey][lkey]["percentAvailableInvalid"] for ckey in ckeys]),
            }

    #todo: do we want to use an object here?
    def _content_node_visitor(self, snode, *contents, **kwargs):
        """
        :param snode: SchemaContentNode
        :param contents: Array of one node - the self.counts node
        :param kwargs:
        :return:
        """
        assert len(contents) == 1
        current = contents[0]  # some information is manually set - don't wipe and re-create it.   todo: just copy flags?
        depth = snode.depth  # This also acts as an assertion that we have a SchemaContentNode
        ja = {}  # JaggedIntArrays for each language and 'all'
        padded_ja = {}  # Padded JaggedIntArrays for each language

        # Get base counts for each language
        for lang, lkey in list(self.lang_map.items()):
            if not current.get(lkey):
                current[lkey] = {}

            ja[lkey] = self._node_count(snode, lang)

        # Sum all of the languages
        ja['_all'] = reduce(lambda x, y: x + y, [ja[lkey] for lkey in self.lang_keys])
        zero_mask = ja['_all'].zero_mask()
        current["_all"] = {
            "availableTexts": ja['_all'].array(),
            "shape": ja['_all'].shape()
        }
        # Get derived data for all languages
        for lang, lkey in list(self.lang_map.items()):
            # build zero-padded count ("availableTexts")
            padded_ja[lkey] = ja[lkey] + zero_mask
            current[lkey]["availableTexts"] = padded_ja[lkey].array()

            # number of units at each level ("availableCounts") from raw counts
            # depth_sum() reduces anything greater than 1 to 1,
            # so that the count returned is an accurate measure of how much material is there
            current[lkey]["availableCounts"] = [ja[lkey].depth_sum(d) for d in range(depth)]

            # Percent of text available, versus its metadata count ("percentAvailable")
            # and if it's a valid measure ('percentAvailableInvalid')
            if getattr(snode, "lengths", None):
                if len(snode.lengths) == depth:
                    langtotal = reduce(lambda x, y: x + y, current[lkey]["availableCounts"])
                    schematotal = reduce(lambda x, y: x + y, snode.lengths)
                    try:
                        current[lkey]["percentAvailable"] = langtotal / float(schematotal) * 100
                    except ZeroDivisionError:
                        current[lkey]["percentAvailable"] = 0
                elif len(snode.lengths) < depth:
                    current[lkey]["percentAvailable"] = current[lkey]["availableCounts"][0] / float(snode.lengths[0]) * 100
                else:
                    raise Exception("Text has less sections than node.lengths for {}".format(snode.full_title()))
                current[lkey]['percentAvailableInvalid'] = current[lkey]["percentAvailable"] > 100
            else:
                current[lkey]["percentAvailable"] = 0
                current[lkey]['percentAvailableInvalid'] = True

            # Is this text complete? ("textComplete")
            current[lkey]["textComplete"] = current[lkey]["percentAvailable"] > 99.9

            # What percent complete? ('completenessPercent')
            # are we doing this with the zero-padded array on purpose?
            current[lkey]['completenessPercent'] = self._calc_text_structure_completeness(depth, current[lkey]["availableTexts"])

        return current

    def _node_count(self, snode, lang="en"):
        """
        Count available versions of a text in the db, segment by segment.
        :return counts:
        :type return: JaggedIntArray
        """
        counts = JaggedIntArray()

        versions = self.versions(lang)
        for version in versions:
            raw_text_ja = version.content_node(snode)
            ja = JaggedTextArray(raw_text_ja)
            mask = ja.mask()
            counts = counts + mask

        return counts


    @classmethod
    def _calc_text_structure_completeness(cls, text_depth, structure):
        """
        This function calculates the percentage of how full an array is compared to it's structre
        i.e how many elements are not null or zero
        :param text_depth: the depth of the array
        :param structure: a counts structure from count_texts()
        :return: a precentage of the array fullness
        """
        result = {'full': 0, 'total':0}
        cls._rec_calc_text_structure_completeness(text_depth, structure, result)
        return float(result['full']) / result['total'] * 100

    @classmethod
    def _rec_calc_text_structure_completeness(cls, depth, text, result):
        """
        Recursive sub-utility function of the above function. Carries out the actual calculation recursively.
        :param depth: the depth of the current structure
        :param text: the structure to count
        :param result: the result obj to update
        :return: the result obj
        """
        if isinstance(text, list):
            #empty array
            if not text:
                #an empty array element may represent a lot of missing text
                #TODO: maybe find a better estimate (average of text lengths at a certain depth?)
                result['total'] += 3**depth
            else:
                for t in text:
                    cls._rec_calc_text_structure_completeness(depth - 1, t, result)
        else:
            result['total'] += 1
            if text is not None and text != "" and text > 0:
                result['full'] += 1


class VersionStateSet(abst.AbstractMongoSet):
    recordClass = VersionState


class StateNode(object):
    lang_map = {lang: "_" + lang for lang in ["he", "en", "all"]}
    lang_keys = list(lang_map.values())
    meta_proj = {'content._all.completenessPercent': 1,
         'content._all.percentAvailable': 1,
         'content._all.percentAvailableInvalid': 1,
         'content._all.textComplete': 1,
         'content._en.completenessPercent': 1,
         'content._en.percentAvailable': 1,
         'content._en.percentAvailableInvalid': 1,
         'content._en.textComplete': 1,
         'content._he.completenessPercent': 1,
         'content._he.percentAvailable': 1,
         'content._he.percentAvailableInvalid': 1,
         'content._he.textComplete': 1,
         'flags': 1,
         'linksCount': 1,
         'title': 1,
         'first_section_ref': 1}
    #todo: self.snode could be a SchemaNode, but get_available_counts_dict() assumes JaggedArrayNode
    def __init__(self, title=None, snode=None, _obj=None, meta=False, hint=None):
        """
        :param title:
        :param snode:
        :param _obj:
        :param meta: If true, returns only the overview information, and not the detailed counts
        :param hint: hint - a list of (lang, key) tuples of pieces of VersionState to return
        :return:
        """
        if title:
            snode = library.get_schema_node(title)
            if not snode:
                snode = library.get_schema_node(title)
            if not snode:
                raise InputError("Can not resolve name: {}".format(title))
            if snode.is_default():
                snode = snode.parent
        if snode:
            proj = None
            if meta:
                if snode.parent:
                    raise Exception("StateNode.meta() only supported for Index roots.  Called with {} / {}".format(title, snode.primary_title("en")))
                proj = self.meta_proj
            if hint:
                hint_proj = {}
                base = [VersionState.content_attr] + snode.version_address()
                for l, k in hint:
                    hint_proj[".".join(base + [self.lang_map[l]] + [k])] = 1
                if proj:
                    proj.update(hint_proj)
                else:
                    proj = hint_proj
            self.snode = snode
            self.versionState = VersionState(snode.index.title, proj=proj)
            self.d = self.versionState.content_node(snode)
        elif _obj:
            self.d = _obj

    def get_percent_available(self, lang):
        return self.var(lang, "percentAvailable")

    def get_available_counts(self, lang):
        return self.var(lang, "availableCounts")

    def get_flag(self, flag):
        return self.versionState.get_flag(flag)

    def get_available_counts_dict(self, lang):
        """
        return a dictionary
        which zips together section names and available counts.
        """
        d = {}
        for i in range(self.snode.depth):
            d.update(
                self.snode.address_class(i).format_count(
                    self.snode.sectionNames[i],
                    self.get_available_counts(lang)[i]
                )
            )
        return d

    def var(self, lang, key):
        try:
            return self.d[self.lang_map[lang]][key]
        except Exception as e:
            raise e.__class__("Failed in StateNode.var(), in node: {}, language: {}, key: {}".format(self.snode.primary_title("en"), lang, key))

    def ja(self, lang, key="availableTexts"):
        """
        :param lang: "he", "en", or "all"
        :param addr:
        :return:
        """
        return JaggedIntArray(self.var(lang, key))

    def contents(self):
        #mix in Index?
        return self.d


    def get_untranslated_count_by_unit(self, unit):
        """
        Returns the (approximate) number of untranslated units of text

        Counts are approximate because they do not adjust for an English section
        that may have no corresponding Hebrew.
        """
        he = self.get_available_counts_dict("he")
        en = self.get_available_counts_dict("en")

        return he[unit] - en[unit]


    def get_translated_count_by_unit(self, unit):
        """
        Return the (approximate) number of translated units in text,

        Counts are approximate because they do not adjust for an English section
        that may have no corresponding Hebrew.
        """
        en = self.get_available_counts_dict("en")

        return en[unit]


def refresh_all_states():
    indices = IndexSet()

    for index in indices:
        logger.debug("Rebuilding state for {}".format(index.title))
        try:
            VersionState(index).refresh()
        except Exception as e:
            logger.warning("Got exception rebuilding state for {}: {}".format(index.title, e))

    library.rebuild_toc()


def process_index_delete_in_version_state(indx, **kwargs):
    from sefaria.system.database import db
    db.vstate.delete_one({"title": indx.title})

def process_index_title_change_in_version_state(indx, **kwargs):
    VersionStateSet({"title": kwargs["old"]}).update({"title": kwargs["new"]})


def create_version_state_on_index_creation(indx, **kwargs):
    vs = VersionState(indx.title)
    if vs.is_new_state:
        vs.save()
