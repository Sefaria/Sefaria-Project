import pytest

from sefaria.model import Ref


@pytest.fixture
def ref_cache_guard():
    """
    Ensure each test starts with a clean cache and restore the original limit afterwards.
    """
    ref_cls = Ref
    original_limit = getattr(ref_cls, "_tref_oref_cache_limit", 60000)
    if not hasattr(ref_cls, "_tref_oref_cache_limit"):
        ref_cls._tref_oref_cache_limit = original_limit
    Ref.clear_cache()
    yield ref_cls
    Ref.clear_cache()
    ref_cls._tref_oref_cache_limit = original_limit


def test_ref_cache_respects_limit(ref_cache_guard):
    ref_cls = ref_cache_guard
    new_limit = 6
    ref_cls._tref_oref_cache_limit = new_limit

    first_ref = Ref("Genesis 1:1")
    first_uid = first_ref.uid()

    additional_refs = [
        "Genesis 1:2",
        "Genesis 1:3",
        "Genesis 1:4",
        "Genesis 1:5",
        "Genesis 1:6",
        "Genesis 1:7",
    ]
    for tref in additional_refs:
        Ref(tref)

    assert Ref.cache_size() == new_limit
    cache_keys = set(Ref._raw_cache().keys())
    assert first_ref.tref not in cache_keys
    assert first_uid not in cache_keys
