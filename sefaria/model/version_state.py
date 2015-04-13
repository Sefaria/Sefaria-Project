"""
version_state.py
Writes to MongoDB Collection:
"""
import logging


logger = logging.getLogger(__name__)

from . import abstract as abst
from . import text
from . import link
from text import VersionSet, AbstractIndex, AbstractSchemaContent, IndexSet, library, get_index, Ref
from sefaria.datatype.jagged_array import JaggedTextArray, JaggedIntArray
from sefaria.system.exceptions import InputError, BookNameError
from sefaria.system.cache import delete_template_cache

'''
old count docs were:
    c["allVersionCounts"]
    c["availableTexts"] = {
        "en":
        "he":
    }

    c["availableCounts"] = {   #
        "en":
        "he":
    }

    c["percentAvailable"] = {
        "he":
        "en":
    }

    c["textComplete"] = {
        "he":
        "en"
    }

    c['estimatedCompleteness'] = {
        "he": {
            'estimatedPercent':
            'availableSegmentCount':   # is availableCounts[-1]
            'percentAvailableInvalid':
            'percentAvailable':        # duplicate
            'isSparse':
        }
        "en":
    }


and now self.content is:
    {
        "_en": {
            "availableTexts":
            "availableCounts":
            "percentAvailable":
            "textComplete":
            'completenessPercent':
            'percentAvailableInvalid':
            'sparseness':  # was isSparse
        }
        "_he": ...
        "_all" {
            "availableTexts":
        }
    }

'''


class VersionState(abst.AbstractMongoRecord, AbstractSchemaContent):
    """
    This model overrides default init/load/save behavior, since there is one and only one VersionState record for each Index record.
    """
    collection = 'vstate'

    required_attrs = [
        "title",  # Index title
        "content"  # tree of data about nodes
    ]
    optional_attrs = [
        "flags",
        "linksCount"
        #"categories",
    ]

    langs = ["en", "he"]
    lang_map = {lang: "_" + lang for lang in langs}
    lang_keys = lang_map.values()

    def __init__(self, index=None, attrs=None):
        """
        :param index: Index record or name of Index
        :type index: text.Index|text.CommentaryIndex|string
        :return:
        """
        super(VersionState, self).__init__(attrs)

        if not index:  # so that basic model tests can run
            if getattr(self, "title", None):
                try:
                    self.index = get_index(self.title)
                except BookNameError as e:
                    logger.warning(u"Failed to load Index for VersionState - {}: {} (Normal on Index name change)".format(self.title, e))
            return

        if not isinstance(index, AbstractIndex):
            try:
                index = get_index(index)
            except BookNameError as e:
                logger.warning("Failed to load Index for VersionState {}: {}".format(index, e))

        self.index = index
        self._versions = {}
        self.is_new_state = False

        if not self.load({"title": index.title}):
            self.content = self.index.nodes.create_content(lambda n: {})
            self.title = index.title
            self.flags = {}
            self.refresh()
            self.is_new_state = True  # variable naming: don't override 'is_new' - a method of the superclass

    def contents(self):
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

    def refresh(self):
        if self.is_new_state:  # refresh done on init
            return
        self.content = self.index.nodes.visit_content(self._content_node_visitor, self.content)
        self.index.nodes.visit_structure(self._aggregate_structure_state, self)
        self.linksCount = link.LinkSet(Ref(self.index.title)).count()
        self.save()

    def get_flag(self, flag):
        return self.flags.get(flag, None)

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

        ckeys = [child.key for child in snode.children]
        for lkey in self.lang_keys:
            contents[lkey] = {
                "percentAvailable": sum([contents[ckey][lkey]["percentAvailable"] for ckey in ckeys]) / len(ckeys),
                "textComplete": all([contents[ckey][lkey]["textComplete"] for ckey in ckeys]),
                'completenessPercent': sum([contents[ckey][lkey]["completenessPercent"] for ckey in ckeys]) / len(ckeys),
                'percentAvailableInvalid': any([contents[ckey][lkey]["percentAvailableInvalid"] for ckey in ckeys]),
                'sparseness': sum([contents[ckey][lkey]["sparseness"] for ckey in ckeys]) / len(ckeys),  # should be an int.  In Python 3 may need to int(round()) the result.
            }


    #todo: do we want to use an object here?
    def _content_node_visitor(self, snode, *contents, **kwargs):
        """
        :param snode: SchemaContentNode
        :param contents: Array of two nodes - the current self.nodes node, and the self.counts node
        :param kwargs:
        :return:
        """
        assert len(contents) == 1
        current = contents[0]  # some information is manually set - don't wipe and re-create it.   todo: just copy flags?
        depth = snode.depth  # This also acts as an assertion that we have a SchemaContentNode
        ja = {}  # JaggedIntArrays for each language and 'all'
        padded_ja = {}  # Padded JaggedIntArrays for each language


        # Get base counts for each language
        for lang, lkey in self.lang_map.items():
            if not current.get(lkey):
                current[lkey] = {}

            ja[lkey] = self._node_count(snode, lang)

        # Sum all of the languages
        ja['_all'] = reduce(lambda x, y: x + y, [ja[lkey] for lkey in self.lang_keys])
        zero_mask = ja['_all'].zero_mask()
        current["_all"] = {"availableTexts": ja['_all'].array()}

        # Get derived data for all languages
        for lang, lkey in self.lang_map.items():
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

            # a rating integer (from 1-4) of how sparse the text is. 1 being most sparse and 4 considered basically ok.
            # ('sparseness') was ('isSparse')
            if current[lkey]['percentAvailableInvalid']:
                percentCalc = current[lkey]['completenessPercent']
            else:
                percentCalc = current[lkey]['percentAvailable']

            lang_flag = "%sComplete" % lang
            if getattr(self, "flags", None) and self.flags.get(lang_flag, False):  # if manually marked as complete, consider it complete
                current[lkey]['sparseness'] = 4

            # If it's a commentary, it might have many empty places, so just consider bulk amount of text
            elif (snode.index.is_commentary()
                  and len(current[lkey]["availableCounts"])
                  and current[lkey]["availableCounts"][-1] >= 300):
                current[lkey]['sparseness'] = 2

            # If it's basic count is under a given constant (e.g. 25) consider sparse.
            # This will casues issues with some small texts.  We fix this with manual flags.
            elif len(current[lkey]["availableCounts"]) and current[lkey]["availableCounts"][-1] <= 25:
                current[lkey]['sparseness'] = 1

            elif percentCalc <= 15:
                current[lkey]['sparseness'] = 1
            elif 15 < percentCalc <= 50:
                current[lkey]['sparseness'] = 2
            elif 50 < percentCalc <= 90:
                current[lkey]['sparseness'] = 3
            else:
                current[lkey]['sparseness'] = 4

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

    def all_refs(self):
        refs = []
        for vs in self:
            try:
                content_nodes = vs.index.nodes.get_leaf_nodes()
            except Exception as e:
                logger.warning(u"Failed to find VersionState Index while generating references for {}. {}".format(vs.title, e.message))
                continue
            for c in content_nodes:
                try:
                    state_ja = vs.state_node(c).ja("all")
                    for indxs in state_ja.non_empty_sections():
                        sections = [a + 1 for a in indxs]
                        refs += [Ref(
                            _obj={
                                "index": vs.index,
                                "book": vs.index.nodes.full_title("en"),
                                "type": vs.index.categories[0],
                                "index_node": c,
                                "sections": sections,
                                "toSections": sections
                            }
                        )]
                except Exception as e:
                    logger.warning(u"Failed to generate references for {}. {}".format(c.full_title("en"), e.message))
        return refs


class StateNode(object):
    lang_map = {lang: "_" + lang for lang in ["he", "en", "all"]}
    lang_keys = lang_map.values()

    def __init__(self, title=None, snode=None, _obj=None):
        if title:
            snode = library.get_schema_node(title)
            if not snode:
                snode = library.get_schema_node(title, with_commentary=True)
            if not snode:
                raise InputError(u"Can not resolve name: {}".format(title))
            self.snode = snode
            self.versionState = VersionState(snode.index.title)
            self.d = self.versionState.content_node(snode)
        elif snode:
            self.snode = snode
            self.versionState = VersionState(snode.index.title)
            self.d = self.versionState.content_node(snode)
        elif _obj:
            self.d = _obj

    def get_percent_available(self, lang):
        return self.var(lang, "percentAvailable")

    def get_sparseness(self, lang):
        return self.var(lang, "sparseness")

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
        return self.d[self.lang_map[lang]][key]

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
        logger.debug(u"Rebuilding state for {}".format(index.title))
        try:
            if index.is_commentary():
                c_re = "^{} on ".format(index.title)
                texts = VersionSet({"title": {"$regex": c_re}}).distinct("title")
                for text in texts:
                    VersionState(text).refresh()
            else:
                VersionState(index).refresh()
        except Exception as e:
            logger.warning(u"Got exception rebuilding state for {}: {}".format(index.title, e))
            

    import sefaria.summaries as summaries
    summaries.update_summaries()


def process_index_delete_in_version_state(indx, **kwargs):
    from sefaria.system.database import db
    db.vstate.remove({"title": indx.title})


def process_index_title_change_in_version_state(indx, **kwargs):

    VersionStateSet({"title": kwargs["old"]}).update({"title": kwargs["new"]})
    if indx.is_commentary():  # and "commentaryBook" not in d:  # looks useless
        commentator_re = "^(%s) on " % kwargs["old"]
    else:
        commentators = IndexSet({"categories.0": "Commentary"}).distinct("title")
        commentator_re = r"^({}) on {}".format("|".join(commentators), kwargs["old"])
    old_titles = VersionStateSet({"title": {"$regex": commentator_re}}).distinct("title")
    old_new = [(title, title.replace(kwargs["old"], kwargs["new"], 1)) for title in old_titles]
    for pair in old_new:
        VersionStateSet({"title": pair[0]}).update({"title": pair[1]})


def create_version_state_on_index_creation(indx, **kwargs):
    if indx.is_commentary():
        return
    VersionState(indx.title).save()