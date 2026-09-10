# -*- coding: utf-8 -*-
"""
legacy_text.py -- the binary en/he text-access classes superseded by the real-language-based
TextChunk in text.py: LegacyTextChunk, its VirtualTextChunk delegate for virtual nodes, and
TextFamily, the bridge class that backs the legacy v2 texts API.
"""

import itertools
import structlog
from functools import reduce

import re2 as re
from .schema import JaggedArrayNode, AddressTalmud
from sefaria.system.exceptions import InputError, MissingKeyError, NoVersionFoundError, ComplexBookLevelRefError
from sefaria.utils.hebrew import hebrew_term
from sefaria.utils.util import list_depth, flatten_jagged_array
from sefaria.datatype.jagged_array import JaggedTextArray, JaggedArray

from .text import AbstractTextRecord, Version, VersionSet, Ref, library

logger = structlog.get_logger(__name__)


class TextFamilyDelegator(type):
    """
    Metaclass to delegate virtual text records
    """

    def __call__(cls, *args, **kwargs):
        if len(args) >= 1:
            oref = args[0]
        else:
            oref = kwargs.get("oref")

        if oref and oref.index_node.is_virtual:
            return VirtualTextChunk(*args, **kwargs)
        else:
            return super(TextFamilyDelegator, cls).__call__(*args, **kwargs)


class LegacyTextChunk(AbstractTextRecord, metaclass=TextFamilyDelegator):
    """
    A chunk of text corresponding to the provided :class:`Ref`, language, and optional version name.
    If it is possible to get a more complete text by merging multiple versions, a merged result will be returned.

    Superseded by the real-language TextChunk in sefaria/model/text.py. The one reason this class
    (and TextFamily, which is built on it) still needs to exist is the legacy v1 texts_api GET,
    which external third-party API consumers call directly -- not used by our own client, but a
    real, must-keep dependency.

    Everything else that still technically routes to this class is not real, maintained product
    surface -- just not yet removed, and a candidate for deletion rather than migration:
    - bulktext_api's ?useTextFamily=1 branch (technically reachable via the linker.v2.js embed
      widget, not something actively maintained).
    - Garden's visual-garden pages (/garden/*) -- an essentially abandoned feature.
    - parashat_hashavua_api, additionally documented broken (504 timeouts).
    - sheets.py's rebuild_sheet_nodes and refine_ref_by_text: dead code, no live caller sends the
      rebuildNodes flag that reaches the former, and the latter's only caller is Garden, above.

    :param oref: :class:`Ref`
    :param lang: "he" or "en". "he" means all rtl languages and "en" means all ltr languages
    :param vtitle: optional. Title of the version desired.
    :param actual_lang: optional. if vtitle isn't specified, prefer to find a version with ISO language `actual_lang`. As opposed to `lang` which can only be "he" or "en", `actual_lang` can be any valid 2 letter ISO language code.
    """

    text_attr = "text"

    def __init__(self, oref, lang="en", vtitle=None, exclude_copyrighted=False, actual_lang=None, fallback_on_default_version=False):
        """
        :param oref:
        :type oref: Ref
        :param lang: "he" or "en"
        :param vtitle:
        :return:
        """
        if isinstance(oref.index_node, JaggedArrayNode):
            self._oref = oref
        else:
            child_ref = oref.default_child_ref()
            if child_ref == oref:
                raise InputError("Can not get LegacyTextChunk at this level, please provide a more precise reference")
            self._oref = child_ref
        self._ref_depth = len(self._oref.sections)
        self._versions = []
        self._version_ids = None
        self._saveable = False  # Can this LegacyTextChunk be saved?

        self.lang = lang
        self.is_merged = False
        self.sources = []
        self.text = self._original_text = self.empty_text()
        self.vtitle = vtitle

        self.full_version = None
        self.versionSource = None  # handling of source is hacky

        if lang and vtitle and not fallback_on_default_version:
            self._saveable = True
            v = Version().load({"title": self._oref.index.title, "language": lang, "versionTitle": vtitle}, self._oref.part_projection())
            if exclude_copyrighted and v.is_copyrighted():
                raise InputError("Can not provision copyrighted text. {} ({}/{})".format(oref.normal(), vtitle, lang))
            if v:
                self._versions += [v]
                try:
                    self.text = self._original_text = self.trim_text(v.content_node(self._oref.index_node))
                except TypeError:
                    raise MissingKeyError(f'The version {vtitle} exists but has no key for the node {self._oref.index_node}')
        elif lang:
            if actual_lang is not None:
                self._choose_version_by_lang(oref, lang, exclude_copyrighted, actual_lang, prioritized_vtitle=vtitle)
            else:
                self._choose_version_by_lang(oref, lang, exclude_copyrighted, prioritized_vtitle=vtitle)
        else:
            raise Exception("LegacyTextChunk requires a language.")

    def _choose_version_by_lang(self, oref, lang: str, exclude_copyrighted: bool, actual_lang: str = None, prioritized_vtitle: str = None) -> None:
        if prioritized_vtitle:
            actual_lang = None
        vset = VersionSet(self._oref.condition_query(lang, actual_lang), proj=self._oref.part_projection())
        if len(vset) == 0:
            if VersionSet({"title": self._oref.index.title}).count() == 0:
                raise NoVersionFoundError("No text record found for '{}'".format(self._oref.index.title))
            return
        if len(vset) == 1:
            v = vset[0]
            if exclude_copyrighted and v.is_copyrighted():
                raise InputError("Can not provision copyrighted text. {} ({}/{})".format(oref.normal(), v.versionTitle, v.language))
            self._versions += [v]
            self.text = self.trim_text(v.content_node(self._oref.index_node))
            #todo: Should this instance, and the non-merge below, be made saveable?
        else:  # multiple versions available, merge
            if exclude_copyrighted:
                vset.remove(Version.is_copyrighted)
            merged_text, sources = vset.merge(self._oref.index_node, prioritized_vtitle=prioritized_vtitle)  #todo: For commentaries, this merges the whole chapter.  It may show up as merged, even if our part is not merged.
            self.text = self.trim_text(merged_text)
            flat_sources = flatten_jagged_array(sources)
            real_sources = [s for s in flat_sources if s]
            if len(set(real_sources)) <= 1:
                winner = real_sources[0] if real_sources else None
                for v in vset:
                    if v.versionTitle == winner:
                        self._versions += [v]
                        break
            else:
                self.sources = flat_sources
                self.is_merged = True
                self._versions = vset.array()

    def __str__(self):
        args = "{}, {}".format(self._oref, self.lang)
        if self.vtitle:
            args += ", {}".format(self.vtitle)
        return args

    def __repr__(self):  # Wanted to use orig_tref, but repr can not include Unicode
        args = "{}, {}".format(self._oref, self.lang)
        if self.vtitle:
            args += ", {}".format(self.vtitle)
        return "{}({})".format(self.__class__.__name__, args)

    def version_ids(self):
        if self._version_ids is None:
            if self._versions:
                vtitle_query = [{'versionTitle': v.versionTitle} for v in self._versions]
                query = {"title": self._oref.index.title, "$or": vtitle_query}
                self._version_ids = VersionSet(query).distinct("_id")
            else:
                self._version_ids = []
        return self._version_ids

    def ja(self, remove_html=False):
        if remove_html:
            return JaggedTextArray(AbstractTextRecord.remove_html(self.text))
        else:
            return JaggedTextArray(self.text)

    def save(self, force_save=False):
        """
        For editing in place (i.e. self.text[3] = "Some text"), it is necessary to set force_save to True. This is
        because by editing in place, both the self.text and the self._original_text fields will get changed,
        causing the save to abort.
        :param force_save: If set to True, will force a save even if no change was detected in the text.
        :return:
        """
        assert self._saveable, "Tried to save a read-only text: {}".format(self._oref.normal())
        assert not self._oref.is_range(), "Only non-range references can be saved: {}".format(self._oref.normal())
        #may support simple ranges in the future.
        #self._oref.is_range() and self._oref.range_index() == len(self._oref.sections) - 1
        if not force_save:
            if self.text == self._original_text:
                logger.warning("Aborted save of {}. No change in text.".format(self._oref.normal()))
                return False

        self._validate()
        self._sanitize()
        self._trim_ending_whitespace()

        if not self.version():
            self.full_version = Version(
                {
                    "chapter": self._oref.index.nodes.create_skeleton(),
                    "versionTitle": self.vtitle,
                    "versionSource": self.versionSource,
                    "language": self.lang,
                    "title": self._oref.index.title
                }
            )
        else:
            self.full_version = Version().load({"title": self._oref.index.title, "language": self.lang, "versionTitle": self.vtitle})
            assert self.full_version, "Failed to load Version record for {}, {}".format(self._oref.normal(), self.vtitle)
            if self.versionSource:
                self.full_version.versionSource = self.versionSource  # hack

        content = self.full_version.sub_content(self._oref.index_node.version_address())
        self._pad(content)
        self.full_version.sub_content(self._oref.index_node.version_address(), [i - 1 for i in self._oref.sections], self.text)

        self._check_available_text_pre_save()

        self.full_version.save()
        self._oref.recalibrate_next_prev_refs(len(self.text))
        self._update_link_language_availability()

        return self

    def _pad(self, content):
        """
        Pads the passed content to the dimension of self._oref.
        Acts on the input variable 'content' in place
        Does not yet handle ranges
        :param content:
        :return:
        """

        for pos, val in enumerate(self._oref.sections):
            # at pos == 0, parent_content == content
            # at pos == 1, parent_content == chapter
            # at pos == 2, parent_content == verse
            # etc
            parent_content = reduce(lambda a, i: a[i - 1], self._oref.sections[:pos], content)

            # Pad out existing content to size of ref
            if len(parent_content) < val:
                for _ in range(len(parent_content), val):
                    parent_content.append("" if pos == self._oref.index_node.depth - 1 else [])

            # check for strings where arrays expected, except for last pass
            if pos < self._ref_depth - 2 and isinstance(parent_content[val - 1], str):
                parent_content[val - 1] = [parent_content[val - 1]]

    def _check_available_text_pre_save(self):
        """
        Stores the availability of this text in before a save is made,
        so that we can know if segments have been added or deleted overall.
        """
        self._available_text_pre_save = {}
        langs_checked = [self.lang] # swtich to ["en", "he"] when global availability checks are needed
        for lang in langs_checked:
            try:
                self._available_text_pre_save[lang] = LegacyTextChunk(self._oref, lang).text
            except NoVersionFoundError:
                self._available_text_pre_save[lang] = []

    def _check_available_segments_changed_post_save(self, lang=None):
        """
        Returns a list of tuples containing a Ref and a boolean availability
        for each Ref that was either made available or unavailble for `lang`.
        If `lang` is None, returns changed availability across all langauges.
        """
        if lang:
            old_refs_available = self._text_to_ref_available(self._available_text_pre_save[self.lang])
        else:
            # Looking for availability of in all langauges, merge results of Hebrew and English
            old_en_refs_available = self._text_to_ref_available(self._available_text_pre_save["en"])
            old_he_refs_available = self._text_to_ref_available(self._available_text_pre_save["he"])
            zipped = list(itertools.zip_longest(old_en_refs_available, old_he_refs_available))
            old_refs_available = []
            for item in zipped:
                en, he = item[0], item[1]
                ref = en[0] if en else he[0]
                old_refs_available.append((ref, (en and en[1] or he and he[1])))

        new_refs_available = self._text_to_ref_available(self.text)

        changed = []
        zipped = list(itertools.zip_longest(old_refs_available, new_refs_available))
        for item in zipped:
            old_text, new_text = item[0], item[1]
            had_previously = old_text and old_text[1]
            have_now = new_text and new_text[1]

            if not had_previously and have_now:
                changed.append(new_text)
            elif had_previously and not have_now:
                # Current save is deleting a line of text, but it could still be
                # available in a different version for this language. Check again.
                if lang:
                    text_still_available = bool(LegacyTextChunk(old_text[0], lang).text)
                else:
                    text_still_available = bool(LegacyTextChunk(old_text[0], "en").text) or bool(LegacyTextChunk(old_text[0], "he").text)
                if not text_still_available:
                    changed.append([old_text[0], False])

        return changed

    def _text_to_ref_available(self, text):
        """Converts a JaggedArray of text to flat list of (Ref, bool) if text is availble"""
        flat = JaggedArray(text).flatten_to_array_with_indices()
        refs_available = []
        for item in flat:
            d = self._oref._core_dict()
            d["sections"] = d["sections"] + item[0]
            d["toSections"] = d["sections"]
            ref = Ref(_obj=d)
            available = bool(item[1])
            refs_available += [[ref, available]]
        return refs_available

    def _update_link_language_availability(self):
        """
        Check if current save has changed the overall availabilty of text for refs
        in this language, pass refs to update revelant links if so.
        """
        changed = self._check_available_segments_changed_post_save(lang=self.lang)

        if len(changed):
            from . import link
            for change in changed:
                link.update_link_language_availabiliy(change[0], self.lang, change[1])

    def _validate(self):
        """
        validate that depth/breadth of the LegacyTextChunk.text matches depth/breadth of the Ref
        :return:
        """
        posted_depth = 0 if isinstance(self.text, str) else list_depth(self.text)
        ref_depth = self._oref.range_index() if self._oref.is_range() else self._ref_depth
        implied_depth = ref_depth + posted_depth
        if implied_depth != self._oref.index_node.depth:
            raise InputError(
                "Text Structure Mismatch. The stored depth of {} is {}, but the text posted to {} implies a depth of {}."
                .format(self._oref.index_node.full_title(), self._oref.index_node.depth, self._oref.normal(), implied_depth)
            )

        #validate that length of the array matches length of the ref
        #todo: double check for depth >= 3
        if self._oref.is_spanning():
            span_size = self._oref.span_size()
            if posted_depth == 0: #possible?
                raise InputError(
                        "Text Structure Mismatch. {} implies a length of {} sections, but the text posted is a string."
                        .format(self._oref.normal(), span_size)
                )
            elif posted_depth == 1: #possible?
                raise InputError(
                        "Text Structure Mismatch. {} implies a length of {} sections, but the text posted is a simple list."
                        .format(self._oref.normal(), span_size)
                )
            else:
                posted_length = len(self.text)
                if posted_length != span_size:
                    raise InputError(
                        "Text Structure Mismatch. {} implies a length of {} sections, but the text posted has {} elements."
                        .format(self._oref.normal(), span_size, posted_length)
                    )
                #todo: validate last section size if provided

        elif self._oref.is_range():
            range_length = self._oref.range_size()
            if posted_depth == 0:
                raise InputError(
                        "Text Structure Mismatch. {} implies a length of {}, but the text posted is a string."
                        .format(self._oref.normal(), range_length)
                )
            elif posted_depth == 1:
                posted_length = len(self.text)
                if posted_length != range_length:
                    raise InputError(
                        "Text Structure Mismatch. {} implies a length of {}, but the text posted has {} elements."
                        .format(self._oref.normal(), range_length, posted_length)
                    )
            else:  # this should never happen.  The depth check should catch it.
                raise InputError(
                    "Text Structure Mismatch. {} implies an simple array of length {}, but the text posted has depth {}."
                    .format(self._oref.normal(), range_length, posted_depth)
                )

    #maybe use JaggedArray.subarray()?
    def trim_text(self, txt):
        """
        Trims a text loaded from Version record with self._oref.part_projection() to the specifications of self._oref
        This works on simple Refs and range refs of unlimited depth and complexity.
        (in place?)
        :param txt:
        :return: List|String depending on depth of Ref
        """
        range_index = self._oref.range_index()
        sections = self._oref.sections
        toSections = self._oref.toSections

        if not sections:
            pass
        else:
            for i in range(0, self._ref_depth):
                if i == 0 == range_index:  # First level slice handled at DB level
                    pass
                elif range_index > i:  # Either not range, or range begins later.  Return simple value.
                    if i == 0 and len(txt):   # We already sliced the first level w/ Ref.part_projection()
                        txt = txt[0]
                    elif len(txt) >= sections[i]:
                        txt = txt[sections[i] - 1]
                    else:
                        return self.empty_text()
                elif range_index == i:  # Range begins here
                    start = sections[i] - 1
                    end = toSections[i]
                    txt = txt[start:end]
                else:  # range_index < i, range continues here
                    begin = end = txt
                    for _ in range(range_index, i - 1):
                        begin = begin[0]
                        end = end[-1]
                    begin[0] = begin[0][sections[i] - 1:]
                    end[-1] = end[-1][:toSections[i]]

        return txt

    def empty_text(self):
        """
        :return: Either empty array or empty string, depending on depth of Ref
        """
        if not self._oref.is_range() and self._ref_depth == self._oref.index_node.depth:
            return ""
        else:
            return []

    def version(self):
        """
        Returns the Version record for this chunk
        :return Version:
        :raises Exception: if the LegacyTextChunk is merged
        """
        if not self._versions:
            return None
        if len(self._versions) == 1:
            return self._versions[0]
        else:
            raise Exception("Called LegacyTextChunk.version() on merged LegacyTextChunk.")

    def has_manually_wrapped_refs(self):
        try:
            return getattr(self.version(), 'hasManuallyWrappedRefs', False)
        except:
            # merged version
            return False

    def nonempty_segment_refs(self):
        """

        :return: list of segment refs with content in this LegacyTextChunk
        """
        r = self._oref
        ref_list = []


        if r.is_range():
            input_refs = r.range_list()
        else:
            input_refs = [r]
        for temp_ref in input_refs:
            temp_tc = LegacyTextChunk(temp_ref, self.lang, self.vtitle)
            ja = temp_tc.ja()
            jarray = ja.mask().array()

            #TODO do I need to check if this ref exists for this version?
            if temp_ref.is_segment_level():
                if jarray: #it's an int if ref is segment_level
                    ref_list.append(temp_ref)
            elif temp_ref.is_section_level():
                ref_list += [temp_ref.subref(i + 1) for i, v in enumerate(jarray) if v]
            else: # higher than section level
                ref_list += [temp_ref.subref([j + 1 for j in ne] + [i + 1])
                             for ne in ja.non_empty_sections()
                             for i, v in enumerate(ja.subarray(ne).mask().array()) if v]

        return ref_list

    def find_string(self, regex_str, cleaner=lambda x: x, strict=True):
        """
        Regex search in LegacyTextChunk
        :param regex_str: regex string to search for
        :param cleaner: f(str)->str. function to clean a semgent before searching
        :param strict: if True, throws error if len(ind_list) != len(ref_list). o/w truncates longer array to length of shorter
        :return: list[(Ref, Match, str)] - list of tuples. each tuple has a segment ref, match object for the match, and text for the segment
        """
        ref_list = self.nonempty_segment_refs()
        text_list = [x for x in self.ja().flatten_to_array() if len(x) > 0]
        if len(text_list) != len(ref_list):
            if strict:
                raise ValueError("The number of refs doesn't match the number of starting words. len(refs)={} len(inds)={}".format(len(ref_list),len(ind_list)))
            else:
                print("Warning: The number of refs doesn't match the number of starting words. len(refs)={} len(inds)={} {}".format(len(ref_list),len(ind_list),str(self._oref)))

        matches = []
        for r, t in zip(ref_list, text_list):
            cleaned = cleaner(t)
            for m in re.finditer(regex_str,cleaned):
                matches += [(r, m, cleaned)]

        return matches

    def text_index_map(self, tokenizer=lambda x: re.split(r'\s+', x), strict=True, ret_ja=False):
        """
        Primarily used for depth-2 texts in order to get index/ref pairs relative to the full text string
         indexes are the word index in word_list

        tokenizer: f(str)->list(str) - function to split up text
        strict: if True, throws error if len(ind_list) != len(ref_list). o/w truncates longer array to length of shorter
        :param ret_ja: True if you want to return the flattened ja
        :return: (list,list) - index_list (0 based index of start word of each segment ref as compared with the text chunk ref), ref_list
        """
        #TODO there is a known error that this will fail if the text version you're using has fewer segments than the VersionState.
        ind_list = []
        ref_list = self.nonempty_segment_refs()

        total_len = 0
        text_list = self.ja().flatten_to_array()
        for i,segment in enumerate(text_list):
            if len(segment) > 0:
                ind_list.append(total_len)
                total_len += len(tokenizer(segment))

        if len(ind_list) != len(ref_list):
            if strict:
                raise ValueError("The number of refs doesn't match the number of starting words. len(refs)={} len(inds)={}".format(len(ref_list),len(ind_list)))
            else:
                print("Warning: The number of refs doesn't match the number of starting words. len(refs)={} len(inds)={} {}".format(len(ref_list),len(ind_list),str(self._oref)))
                if len(ind_list) > len(ref_list):
                    ind_list = ind_list[:len(ref_list)]
                else:
                    ref_list = ref_list[:len(ind_list)]

        if ret_ja:
            return ind_list, ref_list, total_len, text_list
        else:
            return ind_list, ref_list, total_len


class VirtualTextChunk(AbstractTextRecord):
    """
    Delegated from LegacyTextChunk
    Should only arrive here if oref.index_node is virtual.
    """

    text_attr = "text"

    def __init__(self, oref, lang="en", vtitle=None, exclude_copyrighted=False, actual_lang=None, fallback_on_default_version=False):

        self._oref = oref
        self._ref_depth = len(self._oref.sections)
        self._saveable = False

        self.lang = lang
        self.is_merged = False
        self.sources = []

        if self._oref.index_node.parent and not self._oref.index_node.parent.supports_language(self.lang):
            self.text = []
            self._versions = []
            return

        try:
            self.text = self._oref.index_node.get_text()  # <- This is where the magic happens
        except:
            self.text = []
            self._versions = []
            return

        v = Version().load({
            "title": self._oref.index_node.get_index_title(),
            "versionTitle": self._oref.index_node.get_version_title(self.lang),
            "language": self.lang
        }, {"chapter": 0})    # Currently vtitle is thrown out.  There's only one version of each lexicon.
        self._versions = [v] if v else []

    def version(self):
        return self._versions[0] if self._versions else None

    def version_ids(self):
        return [self._versions[0]._id] if self._versions else []

    def has_manually_wrapped_refs(self):
        return not getattr(self._oref.index_node.parent.lexicon, 'needsRefsWrapping', False)


# This was built as a bridge between the object model and existing front end code, so has some hallmarks of that legacy.
class TextFamily(object):
    """
    A text with its translations and optionally the commentary on it.

    Can be instantiated with just the first argument.

    :param oref: :class:`Ref`.  This is the only required argument.
    :param int context: Default: 1. How many context levels up to go when getting commentary.  See :func:`Ref.context_ref`
    :param bool commentary: Default: True. Include commentary?
    :param version: optional. Name of version to use when getting text.
    :param lang: None, "en" or "he".  Default: None.  If None, include both languages.
    :param version2: optional. Additional name of version to use.
    :param bool pad: Default: True.  Pads the provided ref before processing.  See :func:`Ref.padded_ref`
    :param bool alts: Default: False.  Adds notes of where alternate structure elements begin
    """

    ## Attribute maps used for generating dict format ##
    """
    A bit of a naming conflict has arisen here. The TextFamily bundles two versions - one with English text and one
    with Hebrew text. versionTitle refers to the English title of the English version, while heVersionTitle refers to
    the English title of the Hebrew version.

    Later on we decided to translate all of our versionTitles into Hebrew. To avoid direct conflict with the text api,
    these got the names versionTitleInHebrew and versionNotesInHebrew.
    """
    text_attr_map = {
        "en": "text",
        "he": "he"
    }

    attr_map = {
        "versionTitle": {
            "en": "versionTitle",
            "he": "heVersionTitle"
        },
        "versionTitleInHebrew": {
            "en": "versionTitleInHebrew",
            "he": "heVersionTitleInHebrew",
        },
        "shortVersionTitle": {
            "en": "shortVersionTitle",
            "he": "heShortVersionTitle",
        },
        "shortVersionTitleInHebrew": {
            "en": "shortVersionTitleInHebrew",
            "he": "heShortVersionTitleInHebrew",
        },
        "versionSource": {
            "en": "versionSource",
            "he": "heVersionSource"
        },
        "status": {
            "en": "versionStatus",
            "he": "heVersionStatus"
        },
        "versionNotes": {
            "en": "versionNotes",
            "he": "heVersionNotes"
        },
        "extendedNotes": {
            "en": "extendedNotes",
            "he": "heExtendedNotes"
        },
        "extendedNotesHebrew": {
            "en": "extendedNotesHebrew",
            "he": "heExtendedNotesHebrew"
        },
        "versionNotesInHebrew": {
            "en": "versionNotesInHebrew",
            "he": "heVersionNotesInHebrew",
        },
        "digitizedBySefaria": {
            "en": "digitizedBySefaria",
            "he": "heDigitizedBySefaria",
            "default": False,
        },
        "license": {
            "en": "license",
            "he": "heLicense",
            "default": "unknown"
        },
        "formatAsPoetry": { # Setup for Fox translation. Perhaps we want in other places as well?
            "he": "formatHeAsPoetry",
            "en": "formatEnAsPoetry",
            "default": False,
        }
    }
    sourceMap = {
        "en": "sources",
        "he": "heSources"
    }

    def __init__(self, oref, context=1, commentary=True, version=None, lang=None,
                 version2=None, lang2=None, pad=True, alts=False, wrapLinks=False, stripItags=False,
                 translationLanguagePreference=None, fallbackOnDefaultVersion=False):
        """
        :param oref:
        :param context:
        :param commentary:
        :param version:
        :param lang:
        :param version2:
        :param lang2:
        :param pad:
        :param alts: Adds notes of where alt elements begin
        :param wrapLinks: whether to return the text requested with all internal citations marked up as html links <a>
        :param stripItags: whether to strip inline commentator tags and inline footnotes from text
        :return:
        """
        if pad:
            oref = oref.padded_ref()
        elif oref.has_default_child():
            oref = oref.default_child_ref()

        if version:
            version = version.replace("_", " ")
        if version2:
            version2 = version2.replace("_", " ")

        self.ref            = oref.normal()
        self.heRef          = oref.he_normal()
        self.isComplex      = oref.index.is_complex()
        self.text           = None
        self.he             = None
        self._nonExistantVersions = {}
        self._lang          = lang
        self._original_oref = oref
        self._context_oref  = None
        self._chunks        = {}
        self._inode         = oref.index_node
        self._alts          = []

        if not isinstance(oref.index_node, JaggedArrayNode) and not oref.index_node.is_virtual:
            raise InputError("Unable to find text for that ref")

        for i in range(0, context):
            oref = oref.context_ref()
        self._context_oref = oref

        # processes "en" and "he" LegacyTextChunks, and puts the text in self.text and self.he, respectively.
        for language, attr in list(self.text_attr_map.items()):
            tc_kwargs = dict(oref=oref, lang=language, fallback_on_default_version=fallbackOnDefaultVersion)
            if language == 'en': tc_kwargs['actual_lang'] = translationLanguagePreference
            if language in {lang, lang2}:
                curr_version = version if language == lang else version2
                c = LegacyTextChunk(vtitle=curr_version, **tc_kwargs)
                if len(c._versions) == 0:  # indicates `version` doesn't exist
                    if tc_kwargs.get('actual_lang', False) and not curr_version:
                        # actual_lang is only used if curr_version is not passed
                        tc_kwargs.pop('actual_lang', None)
                        c = LegacyTextChunk(vtitle=curr_version, **tc_kwargs)
                    elif curr_version:
                        self._nonExistantVersions[language] = curr_version
            else:
                c = LegacyTextChunk(**tc_kwargs)
            self._chunks[language] = c
            text_modification_funcs = []
            if stripItags:
                text_modification_funcs += [lambda s, secs: c.strip_itags(s), lambda s, secs: ' '.join(s.split()).strip()]
            if wrapLinks and c.version_ids() and not c.has_manually_wrapped_refs():
                #only wrap links if we know there ARE links- get the version, since that's the only reliable way to get it's ObjectId
                #then count how many links came from that version. If any- do the wrapping.
                from . import Link
                query = oref.ref_regex_query()
                query.update({"inline_citation": True})  # , "source_text_oid": {"$in": c.version_ids()}
                if Link().load(query) is not None:
                    link_wrapping_reg, title_nodes = library.get_regex_and_titles_for_ref_wrapping(c.ja().flatten_to_string(), lang=language, citing_only=True)
                    text_modification_funcs += [lambda s, secs: library.get_wrapped_refs_string(s, lang=language, citing_only=True, reg=link_wrapping_reg, title_nodes=title_nodes)]
            padded_sections, _ = oref.get_padded_sections()
            setattr(self, self.text_attr_map[language], c._get_text_after_modifications(text_modification_funcs, start_sections=padded_sections))

        if oref.is_spanning():
            self.spanning = True
        #// todo: should this parameter be renamed? it gets all links, not strictly commentary...
        if commentary:
            from sefaria.client.wrapper import get_links
            if not oref.is_spanning():
                links = get_links(oref.normal())  #todo - have this function accept an object
            else:
                links = [get_links(r.normal()) for r in oref.split_spanning_ref()]
            self.commentary = links if "error" not in links else []

        # get list of available versions of this text
        self.versions = oref.version_list()

        # Adds decoration for the start of each alt structure reference
        if alts:
            self._alts = oref.index.get_trimmed_alt_structs_for_ref(oref)
        if self._inode.is_virtual:
            self._index_offsets_by_depth = None
        else:
            self._index_offsets_by_depth = self._inode.trim_index_offsets_by_sections(oref.sections, oref.toSections)

    def contents(self):
        """
        :return dict: Returns the contents of the text family.
        """
        d = {k: getattr(self, k) for k in list(vars(self).keys()) if k[0] != "_"}

        d["textDepth"]       = getattr(self._inode, "depth", None)
        d["sectionNames"]    = getattr(self._inode, "sectionNames", None)
        d["addressTypes"]    = getattr(self._inode, "addressTypes", None)
        if getattr(self._inode, "lengths", None):
            d["lengths"]     = getattr(self._inode, "lengths")
            if len(d["lengths"]):
                d["length"]  = d["lengths"][0]
        elif getattr(self._inode, "length", None):
            d["length"]      = getattr(self._inode, "length")
        d["textDepth"]       = self._inode.depth
        d["heTitle"]         = self._inode.full_title("he")
        d["titleVariants"]   = self._inode.all_tree_titles("en")
        d["heTitleVariants"] = self._inode.all_tree_titles("he")
        d["type"]            = getattr(self._original_oref, "primary_category")
        d["primary_category"] = getattr(self._original_oref, "primary_category")
        d["book"]            = getattr(self._original_oref, "book")

        for attr in ["categories", "order"]:
            d[attr] = getattr(self._inode.index, attr, "")
        for attr in ["sections", "toSections"]:
            d[attr] = getattr(self._original_oref, attr)[:]

        if getattr(self._inode.index, 'collective_title', None):
            d["commentator"] = getattr(self._inode.index, 'collective_title', "") # todo: deprecate Only used in s1 js code
            d["heCommentator"] = hebrew_term(getattr(self._inode.index, 'collective_title', "")) # todo: deprecate Only used in s1 js code
            d["collectiveTitle"] = getattr(self._inode.index, 'collective_title', "")
            d["heCollectiveTitle"] = hebrew_term(getattr(self._inode.index, 'collective_title', ""))

        if len(self._nonExistantVersions) > 0:
            d['nonExistantVersions'] = self._nonExistantVersions

        if self._inode.index.is_dependant_text():
            #d["commentaryBook"] = getattr(self._inode.index, 'base_text_titles', "")
            #d["commentaryCategories"] = getattr(self._inode.index, 'related_categories', [])
            d["baseTexTitles"] = getattr(self._inode.index, 'base_text_titles', [])

        d["isComplex"]    = self.isComplex
        d["isDependant"] = self._inode.index.is_dependant_text()
        d["indexTitle"]   = self._inode.index.title
        d["heIndexTitle"] = self._inode.index.get_title("he")
        d["sectionRef"]   = self._original_oref.section_ref().normal()
        try:
            d["firstAvailableSectionRef"] = self._original_oref.first_available_section_ref().normal()
        except AttributeError:
            pass
        d["heSectionRef"] = self._original_oref.section_ref().he_normal()
        d["isSpanning"]   = self._original_oref.is_spanning()
        if d["isSpanning"]:
            d["spanningRefs"] = [r.normal() for r in self._original_oref.split_spanning_ref()]

        for language, attr in list(self.text_attr_map.items()):
            chunk = self._chunks.get(language)
            if chunk.is_merged:
                d[self.sourceMap[language]] = chunk.sources
            else:
                ver = chunk.version()
                if ver:
                    for key, val in list(self.attr_map.items()):
                        d[val[language]] = getattr(ver, key, val.get("default", ""))

        # replace ints with daf strings (3->"2a") for Talmud addresses
        # this could be simpler if was done for every value - but would be slower.
        if "Talmud" in self._inode.addressTypes:
            for i in range(len(d["sections"])):
                if self._inode.addressTypes[i] == "Talmud":
                    d["sections"][i] = AddressTalmud.toStr("en", d["sections"][i])
                    if "toSections" in d:
                        d["toSections"][i] = AddressTalmud.toStr("en", d["toSections"][i])

            d["title"] = self._context_oref.normal()
            if "heTitle" in d:
                d["heBook"] = d["heTitle"]
                d["heTitle"] = self._context_oref.he_normal()
            """if d["type"] == "Commentary" and self._context_oref.is_talmud() and len(d["sections"]) > 1:
                d["title"] = "%s Line %d" % (d["title"], d["sections"][1])"""

        """elif self._context_oref.is_commentary():
            dep = len(d["sections"]) if len(d["sections"]) < 2 else 2
            d["title"] = d["book"] + " " + ":".join(["%s" % s for s in d["sections"][:dep]])"""

        d["alts"] = self._alts
        d['index_offsets_by_depth'] = self._index_offsets_by_depth

        return d
