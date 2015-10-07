
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
        manager.purge_url("{}/api/texts/{}".format(FRONT_END_URL, section_oref.url()))
        if version and lang:
            manager.purge_url("{}/api/texts/{}/{}/{}".format(FRONT_END_URL, section_oref.url(), lang, version))
        # Hacky to add these
        manager.purge_url("{}/api/texts/{}?commentary=1&sheets=1&notes=1".format(FRONT_END_URL, section_oref.url()))
        manager.purge_url("{}/api/texts/{}?commentary=0".format(FRONT_END_URL, section_oref.url()))
        if version and lang:
            manager.purge_url("{}/api/texts/{}/{}/{}?commentary=0".format(FRONT_END_URL, section_oref.url(), lang, version))

    # Ban anything underneath this section
    manager.ban('req.url ~ "{}"'.format(oref.section_ref().url_regex()), secret=secret)
