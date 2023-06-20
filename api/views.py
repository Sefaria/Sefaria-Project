import json
from django.http import HttpResponseBadRequest
from sefaria.model import *
from .texts_api import APITextsHandler
from sefaria.client.util import jsonResponse


def get_texts(request, tref):
    try:
        oref = Ref.instantiate_ref_with_legacy_parse_fallback(tref)
    except Exception as e:
        return HttpResponseBadRequest(json.dumps({'error': getattr(e, 'message', str(e))}, ensure_ascii=False))
    if oref.is_empty():
        return HttpResponseBadRequest(json.dumps({'error': f'We have no text for {oref}.'}, ensure_ascii=False))
    cb = request.GET.get("callback", None)
    if request.method == "GET":
        versions_params = request.GET.getlist('version', [])
        if not versions_params:
            versions_params = ['base']
        handler = APITextsHandler(oref, versions_params)
        data = handler.get_versions_for_query()
        return jsonResponse(data, cb)
    return jsonResponse({"error": "Unsupported HTTP method."}, cb)
