# -*- coding: utf-8 -*-
from django.http import HttpResponse
import requests

import structlog

from plugins.models import Plugin
from sefaria.client.util import jsonResponse
from sefaria.utils.encryption import encrypt_str_with_key
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


def get_user_plugin_secret(request, plugin_id):
    """
    Get the secret for a user's plugin.

    @query_param request: Django request object
    @query_param plugin_id: ID of the plugin
    """

    user = request.user
    plugin = Plugin.objects.get(id=plugin_id)

    # encrypt the user id using the plugin secret
    plugin_secret = plugin.secret
    user_id = str(user.id)

    # encrypt the user id
    encrypted_user_id = encrypt_str_with_key(user_id, plugin_secret)

    json_response = {
        "encrypted_user_id": encrypted_user_id.decode('utf-8')
    }

    return jsonResponse(json_response)


def all_plugins(request):
    """
    Get all plugins.

    @query_param request: Django request object
    """

    plugins = Plugin.objects.all()

    json_response = {
        "plugins": [plugin.to_dict() for plugin in plugins]
    }

    return jsonResponse(json_response)