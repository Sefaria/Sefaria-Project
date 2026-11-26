"""URL parity with live (PLAN.md §6.4), against the Django test client with the vendored snapshot imported.

The list is e2e-tests/developers/redirects/live-urls.json, recorded once from live by W17. Every entry
must answer with the status live recorded and, for a redirect, the same `Location` (live's are
relative except for external targets). The entries in its `deviations` table answer as that table
says instead, each with its reason. The browser-free twin of the Playwright suite DEV-RDR
(e2e-tests/developers/redirects/url-parity.spec.ts), so CI without a deployed host checks it too.
"""

import json
from urllib.parse import urlsplit

import pytest

from .machine_helpers import content, origin  # noqa: F401 - fixture
from .portal_helpers import REPO_ROOT, portal_client

LIVE_URLS = REPO_ROOT / "e2e-tests" / "developers" / "redirects" / "live-urls.json"
RECORD = json.loads(LIVE_URLS.read_text(encoding="utf-8"))
DEVIATIONS = RECORD["deviations"]

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("content")]


def expected(entry):
    """(status, location, how) for an entry: `how` is "exact" or "endswith"."""
    deviation = DEVIATIONS.get(entry["path"])
    if deviation is None:
        return entry["status"], entry["location"], "exact"
    if "locationEndsWith" in deviation:
        return deviation["status"], deviation["locationEndsWith"], "endswith"
    return deviation["status"], deviation.get("location"), "exact"


def relative_to_portal(location):
    """Our `Location` with this host's origin dropped, so it compares with live's relative ones."""
    if location and location.startswith(origin() + "/"):
        return location[len(origin()) :]
    return location


def test_record_is_complete():
    paths = [entry["path"] for entry in RECORD["entries"]]
    assert len(paths) == len(set(paths))
    sources = {source for entry in RECORD["entries"] for source in entry["sources"]}
    assert sources >= {"sitemap", "llms", "md-variant", "machine", "atlas-redirects", "static-llms", "hidden"}
    assert sum("sitemap" in entry["sources"] for entry in RECORD["entries"]) == 129
    assert sum("static-llms" in entry["sources"] for entry in RECORD["entries"]) == 31
    assert set(DEVIATIONS) <= set(paths)
    assert all(deviation.get("reason") for deviation in DEVIATIONS.values())


@pytest.mark.parametrize("entry", RECORD["entries"], ids=lambda entry: entry["path"])
def test_portal_answers_as_live(entry):
    status, location, how = expected(entry)
    path, _, query = entry["path"].partition("?")
    response = portal_client().get(path, QUERY_STRING=query)
    got = relative_to_portal(response.get("Location"))
    assert response.status_code == status, f"{entry['path']}: {response.status_code} (Location {got}), want {status}"
    if how == "endswith":
        assert got and urlsplit(got).path.endswith(location), f"{entry['path']}: Location {got}"
    else:
        assert got == location, f"{entry['path']}: Location {got}, want {location}"
