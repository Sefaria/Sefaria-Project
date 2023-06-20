import django
django.setup()
from sefaria.model import *
from sefaria.datatype.jagged_array import JaggedArray
from sefaria.utils.hebrew import hebrew_term
from enum import Enum
from .api_errors import *
from .helper import split_at_pipe_with_default
from typing import List

class APITextsHandler():
    """
    process api calls for text
    an api call contains ref and list of version_params
    a version params is string divided by pipe as 'lang|vtitle'
    lang is our code language. special values are:
        source - for versions in the source language of the text
        base - as source but with falling to the 'nearest' to source, or what we have defined as such
    vtitle is the exact versionTitle. special values are:
        no vtitle - the version with the max priority attr of the specified language
        all - all versions of the specified language
    return_obj is dict that includes in its root:
        ref and index data
        'versions' - list of versions details and text
        'errors' - for any version_params that had an error
    """

    ALL = 'all'
    BASE = 'base'
    SOURCE = 'source'

    def __init__(self, oref: Ref, versions_params: List[str]):
        self.versions_params = versions_params
        self.current_params = ''
        self.oref = oref
        self.handled_version_params = []
        self.all_versions = self.oref.version_list()
        self.return_obj = {'versions': [], 'errors': []}

    def _handle_errors(self, lang: str, vtitle: str) -> None:
        if self.oref.is_empty():
            error = RefIsEmptyError(self.oref)
        elif lang == self.SOURCE:
            error = NoSourceTextError(self.oref)
        elif vtitle and vtitle != self.ALL:
            error = NoVersionError(self.oref, vtitle, lang)
        else:
            availabe_langs = {v['actualLanguage'] for v in self.all_versions}
            error = NoLanguageVersionError(self.oref, sorted(availabe_langs))
        self.return_obj['errors'].append({
            self.current_params: error.get_dict()
        })

    def _append_required_versions(self, lang: str, vtitle=None) -> None:
        if lang == self.BASE:
            lang_condition = lambda v: v['isBaseText2'] #temporal name
        elif lang == self.SOURCE:
            lang_condition = lambda v: v['isSource']
        else:
            lang_condition = lambda v: v['actualLanguage'] == lang
        if vtitle and vtitle != self.ALL:
            versions = [v for v in self.all_versions if lang_condition(v) and v['versionTitle'] == vtitle]
        else:
            versions = [v for v in self.all_versions if lang_condition(v)]
            if vtitle != self.ALL and versions:
                versions = [max(versions, key=lambda v: v['priority'] or 0)]
        for version in versions:
            if version not in self.return_obj['versions']:
                self.return_obj['versions'].append(version)
        if not versions:
            self._handle_errors(lang, vtitle)

    def _handle_version_params(self, version_params: str) -> None:
        if version_params in self.handled_version_params:
            return
        lang, vtitle = split_at_pipe_with_default(version_params, 2, [''])
        vtitle = vtitle.replace('_', ' ')
        self._append_required_versions(lang, vtitle)
        self.handled_version_params.append(version_params)

    def _add_text_to_versions(self) -> None:
        for version in self.return_obj['versions']:
            version.pop('title')
            version.pop('language') #should be removed after language is removed from attrs
            version['text'] = TextRange(self.oref, version['actualLanguage'], version['versionTitle']).text

    def _add_ref_data(self) -> None:
        oref = self.oref
        self.return_obj.update({
            'ref': oref.normal(),
            'heRef': oref.he_normal(),
            'sections': oref.normal_sections(), #that means it will be string. in the previous api talmud sections were strings while integers remained integets. this is more consistent but we should check it works
            'toSections': oref.normal_toSections(),
            'sectionRef': oref.section_ref().normal(),
            'heSectionRef': oref.section_ref().he_normal(),
            'firstAvailableSectionRef': oref.first_available_section_ref().normal(),
            'isSpanning': oref.is_spanning(),
            'spanningRefs': [r.normal() for r in oref.split_spanning_ref()],
            'next': oref.next_section_ref().normal(),
            'prev': oref.prev_section_ref().normal() if oref.prev_section_ref() else None,
            'title': oref.context_ref().normal() if oref.next_section_ref() else None,
            'book': oref.book,
            'heTitle': oref.context_ref().he_normal(),
            'primary_category': oref.primary_category,
            'type': oref.primary_category, #same as primary category
        })

    def _reduce_alts_to_ref(self) -> dict: #TODO - copied from TextFamily. if we won't remove it, we should find some place for that
        """
        this function takes the index's alt_structs and reduce it to the relevant ref
        it is necessary for the client side
        """
        oref = self.oref
        # Set up empty Array that mirrors text structure
        alts_ja = JaggedArray()
        for key, struct in oref.index.get_alt_structures().items():
            # Assuming these are in order, continue if it is before ours, break if we see one after
            for n in struct.get_leaf_nodes():
                wholeRef = Ref(n.wholeRef).default_child_ref().as_ranged_segment_ref()
                if wholeRef.ending_ref().precedes(oref):
                    continue
                if wholeRef.starting_ref().follows(oref):
                    break

                # It's in our territory
                wholeRefStart = wholeRef.starting_ref()
                if oref.contains(wholeRefStart) and not wholeRefStart.contains(oref):
                    indxs = [k - 1 for k in wholeRefStart.in_terms_of(oref)]
                    val = {"en": [], "he": []}
                    try:
                        val = alts_ja.get_element(indxs) or val
                    except IndexError:
                        pass
                    val["en"] += [n.primary_title("en")]
                    val["he"] += [n.primary_title("he")]
                    val["whole"] = True
                    alts_ja.set_element(indxs, val)

                if getattr(n, "refs", None):
                    for i, r in enumerate(n.refs):
                        # hack to skip Rishon, skip empty refs
                        if i == 0 or not r:
                            continue
                        subRef = Ref(r)
                        subRefStart = subRef.starting_ref()
                        if oref.contains(subRefStart) and not subRefStart.contains(oref):
                            indxs = [k - 1 for k in subRefStart.in_terms_of(oref)]
                            val = {"en": [], "he": []}
                            try:
                                val = alts_ja.get_element(indxs) or val
                            except IndexError:
                                pass
                            val["en"] += [n.sectionString([i + 1], "en", title=False)]
                            val["he"] += [n.sectionString([i + 1], "he", title=False)]
                            alts_ja.set_element(indxs, val)
                        elif subRefStart.follows(oref):
                            break

        return alts_ja.array()

    def _add_index_data(self) -> None:
        index = self.oref.index
        self.return_obj.update({
            'indexTitle': index.title,
            'categories': index.categories,
            'heIndexTitle': index.get_title('he'),
            'isComplex': index.is_complex(),
            'isDependant': index.is_dependant_text(),
            'order': getattr(index, 'order', ''),
            'collectiveTitle': getattr(index, 'collective_title', ''),
            'heCollectiveTitle': hebrew_term(getattr(index, 'collective_title', '')),
            'alts': self._reduce_alts_to_ref(),
        })

    def _add_node_data(self) -> None:
        inode = self.oref.index_node
        if getattr(inode, "lengths", None):
            self.return_obj["lengths"] = getattr(inode, "lengths")
            if len(self.return_obj["lengths"]):
                self.return_obj["length"]  = self.return_obj["lengths"][0]
        elif getattr(inode, "length", None):
            self.return_obj["length"] = getattr(inode, "length")
        self.return_obj.update({
            'textDepth': getattr(inode, "depth", None),
            'sectionNames': getattr(inode, "sectionNames", None),
            'addressTypes': getattr(inode, "addressTypes", None),
            'heTitle': inode.full_title("he"),
            'titleVariants': inode.all_tree_titles("en"),
            'heTitleVariants': inode.all_tree_titles("he"),
            'index_offsets_by_depth': inode.trim_index_offsets_by_sections(self.oref.sections, self.oref.toSections),
        })

    def get_versions_for_query(self) -> dict:
        for version_params in self.versions_params:
            self.current_params = version_params
            self._handle_version_params(version_params)
        self._add_text_to_versions()
        self._add_ref_data()
        self._add_index_data()
        self._add_node_data()
        return self.return_obj
