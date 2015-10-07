import re
from varnish import VarnishManager
from sefaria.model import *
from sefaria.local_settings import VARNISH_ADDR, VARNISH_SECRET, FRONT_END_URL

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

    if purge:
        # Purge this section level ref, so that immediate responses will return good results
        manager.run("purge_url", "{}/api/texts/{}".format(FRONT_END_URL, section_oref.url()))
        if version and lang:
            manager.run("purge_url", "{}/api/texts/{}/{}/{}".format(FRONT_END_URL, section_oref.url(), lang, version))
        # Hacky to add these
        manager.run("purge_url", "{}/api/texts/{}?commentary=1&sheets=1&notes=1".format(FRONT_END_URL, section_oref.url()))
        manager.run("purge_url", "{}/api/texts/{}?commentary=0".format(FRONT_END_URL, section_oref.url()))
        if version and lang:
            manager.run("purge_url", "{}/api/texts/{}/{}/{}?commentary=0".format(FRONT_END_URL, section_oref.url(), lang, version))

    # Ban anything underneath this section
    manager.run("ban", 'req.url ~ "{}"'.format(url_regex(oref.section_ref())), secret=secret)


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