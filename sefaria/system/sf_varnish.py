import re
from varnish import VarnishManager
from sefaria.model import *
from sefaria.local_settings import VARNISH_ADDR, VARNISH_SECRET, FRONT_END_URL
from urlparse import urlparse
from httplib import HTTPConnection
import logging
logger = logging.getLogger(__name__)

with open (VARNISH_SECRET, "r") as sfile:
    secret=sfile.read().replace('\n', '')
manager = VarnishManager([VARNISH_ADDR])


def invalidate_ref(oref, lang=None, version=None, purge=False):
    """
    Called when 'ref' is changed.
    We aim to PURGE the main page, so that the results of any save will be immediately visible to the person editing.
    All other implications are handled with a blanket BAN.

    todo: Tune this so as not to ban when the version changed is not a displayed version
    """
    assert isinstance(oref, Ref)
    section_oref = oref.section_ref()
    if version:
        version = version.replace(" ", "_")
    if purge:
        # Purge this section level ref, so that immediate responses will return good results
        purge_url("{}/api/texts/{}".format(FRONT_END_URL, section_oref.url()))
        if version and lang:
            purge_url("{}/api/texts/{}/{}/{}".format(FRONT_END_URL, section_oref.url(), lang, version))
        # Hacky to add these
        purge_url("{}/api/texts/{}?commentary=1&sheets=1".format(FRONT_END_URL, section_oref.url()))
        purge_url("{}/api/texts/{}?sheets=1".format(FRONT_END_URL, section_oref.url()))
        purge_url("{}/api/texts/{}?commentary=0".format(FRONT_END_URL, section_oref.url()))
        purge_url("{}/api/texts/{}?commentary=0&pad=0".format(FRONT_END_URL, section_oref.url()))
        if version and lang:
            purge_url("{}/api/texts/{}/{}/{}?commentary=0".format(FRONT_END_URL, section_oref.url(), lang, version))

        purge_url("{}/api/links/{}".format(FRONT_END_URL, section_oref.url()))
        purge_url("{}/api/links/{}?with_text=0".format(FRONT_END_URL, section_oref.url()))
        purge_url("{}/api/links/{}?with_text=1".format(FRONT_END_URL, section_oref.url()))

    # Ban anything underneath this section
    manager.run("ban", 'obj.http.url ~ "/api/texts/{}"'.format(url_regex(oref.section_ref())), secret=secret)
    manager.run("ban", 'obj.http.url ~ "/api/links/{}"'.format(url_regex(oref.section_ref())), secret=secret)

def invalidate_counts(indx):
    assert isinstance(indx, Index)

    purge_url("{}/api/preview/{}".format(FRONT_END_URL, indx.title))
    purge_url("{}/api/counts/{}".format(FRONT_END_URL, indx.title))

    # Assume this is unnecesary, given that the specific URLs will have been purged/banned by he save action
    # oref = Ref(indx.title)
    # invalidate_ref(oref)

def invalidate_index(indx):
    assert isinstance(indx, Index)

    purge_url("{}/api/index/{}".format(FRONT_END_URL, indx.title))
    purge_url("{}/api/v2/raw/index/{}".format(FRONT_END_URL, indx.title))
    purge_url("{}/api/v2/index/{}".format(FRONT_END_URL, indx.title))

#PyPi version of python-varnish has broken purge function.  We use this instead.
def purge_url(url):
    """
    Do an HTTP PURGE of the given asset.
    The URL is run through urlparse and must point to the varnish instance not the varnishadm
    """
    url = urlparse(url)
    connection = HTTPConnection(url.hostname, url.port or 80)
    path = url.path or '/'
    connection.request('PURGE', '%s?%s' % (path, url.query) if url.query else path, '',
                       {'Host': '%s:%s' % (url.hostname, url.port) if url.port else url.hostname})
    response = connection.getresponse()
    if response.status != 200:
        logger.error('Purge failed with status: %s' % response.status)
    return response


def url_regex(ref):
    """
    :return string: Returns a non-anchored regular expression part that will match normally formed URLs of this Ref and any more specific Ref.
    E.g., "Genesis 1" yields an RE that match "Genesis.1" and "Genesis.1.3"
    Result is hyper slashed, as Varnish likes.
    """

    assert isinstance(ref, Ref)

    patterns = []

    if ref.is_range():
        if ref.is_spanning():
            s_refs = ref.split_spanning_ref()
            normals = []
            for s_ref in s_refs:
                normals += [r.normal() for r in s_ref.range_list()]
        else:
            normals = [r.normal() for r in ref.range_list()]

        for r in normals:
            sections = re.sub("^%s" % re.escape(ref.book), '', r).replace(":", r"\\.").replace(" ", r"\\.")
            patterns.append("%s$" % sections)   # exact match
            patterns.append(r"%s\\." % sections)   # more granualar, exact match followed by .
    else:
        sections = re.sub("^%s" % re.escape(ref.book), '', ref.normal()).replace(":", r"\\.").replace(" ", r"\\.")
        patterns.append("%s$" % sections)   # exact match
        if ref.index_node.has_titled_continuation():
            patterns.append(u"{}({}).".format(sections, u"|".join([s.replace(" ","_") for s in ref.index_node.title_separators])))

        elif ref.index_node.has_numeric_continuation():
            patterns.append(r"%s\\." % sections)   # more granualar, exact match followed by .

    return r"%s(%s)" % (re.escape(ref.book).replace(" ","_").replace("\\", "\\\\"), "|".join(patterns))


