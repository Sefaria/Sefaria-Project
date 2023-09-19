import copy

import django
django.setup()
from sefaria.model import *
from sefaria.utils.hebrew import hebrew_term
from typing import List

class TextManager:
    ALL = 'all'
    BASE = 'base'
    SOURCE = 'source'
    TRANSLATION = 'translation'

    def __init__(self, oref: Ref, versions_params: List[List[str]], fill_in_missing_segments=True):
        self.versions_params = versions_params
        self.oref = oref
        self.fill_in_missing_segments = fill_in_missing_segments
        self.handled_version_params = []
        self.all_versions = self.oref.versionset()

        fields = Version.optional_attrs + Version.required_attrs
        fields.remove('chapter') # not metadata
        self.return_obj = {
            'versions': [],
            'missings': [],
            'available_langs': sorted({v.actualLanguage for v in self.all_versions}),
            'available_versions': [{f: getattr(v, f, "") for f in fields} for v in self.all_versions]
        }

    def _append_version(self, version):
        #TODO part of this function duplicate the functionality of Ref.versionlist(). maybe we should mvoe it to Version
        fields = Version.optional_attrs + Version.required_attrs
        for attr in ['chapter', 'title', 'language']:
            fields.remove(attr)
        version_details = {f: getattr(version, f, "") for f in fields}
        text_range = TextRange(self.oref, version.actualLanguage, version.versionTitle, self.fill_in_missing_segments)

        if self.fill_in_missing_segments:
            # we need a new VersionSet of only the relevant versions for merging. copy should be better than calling for mongo
            relevant_versions = copy.copy(self.all_versions)
            relevant_versions.remove(lambda v: v.actualLanguage != version.actualLanguage)
        else:
            relevant_versions = [version]
        print(self.oref, version.actualLanguage, version.versionTitle, self.fill_in_missing_segments, relevant_versions)
        text_range.versions = relevant_versions
        version_details['text'] = text_range.text

        sources = getattr(text_range, 'sources', None)
        if sources is not None:
            version_details['sources'] = sources

        if self.oref.is_book_level():
            first_section_ref = version.first_section_ref() or version.get_index().nodes.first_leaf().first_section_ref()
            version_details['firstSectionRef'] = first_section_ref.normal()
        self.return_obj['versions'].append(version_details)

    def _append_required_versions(self, lang: str, vtitle: str) -> None:
        if lang == self.BASE:
            lang_condition = lambda v: getattr(v, 'isBaseText', False)
        elif lang == self.SOURCE:
            lang_condition = lambda v: getattr(v, 'isSource', False)
        elif lang == self.TRANSLATION:
            lang_condition = lambda v: not getattr(v, 'isSource', False)
        elif lang:
            lang_condition = lambda v: v.actualLanguage == lang
        else:
            lang_condition = lambda v: True
        if vtitle and vtitle != self.ALL:
            versions = [v for v in self.all_versions if lang_condition(v) and v.versionTitle == vtitle]
        else:
            versions = [v for v in self.all_versions if lang_condition(v)]
            if vtitle != self.ALL and versions:
                versions = [max(versions, key=lambda v: getattr(v, 'priority', 0))]
        for version in versions:
            if version not in self.return_obj['versions']: #do not return the same version even if included in two different version params
                self._append_version(version)
        if not versions:
            self.return_obj['missings'].append((lang, vtitle))

    def _add_ref_data_to_return_obj(self) -> None:
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
            'next': oref.next_section_ref().normal() if oref.next_section_ref() else None,
            'prev': oref.prev_section_ref().normal() if oref.prev_section_ref() else None,
            'title': oref.context_ref().normal(),
            'book': oref.book,
            'heTitle': oref.context_ref().he_normal(),
            'primary_category': oref.primary_category,
            'type': oref.primary_category, #same as primary category
        })

    def _add_index_data_to_return_obj(self) -> None:
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
            'alts': index.get_trimmed_alt_structs_for_ref(self.oref),
        })

    def _add_node_data_to_return_obj(self) -> None:
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
        })
        if not inode.is_virtual:
            self.return_obj['index_offsets_by_depth'] = inode.trim_index_offsets_by_sections(self.oref.sections, self.oref.toSections)

    def get_versions_for_query(self) -> dict:
        for lang, vtitle in self.versions_params:
            self._append_required_versions(lang, vtitle)
        self._add_ref_data_to_return_obj()
        self._add_index_data_to_return_obj()
        self._add_node_data_to_return_obj()
        return self.return_obj
