
import hashlib
import sys
from datetime import datetime
from functools import wraps
from typing import Optional, Any, Union

from django.http import HttpRequest
from django.core.cache import DEFAULT_CACHE_ALIAS
from django.core.cache.backends.base import BaseCache
from django.conf import settings as django_settings

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


def get_cache_factory(cache_type: Optional[str]) -> BaseCache:
    """
    Get a Django cache instance by cache type.
    
    Args:
        cache_type: The cache backend type to retrieve. Defaults to 'default' if None.
        
    Returns:
        BaseCache: The Django cache backend instance.
    """
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


def get_cache_elem(key: str, cache_type: Optional[str] = None) -> Any:
    """
    Retrieve an element from the cache.
    
    Args:
        key: The cache key to retrieve.
        cache_type: The cache backend type to use. Defaults to 'default' if None.
        
    Returns:
        Any: The cached value, or None if not found.
    """
    cache_instance = get_cache_factory(cache_type)
    return cache_instance.get(key)


def get_shared_cache_elem(key):
    return get_cache_elem(key, cache_type=SHARED_DATA_CACHE_ALIAS)


def set_cache_elem(key: str, value: Any, timeout: Optional[int] = None, cache_type: Optional[str] = None) -> bool:
    """
    Set an element in the cache.
    
    Args:
        key: The cache key to set.
        value: The value to cache.
        timeout: Cache timeout in seconds. None means use default timeout.
        cache_type: The cache backend type to use. Defaults to 'default' if None.
        
    Returns:
        bool: True if the value was successfully cached, False otherwise.
    """
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


def invalidate_cache_by_pattern(pattern: str, cache_type: Optional[str] = None) -> dict:
    """
    Invalidate cache entries matching a pattern using the most appropriate method for the cache backend.

    Args:
        pattern: The pattern to match cache keys against (e.g., "*strapi_graphql*")
        cache_type: The cache backend type to use. Defaults to 'default' if None.

    Returns:
        dict: Result dictionary with success message and count, or error details

    Examples:
        # Invalidate all Strapi GraphQL cache entries
        result = invalidate_cache_by_pattern("*strapi_graphql*")

        # Invalidate specific cache type
        result = invalidate_cache_by_pattern("*user_data*", cache_type="shared")
    """
    try:
        # Get cache instance
        cache_instance = get_cache_factory(cache_type)

        # Check cache backend type using settings-based approach
        cache_backend_config = django_settings.CACHES.get(cache_type or 'default', {})
        cache_backend = cache_backend_config.get('BACKEND', '')

        # For Redis cache backend using django-redis
        try:
            if hasattr(cache_instance, "delete_pattern"):
                # django-redis provides delete_pattern method for Redis
                deleted_count = cache_instance.delete_pattern(pattern)
                logger.info(f"Invalidated {deleted_count} cache entries via Redis pattern deletion: {pattern}")
                return {
                    "success": True,
                    "method": "pattern_deletion",
                    "backend": cache_backend,
                    "count": deleted_count,
                    "message": f"Invalidated {deleted_count} cache entries matching pattern '{pattern}'"
                }

            else:
                # Fallback for other cache backends (FileBasedCache, etc.)
                logger.info(f"Using fallback invalidation for {cache_backend}")

                if hasattr(cache_instance, "clear"):
                    # For FileBasedCache and other backends that support clear()
                    # This could clear ALL entries for all environments without Redis
                    logger.warning(f"No pattern deletion available for {cache_backend}, clearing entire cache")
                    cache_instance.clear()
                    return {
                        "success": True,
                        "method": "full_clear",
                        "backend": cache_backend,
                        "count": "unknown",
                        "message": f"Entire cache cleared for {cache_backend} (no pattern support)"
                    }

                else:
                    # No supported invalidation method available
                    logger.info(f"No supported invalidation method for {cache_backend}")
                    return {
                        "success": False,
                        "method": "none",
                        "backend": cache_backend,
                        "count": 0,
                        "message": f"Cache invalidation not supported for {cache_backend}"
                    }

        except Exception as cache_error:
            logger.error(f"Error during cache invalidation: {str(cache_error)}")
            # Don't fail the webhook request if cache invalidation has issues
            return {
                "success": True,
                "method": "error_handled",
                "backend": cache_backend,
                "count": 0,
                "message": f"Cache invalidation attempted",
                "warning": str(cache_error)
            }

    except Exception as e:
        logger.error(f"Error in invalidate_cache_by_pattern: {str(e)}")
        return {
            "success": False,
            "method": "critical_error",
            "backend": "unknown",
            "count": 0,
            "message": "Internal server error"
        }