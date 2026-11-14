import subprocess
from http.client import HTTPConnection
from urllib.parse import quote, urlparse

import structlog

from sefaria.settings import FRONT_END_URL, VARNISH_ADM_ADDR, VARNISH_FRNT_PORT, VARNISH_HOST, VARNISH_SECRET
from sefaria.utils.util import graceful_exception

logger = structlog.get_logger(__name__)

# Characters left unencoded in a URL path: RFC 3986 pchar plus the "/" separator. "%" is
# kept so an already percent-encoded segment (for example a version title) is not
# double-encoded. Everything else, notably a space, is percent-encoded.
_PATH_SAFE_CHARS = "/!$&'()*+,;=:@~%"


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
    # Percent-encode the path before it becomes the request target. Library category and
    # index names contain spaces (for example "Shulchan Arukh") and http.client rejects a
    # request target that holds a space, which aborted the PURGE. Varnish hashes the request
    # URL as received, so the encoded form is the key it must match.
    path = quote(url.path or "/", safe=_PATH_SAFE_CHARS)
    connection.request("PURGE", "%s?%s" % (path, url.query) if url.query else path, "", {"Host": url.hostname})
    response = connection.getresponse()
    if response.status != 200:
        logger.error(
            "Purge of {}{} on host {} failed with status: {}".format(
                path, "?" + url.query if url.query else "", url.hostname, response.status
            )
        )
    return response
