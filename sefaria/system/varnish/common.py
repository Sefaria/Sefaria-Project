import subprocess
from http.client import HTTPConnection
from urllib.parse import quote, urlparse

import structlog

from sefaria.settings import FRONT_END_URL, VARNISH_ADM_ADDR, VARNISH_FRNT_PORT, VARNISH_HOST, VARNISH_SECRET
from sefaria.utils.util import graceful_exception

logger = structlog.get_logger(__name__)

# Characters a client leaves unencoded in a request target. Keeping them matches the URL Varnish
# stored as its cache key, and keeping "%" keeps an already percent-encoded target as it is.
_PATH_SAFE = "/%:@!$&'()*+,;=-._~"
_QUERY_SAFE = "=&%/:@!$'()*+,;?-._~"


def request_target(path, query=""):
    target = quote(path, safe=_PATH_SAFE)
    return "%s?%s" % (target, quote(query, safe=_QUERY_SAFE)) if query else target


@graceful_exception(logger=logger, return_value=None)
def ban_url(url):
    args = ["varnishadm", "-T", VARNISH_ADM_ADDR, "-S", VARNISH_SECRET, "ban", f"obj.http.url ~ {url}"]
    subprocess.run(args, check=True)


@graceful_exception(logger=logger, return_value=None)
def purge_url(url):
    """
    Do an HTTP PURGE of the given asset.
    The URL is run through urlparse and must point to the varnish instance not the varnishadm
    """
    url = urlparse(url)
    connection = HTTPConnection(VARNISH_HOST, VARNISH_FRNT_PORT)
    path = url.path or "/"
    connection.request("PURGE", request_target(path, url.query), "", {"Host": url.hostname})
    response = connection.getresponse()
    if response.status != 200:
        logger.error(
            "Purge of {}{} on host {} failed with status: {}".format(
                path, "?" + url.query if url.query else "", url.hostname, response.status
            )
        )
    return response
