from sefaria.model import *
from sefaria.model.text_request_adapter import TextRequestAdapter
from sefaria.client.util import jsonResponse
from sefaria.system.exceptions import InputError, ComplexBookLevelRefError
from django.views import View
from .api_warnings import *


class Text(View):

    RETURN_FORMATS = ['default', 'wrap_all_entities', 'text_only', 'strip_only_footnotes']

    def dispatch(self, request, *args, **kwargs):
        try:
            self.oref = Ref.instantiate_ref_with_legacy_parse_fallback(kwargs['tref'])
        except Exception as e:
            return jsonResponse({'error': getattr(e, 'message', str(e))}, status=404)
        return super().dispatch(request, *args, **kwargs)

    @staticmethod
    def split_piped_params(params_string) -> List[str]:
        params = params_string.split('|')
        if len(params) < 2:
            params.append('')
        params[1] = params[1].replace('_', ' ')
        return params

    def _handle_warnings(self, data):
        data['warnings'] = []
        for lang, vtitle in data['missings']:
            if lang == 'source':
                warning = APINoSourceText(self.oref)
            elif lang == 'translation':
                warning = APINoTranslationText(self.oref)
            elif vtitle and vtitle != 'all':
                warning = APINoVersion(self.oref, vtitle, lang)
            else:
                warning = APINoLanguageVersion(self.oref, data['available_langs'])
            representing_string = f'{lang}|{vtitle}' if vtitle else lang
            data['warnings'].append({representing_string: warning.get_message()})
        data.pop('missings')
        data.pop('available_langs')
        return data

    def get(self, request, *args, **kwargs):
        if self.oref.is_empty() and not self.oref.index_node.is_virtual:
            return jsonResponse({'error': f'We have no text for {self.oref}.'}, status=404)

        versions_params = request.GET.getlist('version', [])
        if not versions_params:
            versions_params = ['primary']

        versions_params = [self.split_piped_params(param_str) for param_str in versions_params]
        fill_in_missing_segments = bool(int(request.GET.get('fill_in_missing_segments', False)))
        return_format = request.GET.get('return_format', 'default')
        if return_format not in self.RETURN_FORMATS:
            return jsonResponse({'error': f'return_format should be one of those formats: {self.RETURN_FORMATS}.'}, status=400)

        debug_mode = request.GET.get('debug_mode', None)
        text_manager = TextRequestAdapter(self.oref, versions_params, fill_in_missing_segments, return_format, debug_mode)

        try:
            data = text_manager.get_versions_for_query()
            data = self._handle_warnings(data)

        except Exception as e:
            return jsonResponse({'error': str(e)}, status=400)

        return jsonResponse(data)


class RefView(View):

    def dispatch(self, request, *args, **kwargs):
        try:
            self.oref = Ref.instantiate_ref_with_legacy_parse_fallback(kwargs['tref'])
        except InputError:
            return jsonResponse({'is_ref': False})
        except Exception as e:
            return jsonResponse({'error': getattr(e, 'message', str(e))}, status=404)
        return super().dispatch(request, *args, **kwargs)

    def get(self, request, *args, **kwargs):
        oref = self.oref
        index = oref.index
        index_node = oref.index_node
        if isinstance(index_node, JaggedArrayNode):
            _state_node = oref.get_state_node(hint=[("all", "availableTexts")])
            state_ja = _state_node.ja("all")
            vstate = VersionState(index.title)  # load full vstate (not just current node) so prev/next_section_ref can cross into neighboring nodes
        else:
            state_ja = None
            vstate = None
        return_object = {
            'is_ref': True,
            'normalized': oref.normal(),
            'hebrew': oref.he_normal(),
            'url_ref': oref.url(),
            'index_title': index.title,
            'lineage_titles_top_down': index_node.address(),
            'node_type': type(index_node).__name__,
            'navigation_refs': {
                'first_available_section_ref': oref.first_available_section_ref(state_ja=state_ja).normal(),
                'parent_ref': None if oref.is_book_level() else oref.all_context_refs()[1]
            }
        }

        if return_object['node_type'] == 'SchemaNode':
            return_object['children'] = [child.get_primary_title() for child in index_node.children]

        elif return_object['node_type'] in ['JaggedArrayNode', 'DictionaryEntryNode']:
            return_object.update({
                'depth': index_node.depth,
                'address_types': index_node.addressTypes,
                'section_names': index_node.sectionNames,
                'start_indexes': oref.sections,
                'start_labels': oref.normal_sections(),
                'end_indexes': oref.toSections,
                'end_labels': oref.normal_toSections(),
            })

            if return_object['node_type'] == 'DictionaryEntryNode':
                lexicon_entry = index_node.lexicon_entry
                return_object['lexicon_name'] = lexicon_entry.parent_lexicon
                return_object['headword'] = lexicon_entry.headword

        elif return_object['node_type'] == 'SheetNode':
            return_object['sheet_id'] = index_node.sheetId

        elif return_object['node_type'] == 'DictionaryNode':
            return_object['lexicon_name'] = index_node.lexiconName

        if index_node.has_default_child():
            default_ref = oref.default_child_ref()
            default_node = default_ref.index_node
            return_object['default_child_node'] = {
                'node_type': type(default_node).__name__,
                'depth': default_node.depth,
                'node_index': index_node.children.index(default_node)
            }
            if return_object['node_type'] == 'DictionaryNode':
                return_object['default_child_node']['lexicon_name'] = index_node.lexiconName

        if getattr(index_node, "depth", None) and not oref.is_range() and not oref.is_segment_level():
            subrefs = oref.all_subrefs(state_ja=state_ja)
            return_object['navigation_refs']['first_subref'] = subrefs[0].normal()
            return_object['navigation_refs']['last_subref'] = subrefs[-1].normal()

        norm = lambda r: r.normal() if r else None
        if oref.is_segment_level():
            return_object['navigation_refs']['prev_segment_ref'] = norm(oref.prev_segment_ref(state_ja=state_ja))
            return_object['navigation_refs']['next_segment_ref'] = norm(oref.next_segment_ref(state_ja=state_ja))
        elif oref.is_section_level():
            return_object['navigation_refs']['prev_section_ref'] = norm(oref.prev_section_ref(vstate=vstate))
            return_object['navigation_refs']['next_section_ref'] = norm(oref.next_section_ref(vstate=vstate))

        return jsonResponse(return_object)
