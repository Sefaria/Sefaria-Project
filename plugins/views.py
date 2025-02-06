# -*- coding: utf-8 -*-
from django.http import HttpResponse
import requests

import structlog
logger = structlog.get_logger(__name__)


def dev(request):
    """
    Render the dev version of a plugin.

    @query_param request: Django request object
    @query_param plugin_url: URL of the plugin

    This endpoint pulls the plugin from the plugin_url and updates the plugin's
    custome element name to target.
    """
    plugin_url = request.GET.get("plugin_url")
    target = request.GET.get("target")

    custom_component_name = target
    costum_component_class_name = (target[0].upper() + target[1:]).replace("-", "")
    
    content = requests.get(plugin_url)
    plugin = content.text

    # replace all instances of the plugin's custom element name with the target
    plugin = plugin.replace("sefaria-plugin", custom_component_name)
    plugin = plugin.replace("SefariaPlugin", costum_component_class_name)

    return HttpResponse(plugin, content_type="text/javascript")
