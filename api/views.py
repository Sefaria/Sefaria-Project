from sefaria.model import *
from sefaria.model.text_reuqest_adapter import TextRequestAdapter
from sefaria.client.util import jsonResponse
from django.views import View
from .api_warnings import *
from sefaria.model.plan import Plan, PlanSet
from bson import ObjectId
import logging
import re

logger = logging.getLogger(__name__)

class Text(View):

    RETURN_FORMATS = ['default', 'wrap_all_entities', 'text_only']

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
        fill_in_missing_segments = request.GET.get('fill_in_missing_segments', False)
        return_format = request.GET.get('return_format', 'default')
        if return_format not in self.RETURN_FORMATS:
            return jsonResponse({'error': f'return_format should be one of those formats: {self.RETURN_FORMATS}.'}, status=400)
        text_manager = TextRequestAdapter(self.oref, versions_params, fill_in_missing_segments, return_format)
        data = text_manager.get_versions_for_query()
        data = self._handle_warnings(data)
        return jsonResponse(data)

class PlanView(View):
    def dispatch(self, request, *args, **kwargs):
        try:
            if 'uuid' in kwargs:
                object_id = ObjectId(kwargs['uuid'])
                self.plan = Plan().load({"_id": object_id})
                if not self.plan:
                    return jsonResponse({'error': 'Plan not found'}, status=404)
            return super().dispatch(request, *args, **kwargs)
        except Exception as e:
            logger.error(f"Error in dispatch: {str(e)}")
            return jsonResponse({'error': str(e)}, status=500)

    def get(self, request, *args, **kwargs):
        try:
            # Get specific plan day content
            if hasattr(self, 'plan') and 'day' in kwargs:
                day_number = int(kwargs['day'])
                sheet_content = self.plan.get_day_content(day_number)
                
                if sheet_content:
                    response = {
                        "day": day_number,
                        "title": self.plan.title,
                        "content": sheet_content
                    }
                    response["sheet_id"] = self.plan.content.get(f"day {day_number}")
                    return jsonResponse(response)
                else:
                    return jsonResponse({
                        'error': f'Day {day_number} not found for this plan',
                        'total_days': self.plan.total_days
                    }, status=404)
            
            # Get specific plan details
            if hasattr(self, 'plan'):
                return jsonResponse(self.plan.contents())
            
            # List all plans with optional filters
            query = {}
            if 'category' in request.GET:
                query['categories'] = request.GET['category']
            
            plans = PlanSet(query)
            return jsonResponse({
                "plans": plans.contents()
            })

        except Exception as e:
            logger.error(f"Error in get: {str(e)}")
            return jsonResponse({'error': str(e)}, status=500)
