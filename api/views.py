from django.http import Http404, QueryDict, HttpResponseBadRequest

from sefaria.model import *
from sefaria.system.multiserver.coordinator import server_coordinator
from sefaria.settings import DISABLE_AUTOCOMPLETER, ENABLE_LINKER
from .texts_api import APITextsHandler
from sefaria.client.util import jsonResponse

import structlog
logger = structlog.get_logger(__name__)

#TODO - i've copied it from reader.views. i'm not sure what it does

#    #    #
# Initialized cache library objects that depend on sefaria.model being completely loaded.
logger.info("Initializing library objects.")
logger.info("Initializing TOC Tree")
library.get_toc_tree()

logger.info("Initializing Shared Cache")
library.init_shared_cache()

if not DISABLE_AUTOCOMPLETER:
    logger.info("Initializing Full Auto Completer")
    library.build_full_auto_completer()

    logger.info("Initializing Ref Auto Completer")
    library.build_ref_auto_completer()

    logger.info("Initializing Lexicon Auto Completers")
    library.build_lexicon_auto_completers()

    logger.info("Initializing Cross Lexicon Auto Completer")
    library.build_cross_lexicon_auto_completer()

    logger.info("Initializing Topic Auto Completer")
    library.build_topic_auto_completer()

if ENABLE_LINKER:
    logger.info("Initializing Linker")
    library.build_ref_resolver()

if server_coordinator:
    server_coordinator.connect()
#    #    #

def get_texts(request, tref):
    try:
        oref = Ref.instantiate_ref_with_legacy_parse_fallback(tref)
    except Exception as e:
        return HttpResponseBadRequest(e)
    cb = request.GET.get("callback", None)
    if request.method == "GET":
        versions_params = request.GET.getlist('version', [])
        if not versions_params:
            versions_params = ['source'] #TODO - or base?
        handler = APITextsHandler(oref, versions_params)
        data = handler.get_versions_for_query()
        return jsonResponse(data, cb)
    return jsonResponse({"error": "Unsupported HTTP method."}, cb)
