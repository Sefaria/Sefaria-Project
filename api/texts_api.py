import django
django.setup()
from sefaria.utils.hebrew import hebrew_term
from .api_errors import *
from .helper import split_query_param_and_add_defaults
from typing import List


class VersionsParams():
    """
    an object for managing the versions params for TextsHandler
    params can come from an API request or internal (sever side rendering)
    lang is our code language. special values are:
        source - for versions in the source language of the text
        base - as source but with falling to the 'nearest' to source, or what we have defined as such
    vtitle is the exact versionTitle. special values are:
        no vtitle - the version with the max priority attr of the specified language
        all - all versions of the specified language
    representing_string is the original string that came from an API call
    """

    def __init__(self, lang: str, vtitle: str, representing_string=''):
        self.lang = lang
        self.vtitle = vtitle
        self.representing_string = representing_string

    def __eq__(self, other):
        return isinstance(other, VersionsParams) and self.lang == other.lang and self.vtitle == other.vtitle

    @staticmethod
    def parse_api_params(version_params):
        """
        an api call contains ref and list of version_params
        a version params is string divided by pipe as 'lang|vtitle'
        this function takes the list of version_params and returns list of VersionsParams
        """
        version_params_list = []
        for params_string in version_params:
            lang, vtitle = split_query_param_and_add_defaults(params_string, 2, [''])
            vtitle = vtitle.replace('_', ' ')
            version_params = VersionsParams(lang, vtitle, params_string)
            if version_params not in version_params_list:
                version_params_list.append(version_params)
        return version_params_list


class TextsForClientHandler():
    """
    process api calls for text
    return_obj is dict that includes in its root:
        ref and index data
        'versions' - list of versions details and text
        'errors' - for any version_params that had an error
    """

    ALL = 'all'
    BASE = 'base'
    SOURCE = 'source'

    def __init__(self, oref: Ref, versions_params: List[VersionsParams]):
        self.versions_params = versions_params
        self.oref = oref
        self.handled_version_params = []
        self.all_versions = self.oref.version_list()
        self.return_obj = {'versions': [], 'errors': []}

    def _handle_errors(self, version_params: VersionsParams) -> None:
        lang, vtitle = version_params.lang, version_params.vtitle
        if lang == self.SOURCE:
            error = APINoSourceText(self.oref)
        elif vtitle and vtitle != self.ALL:
            error = APINoVersion(self.oref, vtitle, lang)
        else:
            availabe_langs = {v['actualLanguage'] for v in self.all_versions}
            error = APINoLanguageVersion(self.oref, sorted(availabe_langs))
        representing_string = version_params.representing_string or f'{version_params.lang}|{version_params.representing_string}'
        self.return_obj['errors'].append({
            version_params.representing_string: error.get_message()
        })

    def _append_required_versions(self, version_params: VersionsParams) -> None:
        lang, vtitle = version_params.lang, version_params.vtitle
        if lang == self.BASE:
            lang_condition = lambda v: v['isBaseText2'] #temporal name
        elif lang == self.SOURCE:
            lang_condition = lambda v: v['isSource']
        elif lang:
            lang_condition = lambda v: v['actualLanguage'] == lang
        else:
            lang_condition = lambda v: True
        if vtitle and vtitle != self.ALL:
            versions = [v for v in self.all_versions if lang_condition(v) and v['versionTitle'] == vtitle]
        else:
            versions = [v for v in self.all_versions if lang_condition(v)]
            if vtitle != self.ALL and versions:
                versions = [max(versions, key=lambda v: v['priority'] or 0)]
        for version in versions:
            if version not in self.return_obj['versions']: #do not return the same version even if included in two different version params
                self.return_obj['versions'].append(version)
        if not versions:
            self._handle_errors(version_params)

    def _add_text_to_versions(self) -> None:
        for version in self.return_obj['versions']:
            version.pop('title')
            version.pop('language') #should be removed after language is removed from attrs
            version['text'] = TextRange(self.oref, version['actualLanguage'], version['versionTitle']).text

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
            'index_offsets_by_depth': inode.trim_index_offsets_by_sections(self.oref.sections, self.oref.toSections),
        })

    def get_versions_for_query(self) -> dict:
        for version_params in self.versions_params:
            self._append_required_versions(version_params)
        self._add_text_to_versions()
        self._add_ref_data_to_return_obj()
        self._add_index_data_to_return_obj()
        self._add_node_data_to_return_obj()
        return self.return_obj
