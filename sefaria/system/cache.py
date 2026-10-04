
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


class GenCache:
    """
    Replaces sefaria/system/multiserver/'s push-based cache sync (broadcast a method call
    over Redis pub/sub to every peer) with a pull-based one: a Redis INCR counter behind
    each tracked object, checked cheaply before a process's local copy is trusted.

    register() is called once per tracked object, typically at process startup (see
    sefaria.model.text.Library and sefaria.helper.webpages.get_website_cache). get() is the
    passive read path: on a process's first access, or whenever its last-seen generation
    doesn't match Redis's current one, it calls refresh_fn() and remembers the new
    generation. publish() is the write path: a writer that already has a fresh local value
    (it just built one, the same way the old code applied a change locally before calling
    ServerCoordinator.publish_event(obj, method, args)) hands it to publish(), which makes
    this process's own state reflect it immediately -- no waiting out CHECK_INTERVAL_SECONDS
    on a self-bump -- and bumps the counter so peers refresh on their next check.

    refresh_fn matters for objects with an existing shared-cache (Redis) tier in front of
    Mongo (sefaria.model.text.Library's "redis"-tier objects, per the migration decision
    record's §03 object inventory): it must reproduce that tier's own check-shared-cache-
    else-rebuild-from-Mongo logic, not just rebuild from Mongo unconditionally -- otherwise
    every process's first access (or every post-bump refresh) pays a full Mongo rebuild
    instead of a cheap shared-cache read, even when a peer already repopulated it. For
    "mongo"-tier objects with no shared-cache tier, refresh_fn is just the existing rebuild
    method itself.

    See the GenCache migration decision record for the full design and failure-mode analysis.
    """
    CHECK_INTERVAL_SECONDS = 2  # tune against real Redis QPS before finalizing
    JITTER_MAX_SECONDS = 3  # spreads a fleet-wide simultaneous-staleness event (e.g. Redis
                             # losing its keyspace) across a window instead of one instant

    def __init__(self, redis_client):
        self._data = {}            # key -> cached value
        self._gens = {}            # key -> last-applied generation
        self._last_checked = {}    # key -> monotonic time of last check
        self._refreshers = {}      # key -> (refresh_fn, redis_gen_key)
        self.redis = redis_client  # sentinel-aware master client; see sefaria.system.redis_sentinel

    def register(self, key: str, redis_gen_key: str, refresh_fn: Callable[[], Any]):
        """Called once per tracked object, normally at startup. Safe to call again for the
        same key (e.g. NonUniqueTerm's per-slug keys, registered lazily on first access)."""
        self._refreshers[key] = (refresh_fn, redis_gen_key)

    def get(self, key: str):
        refresh_fn, gen_key = self._refreshers[key]
        is_first_access = key not in self._data

        # Time-based throttle: bounds Redis QPS per key regardless of request volume.
        # Fires inline -- no external polling needed.
        now = time.monotonic()
        if not is_first_access and now - self._last_checked.get(key, 0) < self.CHECK_INTERVAL_SECONDS:
            return self._data[key]
        self._last_checked[key] = now

        try:
            redis_gen = self.redis.get(gen_key)
        except Exception:
            logger.error("GenCache: Redis unreachable checking %s; serving stale value", key)
            if not is_first_access:
                return self._data[key]
            redis_gen = None  # first-ever access with Redis down -> fall through

        if is_first_access or self._gens.get(key) != redis_gen:
            if not is_first_access:
                # A re-check found staleness, not a cold start: likely every process in the
                # fleet just found the same thing (e.g. Redis lost its keyspace on restart).
                # Jitter so they don't all hit Mongo/rebuild at the same instant.
                time.sleep(random.uniform(0, self.JITTER_MAX_SECONDS))
            self._data[key] = refresh_fn()
            self._gens[key] = redis_gen
        return self._data[key]

    def bump(self, redis_gen_key: str):
        """Low-level primitive: INCR the counter, nothing else. Prefer publish() for a
        tracked key that already has a fresh local value to go with the bump -- this is for
        the rare case (e.g. a generic Django-cache key with no GenCache-tracked local value
        of its own) where only peers need telling, not this process."""
        try:
            return self.redis.incr(redis_gen_key)
        except Exception:
            logger.error("GenCache: failed to bump %s; peers stay stale until the next bump", redis_gen_key)
            return None

    def publish(self, key: str, value):
        """
        Writer-side helper: value is already fresh (the caller just built and, if this is a
        redis-tier object, stored it) -- make this process's own GenCache state reflect it
        immediately, then bump the counter so peers refresh on their own next check. Returns
        value, so callers can write `return gen_cache.publish(key, value)`.
        """
        gen_key = self._refreshers[key][1]
        self._data[key] = value
        self._last_checked[key] = time.monotonic()
        new_gen = self.bump(gen_key)
        if new_gen is not None:
            self._gens[key] = str(new_gen)
        else:
            # bump() already logged; drop our own last-seen generation so the next get()
            # treats us the same as any other process racing to notice the (failed) change,
            # instead of wrongly believing we're already in sync with a gen we never wrote.
            self._gens.pop(key, None)
        return value

    def invalidate_local(self, key: str):
        """
        Drops this process's local copy of key, so its next get() treats the access as a
        cold start: always calls refresh_fn, bypassing both the throttle and the generation
        compare. For a caller that needs an immediate, synchronous view of a change in THIS
        process without waiting out CHECK_INTERVAL_SECONDS or touching Redis at all --
        mainly test fixtures that mutate Mongo directly and then need get() to see it right
        away, where the normal eventual-consistency window (by design, for everyone else) is
        exactly what the test is trying not to depend on.
        """
        self._data.pop(key, None)
        self._gens.pop(key, None)
        self._last_checked.pop(key, None)

def _build_gen_cache() -> GenCache:
    """
    sys._doc_build and test/script contexts that never touch Redis shouldn't fail importing
    this module merely for constructing a client -- redis-py connects lazily, so this never
    talks to the network itself; it's guarded the same way `cache`/`caches` above are.
    """
    from sefaria.system.redis_sentinel import RedisConfig, SentinelConfig, get_redis_client
    redis_config = RedisConfig(settings.REDIS_URL, settings.REDIS_PASSWORD, settings.REDIS_PORT)
    sentinel_config = SentinelConfig(
        settings.SENTINEL_HEADLESS_URL, settings.SENTINEL_PASSWORD, settings.REDIS_PORT,
        settings.SENTINEL_TRANSPORT_OPTS, settings.SENTINEL_MASTER_SET,
    )
    client = get_redis_client(redis_config, sentinel_config, settings.GENCACHE_REDIS_DB_NUM, decode_responses=True)
    return GenCache(client)


if not hasattr(sys, '_doc_build'):
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