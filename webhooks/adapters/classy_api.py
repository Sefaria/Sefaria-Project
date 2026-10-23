"""
The one outbound call this feature makes: Classy's supporter API, to find a donor's email
address when the webhook payload didn't include it.

It lives in webhooks/ rather than sefaria/donors/ so the domain never knows Classy has an
HTTP API. The task passes look_up_classy_supporter_email_address into the domain as a plain
function argument.

No token caching: donation volume is tens to hundreds a day, so one extra token request per
event is negligible, and caching would add expiry handling for no measurable gain.
"""

import requests
import structlog
from django.conf import settings

from sefaria.donors.types import (
    DonorEmailAddressCouldNotBeResolved,
    NormalizedEmailAddress,
    ReasonDonorEmailAddressCouldNotBeResolved,
)

logger = structlog.get_logger(__name__)

# A code constant, not a setting: Classy has no sandbox to switch to.
CLASSY_API_BASE_URL = "https://api.classy.org"
CLASSY_API_TIMEOUT_SECONDS = 10

CLASSY_API_CLIENT_ID = getattr(settings, "CLASSY_API_CLIENT_ID", None)
CLASSY_API_CLIENT_SECRET = getattr(settings, "CLASSY_API_CLIENT_SECRET", None)

# Module-level so connections are reused, and so webhooks/conftest.py can mount an adapter
# that refuses every request in tests.
classy_api_session = requests.Session()


class ClassyApiServerError(Exception):
    """Classy answered 5xx. Transient: the Celery task retries it."""


def look_up_classy_supporter_email_address(classy_supporter_id: int) -> NormalizedEmailAddress | DonorEmailAddressCouldNotBeResolved:
    # Raises (requests.Timeout, requests.ConnectionError, ClassyApiServerError) on transient
    # failures so the task can retry. Returns a final answer for everything retrying can't fix.
    if not (CLASSY_API_CLIENT_ID and CLASSY_API_CLIENT_SECRET):
        logger.warning("classy_api_not_configured", setting_names="CLASSY_API_CLIENT_ID, CLASSY_API_CLIENT_SECRET")
        return DonorEmailAddressCouldNotBeResolved(ReasonDonorEmailAddressCouldNotBeResolved.CLASSY_API_NOT_CONFIGURED)

    response = classy_api_session.get(
        f"{CLASSY_API_BASE_URL}/2.0/supporters/{classy_supporter_id}",
        headers={"Authorization": f"Bearer {_fetch_access_token()}"},
        timeout=CLASSY_API_TIMEOUT_SECONDS,
    )
    if response.status_code == 404:
        return DonorEmailAddressCouldNotBeResolved(ReasonDonorEmailAddressCouldNotBeResolved.CLASSY_SUPPORTER_NOT_FOUND)
    # A supporter that exists but belongs to another organization answers 403, not 404 (checked
    # against the live API). The supporter id comes from our own organization's webhook, so a 403
    # means the API app is attached to the wrong organization: a configuration problem, which
    # _raise_for_unsuccessful_response fails loudly on instead of reporting "not found".
    _raise_for_unsuccessful_response(response)

    email_address = NormalizedEmailAddress.parse(response.json().get("email_address"))
    if email_address is None:
        return DonorEmailAddressCouldNotBeResolved(ReasonDonorEmailAddressCouldNotBeResolved.CLASSY_SUPPORTER_HAS_NO_EMAIL_ADDRESS)
    return email_address


def _fetch_access_token() -> str:
    response = classy_api_session.post(
        f"{CLASSY_API_BASE_URL}/oauth2/auth",
        data={
            "grant_type": "client_credentials",
            "client_id": CLASSY_API_CLIENT_ID,
            "client_secret": CLASSY_API_CLIENT_SECRET,
        },
        timeout=CLASSY_API_TIMEOUT_SECONDS,
    )
    _raise_for_unsuccessful_response(response)
    return response.json()["access_token"]


def _raise_for_unsuccessful_response(response: requests.Response) -> None:
    # 5xx is transient (retry). Any other 4xx — bad credentials above all — is a configuration
    # problem that retrying can't fix, so it raises HTTPError, fails the task and reaches Sentry.
    if response.status_code >= 500:
        raise ClassyApiServerError(f"Classy API answered {response.status_code}")
    response.raise_for_status()
