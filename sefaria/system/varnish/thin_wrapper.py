# Varnish wrapper that does not depend on core code.  Used for the multiserver monitor.

from .common import ban_url, purge_url, FRONT_END_URL
from sefaria.utils.util import graceful_exception

import structlog
logger = structlog.get_logger(__name__)


@graceful_exception(logger=logger, return_value=None)
def invalidate_title(title):
    title = title.replace(" ", "_").replace(":", ".")

    # Parallel to sefaria.system.varnish.wrapper.invalidate_index()
    purge_url("{}/api/index/{}".format(FRONT_END_URL, title))
    purge_url("{}/api/v2/raw/index/{}".format(FRONT_END_URL, title))
    purge_url("{}/api/v2/index/{}".format(FRONT_END_URL, title))
    purge_url("{}/api/v2/index/{}?with_content_counts=1".format(FRONT_END_URL, title))

    # Parallel to sefaria.system.varnish.wrapper.invalidate_counts()
    purge_url("{}/api/preview/{}".format(FRONT_END_URL, title))
    purge_url("{}/api/counts/{}".format(FRONT_END_URL, title))
    purge_url("{}/api/v2/index/{}?with_content_counts=1".format(FRONT_END_URL, title))

    # Parallel to base of sefaria.system.varnish.wrapper.invalidate_title()
    ban_url("/api/texts/{}".format(title))
    ban_url("/api/links/{}".format(title))
