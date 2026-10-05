
import hashlib
import random
import sys
import time
from datetime import datetime
from functools import wraps
from typing import Callable, Optional, Any, Union

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
                if decorate_data_with_key and result is not None:
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


_UNKNOWN_GEN = object()  # a generation that never matches Redis, forcing a refresh once Redis is back


class GenCache:
    """
    Cross-process cache freshness via one Redis INCR counter per tracked object.

    register() a refresh_fn per key at startup. get() serves this process's copy, re-checking
    the key's counter at most every check_interval_seconds and calling refresh_fn when it has
    changed. Writers call publish() (with the fresh value) or mark_fresh() (when the object
    lives on its owner, e.g. Library, and was already rebuilt) to update this process and bump
    the counter for peers, or invalidate() to make every process, this one included, refresh.

    Fails open: if Redis is unreachable, get() serves the last value and bumps only log.
    """
    def __init__(self, redis_client, check_interval_seconds: float, jitter_max_seconds: float, key_prefix: str = ""):
        self.check_interval_seconds = check_interval_seconds
        self.jitter_max_seconds = jitter_max_seconds  # spreads the fleet's rebuilds after Redis loses its keyspace
        self._data = {}            # key -> cached value
        self._gens = {}            # key -> last-applied generation; absent until first refresh
        self._last_checked = {}    # key -> monotonic time of last check
        self._refreshers = {}      # key -> refresh_fn
        self.redis = redis_client
        # namespaces the counters when several deployments share one Redis (e.g. cauldrons)
        self._key_prefix = f"{key_prefix}:" if key_prefix else ""

    def _redis_key(self, key: str) -> str:
        return f"{self._key_prefix}gen:{key}"

    def register(self, key: str, refresh_fn: Callable[[], Any]):
        self._refreshers[key] = refresh_fn

    def is_registered(self, key: str) -> bool:
        return key in self._refreshers

    def get(self, key: str):
        refresh_fn = self._refreshers[key]
        is_first_access = key not in self._gens

        now = time.monotonic()
        if not is_first_access and now - self._last_checked.get(key, 0) < self.check_interval_seconds:
            return self._data.get(key)
        self._last_checked[key] = now

        try:
            redis_gen = self.redis.get(self._redis_key(key))
        except Exception:
            logger.error("GenCache: Redis unreachable checking %s; serving stale value", key)
            if not is_first_access:
                return self._data.get(key)
            redis_gen = None

        if is_first_access or self._gens[key] != redis_gen:
            if not is_first_access and redis_gen is None and self._gens[key] is not None:
                # The counter vanished: Redis lost its keyspace, so every process in the fleet
                # is about to rebuild at once. Jitter to spread the load.
                time.sleep(random.uniform(0, self.jitter_max_seconds))
            self._data[key] = refresh_fn()
            self._gens[key] = redis_gen
        return self._data.get(key)

    def _bump(self, key: str):
        try:
            return self.redis.incr(self._redis_key(key))
        except Exception:
            logger.error("GenCache: failed to bump %s; peers stay stale until the next bump", key)
            return None

    def mark_fresh(self, key: str):
        """This process already rebuilt key's object: record it as current and bump for peers."""
        self._last_checked[key] = time.monotonic()
        new_gen = self._bump(key)
        self._gens[key] = str(new_gen) if new_gen is not None else _UNKNOWN_GEN

    def publish(self, key: str, value):
        """mark_fresh() for a key whose value GenCache holds. Returns value."""
        self._data[key] = value
        self.mark_fresh(key)
        return value

    def invalidate(self, key: str):
        """Makes the next get() of key refresh in every process, this one included."""
        self.invalidate_local(key)
        self._bump(key)

    def invalidate_local(self, key: str):
        """Makes this process's next get() of key refresh, without touching Redis."""
        self._data.pop(key, None)
        self._gens.pop(key, None)
        self._last_checked.pop(key, None)


def _build_gen_cache() -> GenCache:
    from sefaria.system.redis_sentinel import RedisConfig, SentinelConfig, get_redis_client
    redis_config = RedisConfig(settings.REDIS_URL, settings.REDIS_PASSWORD, settings.REDIS_PORT)
    sentinel_config = SentinelConfig(
        settings.SENTINEL_HEADLESS_URL, settings.SENTINEL_PASSWORD, settings.REDIS_PORT,
        settings.SENTINEL_TRANSPORT_OPTS, settings.SENTINEL_MASTER_SET,
    )
    client = get_redis_client(redis_config, sentinel_config, settings.GENCACHE_REDIS_DB_NUM, decode_responses=True)
    return GenCache(
        client, settings.GENCACHE_CHECK_INTERVAL_SECONDS, settings.GENCACHE_JITTER_MAX_SECONDS,
        key_prefix=settings.DEPLOY_ENV,
    )


if not hasattr(sys, '_doc_build'):  # redis-py connects lazily, so this opens no connection
    gen_cache = _build_gen_cache()
else:
    gen_cache = None


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
                # Pattern deletion not supported - caller can manually call clear() if needed
                logger.info(f"Pattern deletion not supported for {cache_backend}")
                return {
                    "success": False,
                    "method": "not_supported",
                    "backend": cache_backend,
                    "count": 0,
                    "message": f"Pattern deletion not supported for {cache_backend}. Use cache.clear() manually if full invalidation is needed."
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