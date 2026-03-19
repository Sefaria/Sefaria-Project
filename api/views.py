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
        return_object = {
            'is_ref': True,
            'normalized': oref.normal(),
            'hebrew': oref.he_normal(),
            'url_ref': oref.url(),
            'index_title': index.title,
            'node_type': type(index_node).__name__,
        }

        if return_object['node_type'] == 'SchemaNode':
            return_object['schema_node_children'] = [child.get_primary_title() for child in index_node.children]  # TODO should deafult be an empry string?

        if return_object['node_type'] == 'JaggedArrayNode' or index_node.has_default_child():
            default_node = index_node.get_default_child() or index_node
            return_object['jagged_array_node_metadata'] = {
                'depth': default_node.depth,
                'address_types': default_node.addressTypes,
                'section_names': default_node.sectionNames,
                'sections': oref.sections,
                'to_sections': oref.toSections,
            }

        if return_object['node_type'] == 'SheetNode':
            return_object['sheet_id'] = index_node.sheetId

        if return_object['node_type'] == 'DictionaryEntryNode':
            lexicon_entry = index_node.lexicon_entry
            return_object['lexicon_name'] = lexicon_entry.parent_lexicon
            return_object['headword'] = lexicon_entry.headword

        return jsonResponse(return_object)
