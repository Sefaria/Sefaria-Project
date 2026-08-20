import secrets
import uuid

import pytest
from unittest.mock import patch, MagicMock

from django.contrib.auth.models import User

from sefaria.helper.library_assistant import SETTING_KEY
from sefaria.model.user_profile import UserProfile
from sefaria.system.database import db

# These tests assert on and delete Mongo `profiles` documents keyed by the Django
# user id — but Mongo is not swapped for a test database the way Postgres is. Both
# a developer's local Mongo and the shared CI sandbox Mongo are restored from the
# public dump, which ships hundreds of thousands of real profile documents,
# including dozens at the single- and double-digit ids a fresh test Postgres hands
# out. Every test user therefore gets an id above this floor, where no real user
# can exist. User.pk is a 32-bit AutoField, so the floor must stay under 2**31 - 1.
# Keep in sync with the copy in build/ci/cleanup_test_data.py.
SYNTHETIC_USER_ID_FLOOR = 2_000_000_000


def create_test_user(prefix, superuser=False):
    """Create a Django user whose id is unmistakably synthetic."""
    token = uuid.uuid4().hex
    factory = User.objects.create_superuser if superuser else User.objects.create_user
    return factory(
        id=SYNTHETIC_USER_ID_FLOOR + secrets.randbelow(100_000_000),
        username=f"{prefix}-{token}",
        email=f"{prefix}-{token}@example.com",
        password="password",
    )


def purge_test_profiles(*users):
    """Delete the Mongo profile docs of synthetic users — and refuse anything else."""
    ids = [getattr(u, "id", u) for u in users]
    real = [i for i in ids if i < SYNTHETIC_USER_ID_FLOOR]
    assert not real, f"refusing to delete profile docs for non-synthetic user ids {real}"
    db.profiles.delete_many({"id": {"$in": ids}})


def make_keyless_profile(user):
    """
    Give `user` a pre-migration-shaped profile: the doc exists but carries no
    Library Assistant key. Profile creation writes the key on every path, so the
    only way to model these legacy users is to create the doc and then unset it.
    """
    UserProfile(id=user.id)
    db.profiles.update_one({"id": user.id}, {"$unset": {f"settings.{SETTING_KEY}": ""}})


@pytest.fixture(autouse=True)
def _block_salesforce_webhook():
    """
    Prevent any test from making real HTTP calls to the Salesforce webhook.

    sefaria/conftest.py carries the same guard; autouse fixtures only apply to tests
    under their own conftest's directory, so each tree needs its own.
    """
    with patch("sefaria.helper.crm.tasks.requests.post") as mock_post:
        mock_post.return_value = MagicMock(
            status_code=200,
            json=MagicMock(return_value={"success": True}),
            raise_for_status=MagicMock(),
        )
        yield mock_post
