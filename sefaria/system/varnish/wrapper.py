# Varnish wrapper used by web server.
# There is also a parallel file thin_wrapper.py, which does not rely on core code - used for the multiserver monitor.

import re
import urllib.error
import urllib.parse
import urllib.request

import structlog

from sefaria.model import *
from sefaria.system.exceptions import InputError
from sefaria.utils.util import graceful_exception

from .common import FRONT_END_URL, ban_url, purge_url

logger = structlog.get_logger(__name__)


@graceful_exception(logger=logger, return_value=None)
def invalidate_ref(oref, lang=None, version=None, purge=False):
    """
    Called when 'ref' is changed.
    We aim to PURGE the main page, so that the results of any save will be immediately visible to the person editing.
    All other implications are handled with a blanket BAN.

    todo: Tune this so as not to ban when the version changed is not a displayed version
    """
    if not isinstance(oref, Ref):
        return

    if getattr(oref.index_node, "depth", False) and len(oref.sections) >= oref.index_node.depth - 1:
        oref = oref.section_ref()

    if version:
        version = urllib.parse.quote(version.replace(" ", "_").encode("utf-8"))
    if purge:
        # Purge this section level ref, so that immediate responses will return good results
        purge_url(f"{FRONT_END_URL}/api/v3/texts/{oref.url()}")
        # Hacky to add these
        purge_url(f"{FRONT_END_URL}/api/texts/{oref.url()}?commentary=1&sheets=1")
        purge_url(f"{FRONT_END_URL}/api/texts/{oref.url()}?sheets=1")
        purge_url(f"{FRONT_END_URL}/api/texts/{oref.url()}?commentary=0")
        purge_url(f"{FRONT_END_URL}/api/texts/{oref.url()}?commentary=0&pad=0")
        if version and lang:
            try:
                purge_url(f"{FRONT_END_URL}/api/texts/{oref.url()}/{lang}/{version}?commentary=0")
            except Exception as e:
                logger.exception(e)
        purge_url(f"{FRONT_END_URL}/api/links/{oref.url()}")
        purge_url(f"{FRONT_END_URL}/api/links/{oref.url()}?with_text=0")
        purge_url(f"{FRONT_END_URL}/api/links/{oref.url()}?with_text=1")
        purge_url(f"{FRONT_END_URL}/api/related/{oref.url()}")
        purge_url(f"{FRONT_END_URL}/api/related/{oref.url()}?with_sheet_links=1")
        purge_url(f"{FRONT_END_URL}/api/related/{oref.url()}?with_sheet_links=0")

    # Ban anything underneath this section
    ban_url(f"/api/v3/texts/{url_regex(oref)}")
    ban_url(f"/api/links/{url_regex(oref)}")
    ban_url(f"/api/related/{url_regex(oref)}")


def invalidate_linked(oref):
    for linkref in {r.section_ref() for r in oref.linkset().refs_from(oref)}:
        try:
            invalidate_ref(linkref)
        except UnicodeDecodeError:
            logger.warn(f"Unable to invalidate {linkref.normal()}. We cannot invalidate unicode at this time")


@graceful_exception(logger=logger, return_value=None, exception_type=UnicodeDecodeError)
def invalidate_counts(indx):
    if isinstance(indx, Index):
        oref = Ref(indx.title)
        url = oref.url()
    elif isinstance(indx, str):
        url = indx.replace(" ", "_").replace(":", ".")
    else:
        logger.warn(f"Could not parse index '{indx}' to purge counts from Varnish.")
        return

    purge_url(f"{FRONT_END_URL}/api/preview/{url}")
    purge_url(f"{FRONT_END_URL}/api/counts/{url}")
    purge_url(f"{FRONT_END_URL}/api/v2/index/{url}?with_content_counts=1")

    # Assume this is unnecesary, given that the specific URLs will have been purged/banned by the save action
    # oref = Ref(indx.title)
    # invalidate_ref(oref)


@graceful_exception(logger=logger, return_value=None)
def invalidate_index(indx):
    if isinstance(indx, Index):
        try:
            oref = Ref(indx.title)
            url = oref.url()
        except InputError:
            logger.warn(f"In sf.varnish.invalidate_index(): failed to instantiate ref for index name: {(indx.title)}")
            return
    elif isinstance(indx, str):
        url = indx.replace(" ", "_").replace(":", ".")
    else:
        logger.warn(f"Could not parse index '{indx}' to purge from Varnish.")
        return

    purge_url(f"{FRONT_END_URL}/api/index/{url}")
    purge_url(f"{FRONT_END_URL}/api/v2/raw/index/{url}")
    purge_url(f"{FRONT_END_URL}/api/v2/index/{url}")
    purge_url(f"{FRONT_END_URL}/api/v2/index/{url}?with_content_counts=1")


@graceful_exception(logger=logger, return_value=None)
def invalidate_title(title):
    title = title.replace(" ", "_").replace(":", ".")
    invalidate_index(title)
    invalidate_counts(title)
    ban_url(f"/api/v3/texts/{title}")
    ban_url(f"/api/links/{title}")


def invalidate_all():
    ban_url(".*")


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
            sections = re.sub("^%s" % re.escape(ref.book), "", r).replace(":", r"\\.").replace(" ", r"\\.")
            patterns.append("%s$" % sections)  # exact match
            patterns.append(r"%s\\?" % sections)  # Exact match with '?' afterwards
            patterns.append(r"%s\\/" % sections)  # Exact match with '/' afterwards
            patterns.append(r"%s\\." % sections)  # more granualar, exact match followed by .
    else:
        sections = re.sub("^%s" % re.escape(ref.book), "", ref.normal()).replace(":", r"\\.").replace(" ", r"\\.")
        patterns.append("%s$" % sections)  # exact match
        patterns.append(r"%s\\?" % sections)  # Exact match with '?' afterwards
        patterns.append(r"%s\\/" % sections)  # Exact match with '/' afterwards
        if ref.index_node.has_titled_continuation():
            patterns.append(
                "{}({}).".format(sections, "|".join([s.replace(" ", "_") for s in ref.index_node.title_separators])),
            )

        elif ref.index_node.has_numeric_continuation():
            patterns.append(r"%s\\." % sections)  # more granualar, exact match followed by .

    return r"%s(%s)" % (re.escape(ref.book).replace(" ", "_").replace("\\", "\\\\"), "|".join(patterns))
