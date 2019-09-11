
import hashlib
import sys
from functools import wraps
from django.http import HttpRequest

import logging
logger = logging.getLogger(__name__)

try:
    from sefaria.settings import USE_VARNISH
except ImportError:
    USE_VARNISH = False

if not hasattr(sys, '_doc_build'):
    from django.core.cache import cache
    from django.core.cache import caches


#functions from here: http://james.lin.net.nz/2011/09/08/python-decorator-caching-your-functions/
#and here: https://github.com/rchrd2/django-cache-decorator

# New cache instance reconnect-apparently


def get_cache_factory(cache_type):
    if cache_type is None:
        cache_type = 'default'

    return caches[cache_type]


#get the cache key for storage
def cache_get_key(*args, **kwargs):
    serialise = []
    for arg in args:
        serialise.append(str(arg))
    for key,arg in sorted(kwargs.items(), key=lambda x: x[0]):
        serialise.append(str(key))
        serialise.append(str(arg))
    key = hashlib.md5("".join(serialise)).hexdigest()
    return key


def django_cache(action="get", timeout=None, cache_key='', cache_prefix = None, default_on_miss = False, default_on_miss_value=None, cache_type=None):
    """
    Easily add caching to a function in django
    """
    if not cache_key:
        cache_key = None

    def decorator(fn):
        fn.func_dict["django_cache"] = True
        @wraps(fn)
        def wrapper(*args, **kwargs):
            #logger.debug([args, kwargs])

            # Inner scope variables are read-only so we set a new var
            _cache_key = cache_key
            do_actual_func = False

            if not _cache_key:
                cachekey_args = args[:]
                if len(cachekey_args) and isinstance(cachekey_args[0], HttpRequest): # we dont want a HttpRequest to form part of the cache key, it wont be replicatable.
                    cachekey_args = cachekey_args[1:]
                _cache_key = cache_get_key(cache_prefix if cache_prefix else fn.__name__, *cachekey_args, **kwargs)

            if action in ["reset", "set"]:
                do_actual_func = True
                """try:
                    delete_cache_elem(_cache_key, cache_type=cache_type)
                except:
                    pass"""
                result = None
            else:
                #logger.debug(['_cach_key.......',_cache_key])
                result = get_cache_elem(_cache_key, cache_type=cache_type)

            if not result:
                if default_on_miss is False or do_actual_func:
                    result = fn(*args, **kwargs)
                    set_cache_elem(_cache_key, result, timeout=timeout, cache_type=cache_type)
                else:
                    result = default_on_miss_value
                    logger.critical("No cached data was found for {}".format(fn.__name__))

            return result
        return wrapper
    return decorator
#-------------------------------------------------------------#


def get_cache_elem(key, cache_type=None):
    cache_instance = get_cache_factory(cache_type)
    return cache_instance.get(key)


def set_cache_elem(key, value, timeout = None, cache_type=None):
    cache_instance = get_cache_factory(cache_type)
    return cache_instance.set(key, value, timeout)


def delete_cache_elem(key, cache_type=None):
    cache_instance = get_cache_factory(cache_type)
    if isinstance(key, (list, tuple)):
        try:
            return cache_instance.delete_many(key)
        except (AttributeError, NameError, TypeError):
            retval = False
            for k in key:
                retval = retval or cache_instance.delete(k)
            return retval
    return cache_instance.delete(key)


def get_template_cache(fragment_name='', *args):
    cache_key = 'template.cache.%s.%s' % (fragment_name, hashlib.md5(u':'.join([arg for arg in args])).hexdigest())
    return get_cache_elem(cache_key)


def delete_template_cache(fragment_name='', *args):
    delete_cache_elem('template.cache.%s.%s' % (fragment_name, hashlib.md5(u':'.join([arg for arg in args])).hexdigest()))
