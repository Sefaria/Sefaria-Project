from varnish import VarnishManager
from urlparse import urlparse
from httplib import HTTPConnection
from sefaria.local_settings import VARNISH_ADM_ADDR, VARNISH_HOST, VARNISH_FRNT_PORT, VARNISH_SECRET, FRONT_END_URL

import logging
logger = logging.getLogger(__name__)


with open (VARNISH_SECRET, "r") as sfile:
    secret=sfile.read().replace('\n', '')
manager = VarnishManager([VARNISH_ADM_ADDR])


# PyPi version of python-varnish has broken purge function.  We use this instead.
# Derived from https://github.com/justquick/python-varnish/blob/master/varnish.py
def purge_url(url):
    """
    Do an HTTP PURGE of the given asset.
    The URL is run through urlparse and must point to the varnish instance not the varnishadm
    """
    url = urlparse(url)
    connection = HTTPConnection(VARNISH_HOST, VARNISH_FRNT_PORT)
    path = url.path or '/'
    connection.request('PURGE', '%s?%s' % (path, url.query) if url.query else path, '',
                       {'Host': url.hostname})
    response = connection.getresponse()
    if response.status != 200:
        logger.error(u'Purge of {}{} on host {} failed with status: {}'.format(path,
                                                                                  u"?" + url.query if url.query else u'',
                                                                                  url.hostname,
                                                                                  response.status))
    return response


