"""
Shared pytest guards for the donor-status webhook tests.

Two things these tests must never do, because a local run uses the developer's REAL
services (sefaria/system/database.py only switches to a test database when
sys._called_from_test is set, which sefaria/conftest.py does — and that conftest does not
apply under webhooks/):

  1. Call the real Classy API. For the duration of each test, the client's module-level
     requests.Session gets adapters that refuse every request. monkeypatch restores the
     real adapters afterwards.
  2. Write to Mongo profiles, or construct a UserProfile for a real email address (the
     constructor SAVES a new profile document when a Django user exists without one — see
     the `if self.exists() and not user_registration:` block in UserProfile.__init__).
     Both donor_recording seams (find_user_id_by_email_creating_profile_if_missing,
     apply_update_to_user_profile) are replaced with functions that fail loudly; a test
     that needs them patches them with its own fake.

Both target modules import cheaply (no Mongo at import time), so they are imported directly:
a real import error in either must fail the run loudly instead of silently disabling a guard.

All fixtures are function-scoped and autouse.
"""

from collections import OrderedDict

import pytest
from requests.adapters import BaseAdapter

from sefaria.donors import donor_recording
from webhooks.adapters import classy_api


class RefuseNetworkAdapter(BaseAdapter):
    """A requests adapter that fails every request instead of sending it."""

    def send(self, request, stream=False, timeout=None, verify=True, cert=None, proxies=None):
        raise RuntimeError(
            f"Tests must not call the real Classy API ({request.method} {request.url}). "
            "Patch the session's get/post with a fake."
        )

    def close(self):
        pass


@pytest.fixture(autouse=True)
def refuse_real_classy_api_calls(monkeypatch):
    # Session.adapters is an OrderedDict of URL prefix -> adapter. Replacing the whole dict
    # through monkeypatch (rather than calling session.mount) means the real adapters come
    # back after each test instead of staying refused for the rest of the process.
    monkeypatch.setattr(
        classy_api.classy_api_session,
        "adapters",
        OrderedDict([("https://", RefuseNetworkAdapter()), ("http://", RefuseNetworkAdapter())]),
    )


@pytest.fixture(autouse=True)
def refuse_real_profile_reads_and_writes(monkeypatch):
    def refuse(*args, **kwargs):
        raise RuntimeError(
            "Tests must not read or write real user profiles. Patch "
            "sefaria.donors.donor_recording.find_user_id_by_email_creating_profile_if_missing / "
            "apply_update_to_user_profile with a fake."
        )

    monkeypatch.setattr(donor_recording, "find_user_id_by_email_creating_profile_if_missing", refuse)
    monkeypatch.setattr(donor_recording, "apply_update_to_user_profile", refuse)
