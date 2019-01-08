from functools import wraps

from django.http import HttpResponse, Http404
from django.template import RequestContext
from django.shortcuts import render_to_response

from sefaria.client.util import jsonResponse
import sefaria.system.exceptions as exps

import logging
import bleach
logger = logging.getLogger(__name__)



def catch_error_as_json(func):
    """
    Decorator that catches InputErrors and translates them into JSON 'error' dicts for front end consumption.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            result = func(*args, **kwargs)
        except exps.InputError as e:
            logger.warning(u"An exception occurred processing request for '{}' while running {}. Caught as JSON".format(args[0].path, func.__name__), exc_info=True)
            request = args[0]
            return jsonResponse({"error": unicode(e)}, callback=request.GET.get("callback", None))
        return result
    return wrapper


def catch_error_as_http(func):
    """
    Decorator that catches InputErrors and returns an error page.
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            result = func(*args, **kwargs)
        except exps.InputError as e:
            logger.warning(u"An exception occurred processing request for '{}' while running {}. Caught as HTTP".format(args[0].path, func.__name__), exc_info=True)
            raise Http404
        except Http404:
            raise
        except Exception as e:
            logger.exception(u"An exception occurred processing request for '{}' while running {}. Caught as HTTP".format(args[0].path, func.__name__))
            return render_to_response(args[0], 'static/generic.html',
                             {"content": u"There was an error processing your request: {}".format(unicode(e))})
        return result
    return wrapper


def log(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        """Assumes that function doesn't change input data"""
        #logger.debug("Calling: " + func + "(" + args + kwargs + ")")
        result = func(*args, **kwargs)
        msg = func.__name__ + "(" + ",".join([unicode(a) for a in args])
        msg += ", " + str(kwargs) if kwargs else ""
        msg += "):\n\t" + str(result)
        logger.debug(msg)
        return result
    return wrapper


def sanitize_get_params(func):
    """
    For view functions where first param is `request`
    Uses bleach to protect against XSS attacks in GET requests
    """
    @wraps(func)
    def wrapper(request, *args, **kwargs):
        request.GET = request.GET.copy()  #  see https://stackoverflow.com/questions/18930234/django-modifying-the-request-object/18931697
        for k, v in request.GET.items():
            request.GET[k] = bleach.clean(v)
        args = map(lambda a: bleach.clean(a) if isinstance(a, basestring) else a, args)  # while we're at it, clean any other vars passed
        result = func(request, *args, **kwargs)
        return result
    return wrapper


