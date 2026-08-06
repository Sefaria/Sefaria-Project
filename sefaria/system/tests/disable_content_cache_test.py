"""
Tests for the DISABLE_CONTENT_CACHE setting.

The setting exists so content-upload environments can serve editors their uploads immediately,
rather than a stale cached copy. It has three effects, each covered here: the @django_cache
decorator computes live, InMemoryCache reports a miss, and responses go out with `no-store`.
"""
from django.test import RequestFactory, override_settings
from django.http import HttpResponse

from sefaria.system.cache import django_cache, InMemoryCache, content_cache_disabled
from sefaria.system.middleware import DisableContentCacheMiddleware


LOCMEM_CACHE = {
    'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'},
}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def make_counting_view(**cache_kwargs):
    """Return a @django_cache-decorated function that counts how often its body actually runs."""
    calls = {"count": 0}

    @django_cache(cache_prefix="test_disable_content_cache_{}".format(id(calls)), **cache_kwargs)
    def view(arg):
        calls["count"] += 1
        return {"value": arg, "call": calls["count"]}

    return view, calls


def run_middleware(response, path='/'):
    request = RequestFactory().get(path)
    return DisableContentCacheMiddleware(lambda r: response).process_response(request, response)


# ============================================================================
# THE FLAG ITSELF
# ============================================================================

@override_settings(DISABLE_CONTENT_CACHE=True)
def test_content_cache_disabled_reads_setting():
    assert content_cache_disabled() is True


@override_settings(DISABLE_CONTENT_CACHE=False)
def test_content_cache_disabled_off_by_default():
    assert content_cache_disabled() is False


# ============================================================================
# @django_cache
# ============================================================================

@override_settings(DISABLE_CONTENT_CACHE=True, CACHES=LOCMEM_CACHE)
def test_django_cache_bypassed_when_disabled():
    view, calls = make_counting_view()

    first = view("Genesis 1")
    second = view("Genesis 1")

    assert calls["count"] == 2, "decorated function should run on every call"
    assert first["call"] == 1
    assert second["call"] == 2


@override_settings(DISABLE_CONTENT_CACHE=False, CACHES=LOCMEM_CACHE)
def test_django_cache_still_caches_when_enabled():
    view, calls = make_counting_view()

    view("Genesis 1")
    view("Genesis 1")

    assert calls["count"] == 1, "second call should have been served from cache"


@override_settings(DISABLE_CONTENT_CACHE=True, CACHES=LOCMEM_CACHE)
def test_django_cache_bypass_returns_unwrapped_data():
    """
    With decorate_data_with_key, a cache *hit* returns bare data while a miss returns a
    {key, data} wrapper. The bypass must match the hit shape, since that is what clients see
    against a normally-warm server.
    """
    view, _ = make_counting_view(decorate_data_with_key=True)

    result = view("Genesis 1")

    assert result == {"value": "Genesis 1", "call": 1}
    assert "data" not in result


@override_settings(DISABLE_CONTENT_CACHE=True, CACHES=LOCMEM_CACHE)
def test_django_cache_bypass_ignores_default_on_miss():
    """
    default_on_miss=True normally returns the default without ever calling the function, so an
    unpopulated endpoint serves None. Bypassing should compute the real answer instead.
    """
    view, calls = make_counting_view(default_on_miss=True, default_on_miss_value=None)

    result = view("Genesis 1")

    assert calls["count"] == 1
    assert result is not None


# ============================================================================
# InMemoryCache
# ============================================================================

@override_settings(DISABLE_CONTENT_CACHE=True)
def test_in_memory_cache_reports_miss_when_disabled():
    cache = InMemoryCache()
    cache.set("websites_data", ["a site"])

    assert cache.get("websites_data") is None


@override_settings(DISABLE_CONTENT_CACHE=False)
def test_in_memory_cache_returns_value_when_enabled():
    cache = InMemoryCache()
    cache.set("websites_data", ["a site"])

    assert cache.get("websites_data") == ["a site"]


# ============================================================================
# DisableContentCacheMiddleware
# ============================================================================

@override_settings(DISABLE_CONTENT_CACHE=True)
def test_middleware_sets_no_store_when_disabled():
    result = run_middleware(HttpResponse("text"), path='/Genesis.1')

    assert 'no-store' in result['Cache-Control']


@override_settings(DISABLE_CONTENT_CACHE=True)
def test_middleware_overrides_view_set_max_age():
    """Several content views set their own max-age; the middleware must win."""
    response = HttpResponse("text")
    response['Cache-Control'] = 'max-age=3600'

    result = run_middleware(response, path='/api/texts/Genesis.1')

    assert 'max-age=3600' not in result['Cache-Control']
    assert 'no-store' in result['Cache-Control']


@override_settings(DISABLE_CONTENT_CACHE=True)
def test_middleware_leaves_static_assets_alone():
    response = HttpResponse("body { }")
    response['Cache-Control'] = 'max-age=31536000, immutable'

    result = run_middleware(response, path='/static/css/s1.css')

    assert result['Cache-Control'] == 'max-age=31536000, immutable'


@override_settings(DISABLE_CONTENT_CACHE=False)
def test_middleware_is_noop_when_enabled():
    response = HttpResponse("text")
    response['Cache-Control'] = 'max-age=3600'

    result = run_middleware(response, path='/Genesis.1')

    assert result['Cache-Control'] == 'max-age=3600'
