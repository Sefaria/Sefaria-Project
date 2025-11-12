from __future__ import annotations

from django.http import JsonResponse
from django.views.decorators.http import require_GET

from remote_config import remoteConfigCache


@require_GET
def remote_config_values(request):
    """
    Return all active remote config entries as a JSON object of key/value pairs.
    """
    return JsonResponse(remoteConfigCache.get_all())
