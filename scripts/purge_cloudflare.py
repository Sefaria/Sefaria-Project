# -*- coding: utf-8 -*-

import django
django.setup()
import argparse
from sefaria.system.cloudflare import SefariaCloudflareManager
from sefaria.utils.util import get_directory_content
from datetime import datetime
try:
    from sefaria.settings import USE_CLOUDFLARE
except ImportError as e:
    USE_CLOUDFLARE=False
import structlog
logger = structlog.getLogger('cloudflare')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("-f", "--files",
                            nargs='*',
                            type=str,
                            default=[],
                            help="list of files to purge")
    parser.add_argument("-t", "--timestamp", help="unix timestamp to purge files that are newer than", type=int, default=None)


    args = parser.parse_args()
    logger.info("purge cloudflare arguemnts: {}".format(args))
    if args.files:
        if USE_CLOUDFLARE:
            SefariaCloudflareManager().purge_batch_cloudflare_urls(args.files)
        else:
            logger.info("Files to purge: {}".format(args.files))
    elif args.timestamp:
        time_str = datetime.fromtimestamp(int(args.timestamp)).strftime('%Y-%m-%d %H:%M:%S') #this also serves to assert the timestamp is valid
        print("purging all static files {}".format(time_str))
        if USE_CLOUDFLARE:
            SefariaCloudflareManager().purge_static_files_from_cloudflare(timestamp=args.timestamp)
        else:
            logger.info("Files to purge: {}".format(get_directory_content("static", modified_after=args.timestamp)))
    else:
        print("purging all static files")
        if USE_CLOUDFLARE:
            SefariaCloudflareManager().purge_static_files_from_cloudflare()
        else:
            logger.info("Files to purge: {}".format(get_directory_content("static")))
