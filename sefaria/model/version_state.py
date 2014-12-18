"""
version_state.py
Writes to MongoDB Collection:
"""
import logging


logger = logging.getLogger(__name__)

from . import abstract as abst
from . import text
from text import VersionSet, AbstractIndex, SchemaContent, IndexSet, library, get_index
from sefaria.datatype.jagged_array import JaggedTextArray, JaggedIntArray
from sefaria.system.exceptions import InputError
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
        "en": {
            "availableTexts":
            "availableCounts":
            "percentAvailable":
            "textComplete":
            'completenessPercent':
            'percentAvailableInvalid':
            'sparseness':  # was isSparse
        }
        "he": ...
        "all" {
            "availableTexts":
        }
    }

'''


class VersionState(abst.AbstractMongoRecord, SchemaContent):
    """
    This model overrides default init/load/save behavior, since there is one and only one VersionState record for each Index record.
    """
    collection = 'vstate'

    required_attrs = [
        "title",  # Index title
        "content"  # tree of data about nodes
    ]
    optional_attrs = [
        "flags"
        #"categories",
        #"linksCount",
    ]

    langs = ["en", "he"]

    def __init__(self, index=None):
        """
        :param index: Index record or name of Index
        :type index: text.Index|text.CommentaryIndex|string
        :return:
        """
        super(VersionState, self).__init__()

        if not index:  # so that basic model tests can run
            return

        if not isinstance(index, AbstractIndex):
            index = get_index(index)

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
        c = super(VersionState, self)
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
        self.content = self.index.nodes.visit(self._node_visitor, self.content)
        self.save()

    def set_flag(self, flag, value):
        self.flags[flag] = value  # could use mongo level $set to avoid doc load, for speedup
        delete_template_cache("texts_dashboard")

    def state_node(self, snode):
        return StateNode(_obj=self.content_node(snode))

    #todo: do we want to use an object here?
    def _node_visitor(self, snode, *contents, **kwargs):
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
        for lang in self.langs:
            if not current.get(lang):
                current[lang] = {}

            ja[lang] = self._node_count(snode, lang)

        # Sum all of the languages
        ja['all'] = reduce(lambda x, y: x + y, [ja[lang] for lang in self.langs])
        zero_mask = ja['all'].zero_mask()
        current["all"] = {"availableTexts": ja['all'].array()}

        # Get derived data for all languages
        for lang in self.langs:
            # build zero-padded count ("availableTexts")
            padded_ja[lang] = ja[lang] + zero_mask
            current[lang]["availableTexts"] = padded_ja[lang].array()

            # number of units at each level ("availableCounts") from raw counts
            current[lang]["availableCounts"] = [ja[lang].depth_sum(d) for d in range(depth)]

            # Percent of text available, versus its metadata count ("percentAvailable")
            # and if it's a valid measure ('percentAvailableInvalid')
            if getattr(snode, "lengths", None):
                if len(snode.lengths) == depth:
                    langtotal = reduce(lambda x, y: x + y, current[lang]["availableCounts"])
                    schematotal = reduce(lambda x, y: x + y, snode.lengths)
                    try:
                        current[lang]["percentAvailable"] = langtotal / float(schematotal) * 100
                    except ZeroDivisionError:
                        current[lang]["percentAvailable"] = 0
                elif len(snode.lengths) < depth:
                    current[lang]["percentAvailable"] = current[lang]["availableCounts"][0] / float(snode.lengths[0]) * 100
                else:
                    raise Exception("Text has less sections than node.lengths for {}".format(snode.full_title()))
                current[lang]['percentAvailableInvalid'] = current[lang]["percentAvailable"] > 100
            else:
                current[lang]["percentAvailable"] = 0
                current[lang]['percentAvailableInvalid'] = True

            # Is this text complete? ("textComplete")
            current[lang]["textComplete"] = current[lang]["percentAvailable"] > 99.9

            # What percent complete? ('completenessPercent')
            # are we doing this with the zero-padded array on purpose?
            current[lang]['completenessPercent'] = self._calc_text_structure_completeness(depth, current[lang]["availableTexts"])

            # a rating integer (from 1-4) of how sparse the text is. 1 being most sparse and 4 considered basically ok.
            # ('sparseness') was ('isSparse')
            if current[lang]['percentAvailableInvalid']:
                percentCalc = current[lang]['completenessPercent']
            else:
                percentCalc = current[lang]['percentAvailable']

            lang_flag = "%sComplete" % lang
            if getattr(self, "flags", None) and self.flags.get(lang_flag, False):  # if manually marked as complete, consider it complete
                current[lang]['sparseness'] = 4

            # If it's a commentary, it might have many empty places, so just consider bulk amount of text
            elif (snode.index.is_commentary()
                  and len(current[lang]["availableCounts"])
                  and current[lang]["availableCounts"][-1] >= 300):
                current[lang]['sparseness'] = 2

            # If it's basic count is under a given constant (e.g. 25) consider sparse.
            # This will casues issues with some small texts.  We fix this with manual flags.
            elif len(current[lang]["availableCounts"]) and current[lang]["availableCounts"][-1] <= 25:
                current[lang]['sparseness'] = 1

            elif percentCalc <= 15:
                current[lang]['sparseness'] = 1
            elif 15 < percentCalc <= 50:
                current[lang]['sparseness'] = 2
            elif 50 < percentCalc <= 90:
                current[lang]['sparseness'] = 3
            else:
                current[lang]['sparseness'] = 4

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
    def __init__(self, snode=None, title=None, _obj=None):
        if title:
            snode = library.get_schema_node(title)
            if not snode:
                raise InputError(u"Can not resolve name: {}".format(title))
            self.d = VersionState(snode.index.title).content_node(snode)
        elif snode:
            self.d = VersionState(snode.index.title).content_node(snode)
        if _obj:
            self.d = _obj

    def get_percent_available(self, lang):
        return self.d[lang]["percentAvailable"]

    def ja(self, lang, key):
        """
        :param lang: "he", "en", or "all"
        :param addr:
        :return:
        """
        return JaggedIntArray(self.d[lang][key])

    def contents(self):
        return self.d

def refresh_all_states():
    indices = IndexSet()

    for index in indices:
        if index.is_commentary():
            c_re = "^{} on ".format(index.title)
            texts = VersionSet({"title": {"$regex": c_re}}).distinct("title")
            for text in texts:
                VersionState(text).refresh()
        else:
            VersionState(index.title).refresh()

    import sefaria.summaries as summaries
    summaries.update_summaries()


def process_index_delete_in_version_state(indx, **kwargs):
    VersionState(indx.title).delete()


def process_index_title_change_in_version_state(indx, **kwargs):
    VersionState(kwargs["old"]).update({"title": kwargs["new"]})
    if indx.is_commentary():  # and "commentaryBook" not in d:  # looks useless
        commentator_re = "^(%s) on " % kwargs["old"]
    else:
        commentators = IndexSet({"categories.0": "Commentary"}).distinct("title")
        commentator_re = r"^({}) on {}".format("|".join(commentators), kwargs["old"])
    old_titles = VersionStateSet({"title": {"$regex": commentator_re}}).distinct("title")
    old_new = [(title, title.replace(kwargs["old"], kwargs["new"], 1)) for title in old_titles]
    for pair in old_new:
        VersionStateSet({"title": pair[0]}).update({"title": pair[1]})
