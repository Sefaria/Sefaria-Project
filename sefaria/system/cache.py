
import hashlib
import sys
from datetime import datetime
from functools import wraps

from django.http import HttpRequest
from django.core.cache import DEFAULT_CACHE_ALIAS

from sefaria import settings

import structlog
logger = structlog.get_logger(__name__)

if not hasattr(sys, '_doc_build'):
    from django.core.cache import cache
    from django.core.cache import caches

SHARED_DATA_CACHE_ALIAS = getattr(settings, 'SHARED_DATA_CACHE_ALIAS', DEFAULT_CACHE_ALIAS)
LONG_TERM_CACHE_ALIAS = getattr(settings, 'LONG_TERM_CACHE_ALIAS', DEFAULT_CACHE_ALIAS)

#functions from here: http://james.lin.net.nz/2011/09/08/python-decorator-caching-your-functions/
#and here: https://github.com/rchrd2/django-cache-decorator

# New cache instance reconnect-apparently


def get_cache_factory(cache_type):
    if cache_type is None:
        cache_type = 'default'
    return caches[cache_type]


#get the cache key for storage
def cache_get_key_arr(*args, **kwargs):
    args_key_array = []
    for arg in args:
        args_key_array.append(str(arg))
    for key,arg in sorted(list(kwargs.items()), key=lambda x: x[0]):
        args_key_array.append(str(key))
        args_key_array.append(str(arg))
    return args_key_array


def cache_get_key(key_arr):
    return hashlib.md5("".join(key_arr).encode('utf-8')).hexdigest()


def django_cache(action="get", timeout=None, cache_key='', cache_prefix=None, default_on_miss=False, default_on_miss_value=None, cache_type=None, decorate_data_with_key=False):
    """
    Easily add caching to a function in django
    """
    if not cache_key:
        cache_key = None

    def decorator(fn):
        fn.__dict__["django_cache"] = True
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
                _cache_ke_arr = cache_get_key_arr(cache_prefix if cache_prefix else fn.__name__, *cachekey_args, **kwargs)
                _cache_key = cache_get_key(_cache_ke_arr)

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
                if decorate_data_with_key:
                    result = result["data"]

            if not result:
                if default_on_miss is False or do_actual_func:
                    result = fn(*args, **kwargs)
                    if decorate_data_with_key:
                        result = {
                            'key': "_".join(_cache_ke_arr),
                            'data': result
                        }
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


def get_shared_cache_elem(key):
    return get_cache_elem(key, cache_type=SHARED_DATA_CACHE_ALIAS)


def set_cache_elem(key, value, timeout = None, cache_type=None):
    cache_instance = get_cache_factory(cache_type)
    return cache_instance.set(key, value, timeout)


def set_shared_cache_elem(key, value, timeout=None):
    return set_cache_elem(key, value, timeout, cache_type=SHARED_DATA_CACHE_ALIAS)


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


def delete_shared_cache_elem(key):
    return delete_cache_elem(key, cache_type=SHARED_DATA_CACHE_ALIAS)


def get_template_cache(fragment_name='', *args):
    cache_key = 'template.cache.%s.%s' % (fragment_name, hashlib.md5(':'.join([arg for arg in args]).encode('utf-8')).hexdigest())
    return get_cache_elem(cache_key)


def delete_template_cache(fragment_name='', *args):
    delete_cache_elem('template.cache.%s.%s' % (fragment_name, hashlib.md5(':'.join([arg for arg in args]).encode('utf-8')).hexdigest()))


class InMemoryCache():
    data = {}
    timeouts = {}

    def set(self, key, val, timeout=None):
        self.data[key] = val
        if timeout:
            self.timeouts[key] = (timeout, datetime.now().timestamp())

    def get(self, key):
        timeout = self.timeouts.get(key, None)
        if timeout and timeout[0] + timeout[1] < datetime.now().timestamp():
            self.set(key, None, timeout=timeout[0])
            return None

        return self.data.get(key,  None)

    def reset_all(self):
        for k in self.data:
            self.data[k] = None


in_memory_cache = InMemoryCache()