# -*- coding: utf-8 -*-

import argparse
import json
import urllib
import urllib2

from sefaria.model import *
from sefaria.datatype.jagged_array import JaggedTextArray, JaggedArray

try:
    from sefaria.local_settings import SEFARIA_BOT_API_KEY
except ImportError:
    SEFARIA_BOT_API_KEY = None

from move_draft_text import ServerTextCopier


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument("category", help="category argument")
    parser.add_argument("--noindex", action="store_false", help="Specify this flag when you do not wish to create a new Index record at the destination")
    parser.add_argument("-v", "--versionlist", help="comma separated version list: lang:versionTitle. To copy all versions, simply input 'all'")
    parser.add_argument("-k", "--apikey", help="non default api key", default=SEFARIA_BOT_API_KEY)
    parser.add_argument("-d", "--destination_server", help="override destination server", default='http://eph.sefaria.org')
    parser.add_argument("-l", "--links", default=0, type=int, help="Enter '1' to move manual links on this text as well, '2' to move auto links")
    parser.add_argument("-c", "--commentator", default=None, help="Name of commentator with conjoining word if"
                                                                  "necessary. E.g. for Rashi on Tanakh, set to 'Rashi on '")

    args = parser.parse_args()
    print args
    if not args.apikey:
        raise argparse.ArgumentTypeError( 'The API key must be supplied or be present by default on the server' )
    if args.versionlist:
        if args.versionlist != 'all':
            version_arr = []
            for versionstr in args.versionlist.split("|"):
                lang_vtitle = versionstr.split(":")
                version_arr.append({'language': lang_vtitle[0], "versionTitle": lang_vtitle[1]})
            args.versionlist = version_arr
    titles = library.get_indexes_in_category(args.category)
    if args.commentator:
        titles = [args.commentator + title for title in titles]
    print titles
    for title in titles:
        copier = ServerTextCopier(args.destination_server, args.apikey, title, args.noindex, args.versionlist, args.links)
        copier.do_copy()
