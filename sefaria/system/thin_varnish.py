# Varnish wrapper that does not depend on core code.  Used for the multiserver monitor.

from varnish_util import manager, secret, purge_url, FRONT_END_URL


def invalidate_title(title):
    title = title.replace(" ", "_").replace(":", ".")

    # Parallel to sf_varnish.invalidate_index()
    purge_url("{}/api/index/{}".format(FRONT_END_URL, title))
    purge_url("{}/api/v2/raw/index/{}".format(FRONT_END_URL, title))
    purge_url("{}/api/v2/index/{}".format(FRONT_END_URL, title))
    purge_url("{}/api/v2/index/{}?with_content_counts=1".format(FRONT_END_URL, title))

    # Parallel to sf_varnish.invalidate_counts()
    purge_url("{}/api/preview/{}".format(FRONT_END_URL, title))
    purge_url("{}/api/counts/{}".format(FRONT_END_URL, title))
    purge_url("{}/api/v2/index/{}?with_content_counts=1".format(FRONT_END_URL, title))

    # Parallel to base of sf_varnish.invalidate_title()
    manager.run("ban", 'obj.http.url ~ "/api/texts/{}"'.format(title), secret=secret)
    manager.run("ban", 'obj.http.url ~ "/api/links/{}"'.format(title), secret=secret)

