import requests
import json
from django.contrib.sites.models import Site

from sefaria.settings import CLOUDFLARE_ZONE, CLOUDFLARE_EMAIL, CLOUDFLARE_TOKEN, USE_CLOUDFLARE, STATICFILES_DIRS
from sefaria.utils.util import list_chunks, in_directory, get_directory_content

import structlog
logger = structlog.get_logger(__name__)


class SefariaCloudflareManager(object):

    valid_cached_dirs = ["static"]
    max_cloudflare_payload_size = 30

    def purge_cloudflare_url(self, path, preprocessed=False):
        """ Calls the Cloudflare API to invalidate cache for the file at current site and `path`"""
        return self.purge_multiple_cloudflare_urls([path], preprocessed=preprocessed)

    def purge_cloudflare(self):
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
        logger.info(r.json())

    def _file_in_cached_dirs(self, file):
        return any(in_directory(file, dirname) for dirname in self.valid_cached_dirs)

    def _filter_files_payload(self, files):
        return [item for item in files if self._file_in_cached_dirs(item)]

    def purge_batch_cloudflare_urls(self, files, filter_cached_dirs=True, preprocessed=False):
        """
        Calls the Cloudflare API to invalidate cache for multiple input files.
        Splits into required length of cloudflare max files. Makes sure urls are valid at current site and `path`
        """
        if filter_cached_dirs:
            files = self._filter_files_payload(files)
        files_chunks = list_chunks(files, self.max_cloudflare_payload_size)
        for chunk in files_chunks:
            self.purge_multiple_cloudflare_urls(chunk, preprocessed=preprocessed)

    def purge_static_files_from_cloudflare(self, timestamp=None):
        files_to_purge = []
        for dirname in self.valid_cached_dirs:
            files_to_purge += get_directory_content(dirname, modified_after=timestamp)
        self.purge_batch_cloudflare_urls(files_to_purge, filter_cached_dirs=False, preprocessed=False)

    def purge_multiple_cloudflare_urls(self, files, preprocessed=False):
        """ Calls the Cloudflare API to invalidate cache for the given files"""
        if len(files) > self.max_cloudflare_payload_size:
            logger.error("Too many files to purge {}".format(files))
            raise ValueError("Too many files passed to purge.")
        if not preprocessed:
            current_site = Site.objects.get_current()
            domain = current_site.domain
            files = ["https://{}/{}".format(domain, path) for path in files]
        url = 'https://api.cloudflare.com/client/v4/zones/%s/purge_cache' % CLOUDFLARE_ZONE
        logger.info("About to purge: {}".format(files))
        payload = {"files": files}
        headers = {
            "X-Auth-Email": CLOUDFLARE_EMAIL,
            "X-Auth-Key": CLOUDFLARE_TOKEN,
            "Content-Type": "application/json",
        }
        r = requests.delete(url, data=json.dumps(payload), headers=headers)
        r = r.json()
        if not r["success"]:
            logger.warn(r)
        else:
            logger.info(r)
