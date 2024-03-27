from sefaria.model import *
from sefaria.model.text_reuqest_adapter import TextRequestAdapter
from sefaria.client.util import jsonResponse
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
        text_manager = TextRequestAdapter(self.oref, versions_params, fill_in_missing_segments, return_format)
        data = text_manager.get_versions_for_query()
        data = self._handle_warnings(data)
        return jsonResponse(data)
