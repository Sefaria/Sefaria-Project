import copy
from collections import defaultdict
from functools import reduce
from typing import List
import django
import re
from typing import List, Dict
from sefaria.model.marked_up_text_chunk import MarkedUpTextChunk
django.setup()
from sefaria.model import *
from sefaria.utils.hebrew import hebrew_term
from sefaria.system.exceptions import InputError
from sefaria.datatype.jagged_array import JaggedTextArray

class TextRequestAdapter:
    """
    This class is used for getting texts for client side (API or SSR)
    It takes the same params as the api/v3/text (ref, version_params that are language and versionTitle, fill_in_missing_segments, and return_format
    It returns a JSON-like object for an HTTP response.
    """
    ALL = 'all'
    PRIMARY = 'primary'
    SOURCE = 'source'
    TRANSLATION = 'translation'

    def __init__(self, oref: Ref, versions_params: List[List[str]], fill_in_missing_segments=True, return_format='default'):
        self.versions_params = versions_params
        self.oref = oref
        self.fill_in_missing_segments = fill_in_missing_segments
        self.return_format = return_format
        self.handled_version_params = []
        self.all_versions = self.oref.versionset()

        fields = Version.optional_attrs + Version.required_attrs
        fields.remove('chapter') # not metadata
        self.return_obj = {
            'versions': [],
            'missings': [],
            'available_langs': sorted({v.languageFamilyName for v in self.all_versions}),
            'available_versions': [{f: getattr(v, f, "") for f in fields} for v in self.all_versions]
        }

    def _append_version(self, version):
        #TODO part of this function duplicate the functionality of Ref.versionlist(). maybe we should mvoe it to Version
        fields = Version.optional_attrs + Version.required_attrs
        for attr in ['chapter', 'title']:
            fields.remove(attr)
        version_details = {f: getattr(version, f, "") for f in fields}

        if self.fill_in_missing_segments:
            # we need a new VersionSet of only the relevant versions for merging. copy should be better than calling for mongo
            relevant_versions = copy.copy(self.all_versions)
            relevant_versions.remove(lambda v: v.languageFamilyName != version.languageFamilyName)
        else:
            relevant_versions = [version]
        text_range = TextRange(self.oref, version.languageFamilyName, version.versionTitle,
                               self.fill_in_missing_segments, relevant_versions)
        version_details['text'] = text_range.text

        sources = getattr(text_range, 'sources', None)
        if sources is not None:
            version_details['sources'] = sources

        if self.oref.is_book_level():
            first_section_ref = version.first_section_ref() or version.get_index().nodes.first_leaf().first_section_ref()
            version_details['firstSectionRef'] = first_section_ref.normal()
        self.return_obj['versions'].append(version_details)

    def _append_required_versions(self, lang: str, vtitle: str) -> None:
        if lang == self.PRIMARY:
            lang_condition = lambda v: getattr(v, 'isPrimary', False)
        elif lang == self.SOURCE:
            lang_condition = lambda v: getattr(v, 'isSource', False)
        elif lang == self.TRANSLATION:
            lang_condition = lambda v: not getattr(v, 'isSource', False)
        elif lang:
            lang_condition = lambda v: v.languageFamilyName.lower() == lang
        else:
            lang_condition = lambda v: True
        if vtitle and vtitle != self.ALL:
            versions = [v for v in self.all_versions if lang_condition(v) and v.versionTitle == vtitle]
        else:
            versions = [v for v in self.all_versions if lang_condition(v)]
            if vtitle != self.ALL and versions:
                versions = [max(versions, key=lambda v: getattr(v, 'priority', 0))]
        for version in versions:
            if all(version.languageFamilyName != v['languageFamilyName'] or version.versionTitle != v['versionTitle'] for v in self.return_obj['versions']):
                #do not return the same version even if included in two different version params
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
            'next': oref.next_section_ref().normal() if oref.next_section_ref() else None,
            'prev': oref.prev_section_ref().normal() if oref.prev_section_ref() else None,
            'title': oref.context_ref().normal(),
            'book': oref.book,
            'heTitle': oref.context_ref().he_normal(),
            'primary_category': oref.primary_category,
            'type': oref.primary_category, #same as primary category
        })
        if self.return_obj['isSpanning']:
            self.return_obj['spanningRefs'] = [r.normal() for r in oref.split_spanning_ref()]

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

    def _format_text(self):
        # Early return for default format to avoid any processing
        if self.return_format == 'default':
            return

        # Pre-compute shared data outside the version loop
        shared_data = {}
        if self.return_format == 'wrap_all_entities':
            # Check for links and load segment refs only once
            shared_data['all_segment_refs'] = self.oref.all_segment_refs()

            query = self.oref.ref_regex_query()
            query.update({"inline_citation": True})
            shared_data['has_links'] = bool(Link().load(query))

        def make_named_entities_dict(version_title, language):
            # Cache named entities per version to avoid repeated DB queries
            cache_key = f"{version_title}_{language}"
            if cache_key not in shared_data:
                named_entities = RefTopicLinkSet({"expandedRefs": {"$in": [r.normal() for r in shared_data['all_segment_refs']]},
                                                  "charLevelData.versionTitle": version_title,
                                                  "charLevelData.language": language})
                # assumption is that refTopicLinks are all to unranged refs
                ne_by_secs = defaultdict(list)
                for ne in named_entities:
                    try:
                        ne_ref = Ref(ne.ref)
                    except InputError:
                        continue
                    ne_by_secs[ne_ref.sections[-1]-1,] += [ne]
                shared_data[cache_key] = ne_by_secs
            return shared_data[cache_key]

        def _ref_to_href(ref: str) -> str:
            """
            Turn 'Numbers 14' or 'Genesis 22:1' into '/Numbers.14' or '/Genesis.22.1'.
            Feel free to swap this out if your routing is different.
            """
            return "/" + re.sub(r"[:\s]+", ".", ref.strip())

        def wrap_citations_with_links(s: str, spans: List[Dict], end_inclusive: bool = False) -> str:
            """
            Wrap each citation span with <a class="refLink" ...>…</a>.

            Args:
                s: the original string.
                spans: list of dicts with at least:
                       - 'charRange': [start, end] (end is exclusive by default)
                       - 'ref': e.g. 'Numbers 14'
                       - 'text' (optional): visible text for the link (defaults to substring)
                end_inclusive: set True if your charRange end is inclusive.

            Returns:
                Modified string with anchor tags inserted.
            """
            if not spans:
                return s

            # Insert from the right so earlier insertions don't shift later indices.
            spans_sorted = sorted(spans, key=lambda sp: sp["charRange"][0], reverse=True)

            out = s
            for sp in spans_sorted:
                start, end = sp["charRange"]
                if end_inclusive:
                    end += 1

                # Clamp & sanity check
                start = max(0, start)
                end = min(len(out), end)
                if start >= end:
                    continue

                # Use provided visible text if present, else slice from the string
                visible = sp.get("text")
                if not visible:
                    visible = out[start:end]

                ref = sp.get("ref", "").strip()
                href = _ref_to_href(ref)
                anchor = (
                    f'<a class="refLink" href="{href}" data-ref="{escape(ref)}">'
                    f'{escape(visible)}</a>'
                )

                out = out[:start] + anchor + out[end:]

            return out

        # helper to build a segment-level link-wrapper once per version
        def build_link_wrapper(lang, version_text):
            marked_up_chunks = []
            sections_to_chunk = {}
            for i, segment_ref in enumerate(self.oref.all_segment_refs()):
                marked_up_chunk = MarkedUpTextChunk().load({
                    "ref": segment_ref.normal(),
                    "versionTitle": version['versionTitle'],
                    "language": lang
                })
                if marked_up_chunk:
                    marked_up_chunks.append(marked_up_chunk)
                    sections_to_chunk[i] = marked_up_chunk


            print(marked_up_chunks)
            def wrapper(string, sections):
                print(sections)
                chunk : MarkedUpTextChunk = sections_to_chunk.get(sections[0], None)
                if chunk:
                    string = chunk.apply_spans_to_text(string)
                return string
            return wrapper

        # Define text modification functions based on return format
        text_modification_funcs = []



        if self.return_format == 'text_only':
            # Combine all text_only operations into a single function to minimize passes
            def combined_text_only(string, _):
                string = text.AbstractTextRecord.strip_itags(string)
                string = text.AbstractTextRecord.remove_html(string)
                return ' '.join(string.split())
            text_modification_funcs = [combined_text_only]

        elif self.return_format == 'strip_only_footnotes':
            # Combine strip operations into a single function
            def combined_strip_footnotes(string, _):
                string = text.AbstractTextRecord.strip_itags(string)
                return ' '.join(string.split())
            text_modification_funcs = [combined_strip_footnotes]

        # Process each version
        for version in self.return_obj['versions']:
            current_funcs = text_modification_funcs.copy()
            
            if self.return_format == 'wrap_all_entities':
                language = 'he' if version['direction'] == 'rtl' else 'en'
                ne_by_secs = make_named_entities_dict(version['versionTitle'], language)
                
                # Create closure-safe functions by capturing values explicitly
                def make_ne_wrapper(ne_dict):
                    return lambda string, sections: library.get_wrapped_named_entities_string(ne_dict[(sections[-1],)], string)
                
                current_funcs.append(make_ne_wrapper(ne_by_secs))
                
                # Build link-wrapper once per version
                flat_version_text = " ".join(JaggedTextArray(version['text']).flatten_to_array())
                if shared_data['has_links']:
                    current_funcs.append(build_link_wrapper(language, flat_version_text))

            # Only process if there are functions to apply
            if current_funcs:
                ja = JaggedTextArray(version['text'])
                
                # Combine all functions into one to minimize passes over the text
                if len(current_funcs) == 1:
                    composite_func = current_funcs[0]
                else:
                    composite_func = lambda string, sections: reduce(lambda s, f: f(s, sections), current_funcs, string)
                
                version['text'] = ja.modify_by_function(composite_func)

    def get_versions_for_query(self) -> dict:
        self.oref = self.oref.default_child_ref()
        for lang, vtitle in self.versions_params:
            self._append_required_versions(lang, vtitle)
        self._add_ref_data_to_return_obj()
        self._add_index_data_to_return_obj()
        self._add_node_data_to_return_obj()
        self._format_text()
        return self.return_obj
