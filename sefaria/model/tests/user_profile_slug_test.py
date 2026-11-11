"""
UserProfile.assign_slug() against REAL MongoDB.

Each test uses a user id far above any real one and a slug base no real profile has, and deletes
what it inserted afterwards. There is no Django user with that id, which UserProfile handles by
falling back to placeholder names, so the tests set first_name/last_name themselves.
"""

import random
import re
from unittest.mock import patch

import pytest

from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db


@pytest.fixture
def unused_user_id():
    user_id = random.randrange(10**12, 2 * 10**12)
    assert db.profiles.find_one({"id": user_id}) is None
    yield user_id
    db.profiles.delete_many({"id": user_id})


@pytest.fixture
def unique_name():
    """A first/last name pair whose slug base no real profile uses."""
    token = f"slugtest{random.randrange(10**12)}"
    base = f"{token}-cohen"
    assert db.profiles.find_one({"slug": {"$regex": f"^{base}"}}) is None
    yield token, "Cohen", base
    db.profiles.delete_many({"slug": {"$regex": f"^{base}"}})


def profile_named(user_id, first, last):
    p = UserProfile(id=user_id)
    p.first_name = first
    p.last_name = last
    return p


def test_free_base_is_used_as_is(unused_user_id, unique_name):
    first, last, base = unique_name
    assert profile_named(unused_user_id, first, last).assign_slug().slug == base


def test_takes_the_first_free_number(unused_user_id, unique_name):
    first, last, base = unique_name
    # base1 is free while base and base2 are taken: the gap is used, as before.
    db.profiles.insert_many([{"id": -1, "slug": base}, {"id": -1, "slug": f"{base}2"}])
    try:
        assert profile_named(unused_user_id, first, last).assign_slug().slug == f"{base}1"
    finally:
        db.profiles.delete_many({"id": -1, "slug": {"$regex": f"^{base}"}})


def test_other_slugs_with_the_same_prefix_do_not_count(unused_user_id, unique_name):
    first, last, base = unique_name
    # "base-levi" starts with base but isn't base followed by digits.
    db.profiles.insert_one({"id": -1, "slug": f"{base}-levi"})
    try:
        assert profile_named(unused_user_id, first, last).assign_slug().slug == base
    finally:
        db.profiles.delete_many({"id": -1, "slug": {"$regex": f"^{base}"}})


def test_reads_taken_slugs_in_one_query(unused_user_id, unique_name):
    first, last, base = unique_name
    db.profiles.insert_many([{"id": -1, "slug": base}] + [{"id": -1, "slug": f"{base}{n}"} for n in range(1, 50)])
    try:
        p = profile_named(unused_user_id, first, last)
        with patch.object(db.profiles, "find_one", side_effect=AssertionError("no per-number lookups")):
            assert p.assign_slug().slug == f"{base}50"
    finally:
        db.profiles.delete_many({"id": -1, "slug": {"$regex": f"^{base}"}})


def test_name_without_latin_letters_or_digits_keeps_the_dash_convention(unused_user_id):
    # A Hebrew name reduces to "-", so the slug is "-" or "-N", as before. The test db may
    # already have such slugs, so only the shape is checked, plus that the slug is free.
    slug = profile_named(unused_user_id, "יוסי", "כהן").assign_slug().slug
    assert re.fullmatch(r"-[0-9]*", slug)
    assert db.profiles.find_one({"slug": slug}) is None


def test_own_slug_is_not_counted_as_taken(unused_user_id, unique_name):
    first, last, base = unique_name
    p = profile_named(unused_user_id, first, last)
    p.assign_slug()
    p.save()
    reloaded = profile_named(unused_user_id, first, last)
    assert reloaded.assign_slug().slug == base
