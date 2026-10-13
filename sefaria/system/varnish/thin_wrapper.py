# Varnish wrapper that does not depend on core code.  Used for the multiserver monitor.

import structlog

from sefaria.utils.util import graceful_exception

from .common import FRONT_END_URL, ban_url, purge_url

logger = structlog.get_logger(__name__)


@graceful_exception(logger=logger, return_value=None)
def invalidate_title(title):
    title = title.replace(" ", "_").replace(":", ".")

    # Parallel to sefaria.system.varnish.wrapper.invalidate_index()
    purge_url(f"{FRONT_END_URL}/api/index/{title}")
    purge_url(f"{FRONT_END_URL}/api/v2/raw/index/{title}")
    purge_url(f"{FRONT_END_URL}/api/v2/index/{title}")
    purge_url(f"{FRONT_END_URL}/api/v2/index/{title}?with_content_counts=1")

    # Parallel to sefaria.system.varnish.wrapper.invalidate_counts()
    purge_url(f"{FRONT_END_URL}/api/preview/{title}")
    purge_url(f"{FRONT_END_URL}/api/counts/{title}")
    purge_url(f"{FRONT_END_URL}/api/v2/index/{title}?with_content_counts=1")

    # Parallel to base of sefaria.system.varnish.wrapper.invalidate_title()
    ban_url(f"/api/texts/{title}")
    ban_url(f"/api/links/{title}")
