from sefaria.model import *
from .texts_api import TextsForClientHandler
from sefaria.client.util import jsonResponse
from django.views import View
from typing import List


class Text(View):

    def dispatch(self, request, *args, **kwargs):
        try:
            self.oref = Ref.instantiate_ref_with_legacy_parse_fallback(kwargs['tref'])
        except Exception as e:
            return jsonResponse({'error': getattr(e, 'message', str(e))}, status=400)
        return super().dispatch(request, *args, **kwargs)

    @staticmethod
    def split_piped_params(params_string) -> List[str]:
        params = params_string.split('|')
        if len(params) < 2:
            params.append('')
        params[1] = params[1].replace('_', ' ')
        return params

    def get(self, request, *args, **kwargs):
        if self.oref.is_empty():
            return jsonResponse({'error': f'We have no text for {self.oref}.'}, status=400)
        versions_params = request.GET.getlist('version', [])
        if not versions_params:
            versions_params = ['base']
        versions_params = [self.split_piped_params(param_str) + [param_str] for param_str in versions_params]
        handler = TextsForClientHandler(self.oref, versions_params)
        data = handler.get_versions_for_query()
        return jsonResponse(data)
