from sefaria.settings import CLOUDFLARE_ZONE, CLOUDFLARE_EMAIL, CLOUDFLARE_TOKEN


def purge_cloudflare_url(path):
    """ Calls the Cloudflare API to invalidate cache for the file at current site and `path`"""
    import requests
    import json
    from django.contrib.sites.models import Site

    current_site = Site.objects.get_current()
    domain = current_site.domain
    files = ["http://{}{}".format(domain, path)]
    url = 'https://api.cloudflare.com/client/v4/zones/%s/purge_cache' % CLOUDFLARE_ZONE
    payload = {"files": files}
    headers = {
        "X-Auth-Email": CLOUDFLARE_EMAIL,
        "X-Auth-Key": CLOUDFLARE_TOKEN,
        "Content-Type": "application/json",
    }
    r = requests.delete(url, data=json.dumps(payload), headers=headers)
    return r


def purge_cloudflare():
    """Purge the entire Cloudflare cache"""
    import requests
    import json

    url = 'https://api.cloudflare.com/client/v4/zones/%s/purge_cache' % CLOUDFLARE_ZONE
    headers = {
        "X-Auth-Email": CLOUDFLARE_EMAIL,
        "X-Auth-Key": CLOUDFLARE_TOKEN,
        "Content-Type": "application/json",
    }
    r = requests.delete(url, data=json.dumps({"purge_everything":True}), headers=headers)
    return r


def purge_static_files_from_cloudflare():
    pass